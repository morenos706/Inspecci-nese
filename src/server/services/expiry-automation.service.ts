import "server-only";
import { db } from "@/server/db";
import { Prisma } from "@/generated/prisma/client";
import { audit } from "@/server/audit";
import { env } from "@/lib/env";
import { expiryISO } from "@/lib/expiry";
import { addDaysISO, formatDate, formatNumber, todayISO } from "@/lib/utils";
import { expiryWhere } from "@/server/services/elements.service";
import { dueDateFromISO } from "@/server/services/findings.service";
import { notify } from "@/server/services/notifications.service";
import { resolveResponsibleFor } from "@/server/services/responsibles";

/**
 * Genera automáticamente un hallazgo CRÍTICO + plan de acción por cada
 * elemento activo con vencimiento expirado (p.ej. recarga de extintor),
 * asignado al responsable del elemento.
 *
 * Idempotente: no crea otro si ya hay un hallazgo abierto por vencimiento
 * (automático o registrado en una inspección) y usa `dedupeKey` único por
 * elemento + fecha de vencimiento, así que puede ejecutarse muchas veces y
 * desde varias réplicas sin duplicar.
 */
export async function generateExpiryFindings(now = new Date()) {
  const today = todayISO(now, env.APP_TIMEZONE);
  const elements = await db.element.findMany({
    where: { deletedAt: null, ...expiryWhere("EXPIRED", today) },
    select: {
      id: true,
      code: true,
      name: true,
      expiresAt: true,
      expiryLabel: true,
      processId: true,
      siteId: true,
      responsibleId: true,
    },
  });

  let created = 0;
  let skipped = 0;
  for (const element of elements) {
    const expiresISO = expiryISO(element.expiresAt!);
    const dedupeKey = `expiry:${element.id}:${expiresISO}`;
    const existing = await db.finding.findFirst({
      where: {
        elementId: element.id,
        OR: [
          { dedupeKey },
          { status: { not: "CLOSED" }, OR: [{ source: "EXPIRY" }, { question: { tracksExpiry: true } }] },
        ],
      },
      select: { id: true },
    });
    if (existing) {
      skipped++;
      continue;
    }
    const responsibleId = await resolveResponsibleFor(element);
    if (!responsibleId) {
      console.warn(`[vencimientos] ${element.code}: no hay responsable disponible para asignar el plan`);
      skipped++;
      continue;
    }

    const concept = element.expiryLabel ?? "Vencimiento";
    const dueDate = dueDateFromISO(addDaysISO(today, 1));
    const requiredAction = `Gestionar ${concept.toLowerCase()} de ${element.code} y registrar la nueva fecha de vencimiento. Mientras tanto, disponer de un elemento de respaldo.`;
    try {
      await db.$transaction(async (tx) => {
        const finding = await tx.finding.create({
          data: {
            elementId: element.id,
            processId: element.processId,
            siteId: element.siteId,
            source: "EXPIRY",
            dedupeKey,
            priority: "CRITICAL",
            description: `${concept} vencida desde el ${formatDate(element.expiresAt)} (detectado automáticamente).`,
            requiredAction,
            responsibleId,
            dueDate,
          },
          select: { id: true, number: true },
        });
        const plan = await tx.actionPlan.create({
          data: { findingId: finding.id, action: requiredAction, responsibleId, dueDate },
          select: { id: true, number: true },
        });
        await tx.actionPlanEvent.create({
          data: { actionPlanId: plan.id, toStatus: "PENDING", comment: "Plan generado automáticamente por vencimiento." },
        });
        await audit(
          { userId: null },
          {
            action: "finding.auto_expiry",
            entityType: "Finding",
            entityId: finding.id,
            after: { elementId: element.id, expiresAt: expiresISO, responsibleId, actionPlanId: plan.id },
          },
          tx,
        );
        await notify(
          {
            userIds: [responsibleId],
            type: "action_plan.assigned",
            title: `ALERTA CRÍTICA: ${concept} vencida en ${element.code}`,
            body: `Se te asignó el plan de acción ${formatNumber(plan.number)}. Fecha límite: ${formatDate(dueDate)}.`,
            link: `/action-plans/${plan.id}`,
          },
          tx,
        );
      });
      created++;
    } catch (error) {
      // Otra ejecución concurrente ya lo creó (dedupeKey único).
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        skipped++;
        continue;
      }
      throw error;
    }
  }
  return { checked: elements.length, created, skipped };
}

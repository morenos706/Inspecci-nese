import "server-only";
import { db } from "@/server/db";
import { audit } from "@/server/audit";
import { AuthorizationError, DomainError, NotFoundError, ValidationError } from "@/server/errors";
import { env } from "@/lib/env";
import { todayISO } from "@/lib/utils";
import type { FindingFromAnswerInput } from "@/lib/validation/findings";
import { auditCtx, type ServiceContext } from "@/server/services/context";
import { storage } from "@/server/storage";

/** Fecha límite "YYYY-MM-DD" → instante guardado (mediodía UTC, estable en cualquier zona horaria de América). */
export const dueDateFromISO = (iso: string) => new Date(`${iso}T12:00:00.000Z`);

/**
 * Registra un hallazgo desde una respuesta que NO cumple, durante la
 * inspección. Crea también el primer plan de acción (acción requerida,
 * responsable, fecha límite), que el responsable gestiona en la Fase 4.
 */
export async function createFindingFromAnswer(input: FindingFromAnswerInput, ctx: ServiceContext) {
  if (!ctx.user.permissions.has("findings.create")) throw new AuthorizationError();
  const answer = await db.inspectionAnswer.findFirst({
    where: { id: input.answerId, inspectionId: input.inspectionId },
    select: {
      id: true,
      isCompliant: true,
      questionId: true,
      inspection: { select: { id: true, status: true, inspectorId: true, elementId: true, processId: true, siteId: true } },
    },
  });
  if (!answer) throw new NotFoundError("La respuesta no existe.");
  const { inspection } = answer;
  if (inspection.inspectorId !== ctx.user.id) throw new AuthorizationError("Solo quien realiza la inspección puede registrar hallazgos en ella.");
  if (inspection.status !== "IN_PROGRESS") throw new DomainError("La inspección ya fue finalizada.");
  if (answer.isCompliant !== false) throw new DomainError("Solo se registran hallazgos en respuestas que no cumplen.");
  if (input.dueDate < todayISO(new Date(), env.APP_TIMEZONE)) {
    throw new ValidationError({ dueDate: ["La fecha límite no puede ser anterior a hoy"] });
  }
  const responsible = await db.user.findFirst({
    where: { id: input.responsibleId, active: true, deletedAt: null },
    select: { id: true },
  });
  if (!responsible) throw new ValidationError({ responsibleId: ["Responsable inválido o inactivo"] });

  const dueDate = dueDateFromISO(input.dueDate);
  return db.$transaction(async (tx) => {
    const finding = await tx.finding.create({
      data: {
        inspectionId: inspection.id,
        answerId: answer.id,
        questionId: answer.questionId,
        elementId: inspection.elementId,
        processId: inspection.processId,
        siteId: inspection.siteId,
        description: input.description,
        priority: input.priority,
        requiredAction: input.requiredAction,
        responsibleId: responsible.id,
        dueDate,
        createdById: ctx.user.id,
      },
      select: { id: true, number: true },
    });
    const plan = await tx.actionPlan.create({
      data: {
        findingId: finding.id,
        action: input.requiredAction,
        responsibleId: responsible.id,
        dueDate,
        createdById: ctx.user.id,
      },
      select: { id: true },
    });
    await tx.actionPlanEvent.create({
      data: { actionPlanId: plan.id, userId: ctx.user.id, toStatus: "PENDING", comment: "Plan creado desde la inspección" },
    });
    await audit(
      auditCtx(ctx),
      { action: "finding.create", entityType: "Finding", entityId: finding.id, after: { ...input, actionPlanId: plan.id } },
      tx,
    );
    return finding;
  });
}

/**
 * Elimina un hallazgo mientras su inspección sigue en curso (p.ej. el
 * brigadista corrigió la respuesta). Después de finalizar, los hallazgos
 * solo cambian de estado; nunca se borran.
 */
export async function deleteDraftFinding(findingId: string, ctx: ServiceContext) {
  const finding = await db.finding.findFirst({
    where: { id: findingId },
    select: {
      id: true,
      number: true,
      description: true,
      inspection: { select: { status: true, inspectorId: true } },
      evidences: { select: { id: true, storageKey: true } },
      actionPlans: { select: { id: true, _count: { select: { evidences: true } } } },
    },
  });
  if (!finding || !finding.inspection) throw new NotFoundError("El hallazgo no existe.");
  if (finding.inspection.inspectorId !== ctx.user.id) throw new AuthorizationError();
  if (finding.inspection.status !== "IN_PROGRESS") {
    throw new DomainError("La inspección ya fue finalizada; el hallazgo se gestiona desde su plan de acción.");
  }
  if (finding.actionPlans.some((p) => p._count.evidences > 0)) {
    throw new DomainError("El plan de acción ya tiene evidencias; no se puede eliminar el hallazgo.");
  }
  const planIds = finding.actionPlans.map((p) => p.id);
  await db.$transaction(async (tx) => {
    await tx.evidence.deleteMany({ where: { findingId } });
    await tx.actionPlanEvent.deleteMany({ where: { actionPlanId: { in: planIds } } });
    await tx.actionPlan.deleteMany({ where: { id: { in: planIds } } });
    await tx.finding.delete({ where: { id: findingId } });
    await audit(
      auditCtx(ctx),
      { action: "finding.delete_draft", entityType: "Finding", entityId: findingId, before: { number: finding.number, description: finding.description } },
      tx,
    );
  });
  // Los objetos del bucket se borran después de confirmar la transacción.
  await Promise.allSettled(finding.evidences.map((e) => storage().delete(e.storageKey)));
}

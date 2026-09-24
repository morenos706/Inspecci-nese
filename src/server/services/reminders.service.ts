import "server-only";
import { db } from "@/server/db";
import { env } from "@/lib/env";
import { expiryDateFromISO, expiryISO } from "@/lib/expiry";
import { DIGEST_HOUR, PLAN_DUE_SOON_DAYS } from "@/lib/notifications";
import { addDaysISO, formatDate, formatNumber, todayISO } from "@/lib/utils";
import { expiryWhere, scheduleWhere } from "@/server/services/elements.service";
import { notify, usersWithPermissionInProcess } from "@/server/services/notifications.service";
import { resolveResponsibleFor } from "@/server/services/responsibles";
import type { Prisma } from "@/generated/prisma/client";

const OPEN: Prisma.ActionPlanWhereInput = { status: { in: ["PENDING", "IN_PROGRESS"] } };

function localHour(now: Date, timeZone: string): number {
  return Number(new Intl.DateTimeFormat("en-US", { hour: "numeric", hourCycle: "h23", timeZone }).format(now));
}

function daysBetween(fromISO: string, toISO: string): number {
  return Math.round((Date.parse(`${toISO}T00:00:00Z`) - Date.parse(`${fromISO}T00:00:00Z`)) / 86_400_000);
}

/**
 * Recordatorios programados. Idempotentes gracias a `dedupeKey`: se pueden
 * ejecutar cada hora (o desde varias réplicas) y cada aviso llega una sola vez.
 *  - Planes que vencen en ≤ PLAN_DUE_SOON_DAYS días → responsable.
 *  - Planes vencidos → responsable y gestores del proceso (se repite cada 7 días).
 *  - Elementos por vencer (recarga, caducidad) → responsable, a 30 y a 7 días.
 *  - Resumen diario de inspecciones vencidas / por vencer → brigadistas y
 *    responsables de proceso (desde las DIGEST_HOUR hora local).
 */
export async function generateReminders(now = new Date()) {
  const today = todayISO(now, env.APP_TIMEZONE);
  const todayNoon = expiryDateFromISO(today);
  const result = { planDueSoon: 0, planOverdue: 0, expirySoon: 0, digests: 0 };

  // --- Planes por vencer -----------------------------------------------------
  const dueSoon = await db.actionPlan.findMany({
    where: { ...OPEN, dueDate: { gte: todayNoon, lte: expiryDateFromISO(addDaysISO(today, PLAN_DUE_SOON_DAYS)) } },
    select: { id: true, number: true, action: true, dueDate: true, responsibleId: true, finding: { select: { element: { select: { code: true } } } } },
  });
  for (const plan of dueSoon) {
    const dueISO = expiryISO(plan.dueDate);
    const days = daysBetween(today, dueISO);
    const when = days === 0 ? "hoy" : days === 1 ? "mañana" : `en ${days} días`;
    result.planDueSoon += await notify({
      userIds: [plan.responsibleId],
      type: "action_plan.due_soon",
      title: `El plan ${formatNumber(plan.number)} vence ${when}`,
      body: `${plan.finding.element.code}: ${plan.action}\nFecha límite: ${formatDate(plan.dueDate)}.`,
      link: `/action-plans/${plan.id}`,
      dedupeKey: `action_plan.due_soon:${plan.id}:${dueISO}`,
    });
  }

  // --- Planes vencidos -------------------------------------------------------
  const overdue = await db.actionPlan.findMany({
    where: { ...OPEN, dueDate: { lt: todayNoon } },
    select: {
      id: true,
      number: true,
      action: true,
      dueDate: true,
      responsibleId: true,
      responsible: { select: { name: true } },
      finding: { select: { processId: true, element: { select: { code: true } } } },
    },
  });
  const managersByProcess = new Map<string, string[]>();
  for (const plan of overdue) {
    const dueISO = expiryISO(plan.dueDate);
    const daysLate = daysBetween(dueISO, today);
    const week = Math.floor((daysLate - 1) / 7);
    let managers = managersByProcess.get(plan.finding.processId);
    if (!managers) {
      managers = await usersWithPermissionInProcess("actions.manage", plan.finding.processId, "actions.read.all");
      managersByProcess.set(plan.finding.processId, managers);
    }
    result.planOverdue += await notify({
      userIds: [plan.responsibleId, ...managers],
      type: "action_plan.overdue",
      title: `Plan ${formatNumber(plan.number)} vencido hace ${daysLate} día${daysLate === 1 ? "" : "s"}`,
      body: `${plan.finding.element.code}: ${plan.action}\nResponsable: ${plan.responsible.name}. Fecha límite: ${formatDate(plan.dueDate)}.`,
      link: `/action-plans/${plan.id}`,
      dedupeKey: `action_plan.overdue:${plan.id}:${dueISO}:w${week}`,
    });
  }

  // --- Elementos por vencer (antes de que se vuelvan alerta crítica) ---------
  const expiring = await db.element.findMany({
    where: { deletedAt: null, ...expiryWhere("EXPIRING", today) },
    select: { id: true, code: true, name: true, expiresAt: true, expiryLabel: true, responsibleId: true, processId: true },
  });
  for (const element of expiring) {
    const expISO = expiryISO(element.expiresAt!);
    const days = daysBetween(today, expISO);
    const stage = days <= 7 ? "7" : "30";
    const responsibleId = await resolveResponsibleFor(element);
    const concept = element.expiryLabel ?? "Vencimiento";
    result.expirySoon += await notify({
      userIds: [responsibleId],
      type: "element.expiry_soon",
      title: `${concept} de ${element.code} vence ${days === 0 ? "hoy" : `en ${days} día${days === 1 ? "" : "s"}`}`,
      body: `${element.name}. Fecha de vencimiento: ${formatDate(element.expiresAt)}. Programa la gestión para evitar la alerta crítica.`,
      link: `/inventory/${element.id}`,
      dedupeKey: `element.expiry_soon:${element.id}:${expISO}:${stage}`,
    });
  }

  // --- Resumen diario de inspecciones ---------------------------------------
  if (localHour(now, env.APP_TIMEZONE) >= DIGEST_HOUR) result.digests = await inspectionDigests(today, now);

  return result;
}

async function inspectionDigests(today: string, now: Date): Promise<number> {
  const hasPerm = (code: string): Prisma.UserWhereInput => ({
    roles: { some: { role: { active: true, permissions: { some: { permission: { code } } } } } },
  });
  const active: Prisma.ElementWhereInput = { deletedAt: null };

  // Brigadistas: cualquier brigadista puede inspeccionar cualquier zona → totales globales por zona.
  const [overdueByZone, dueSoonCount] = await Promise.all([
    db.element.groupBy({ by: ["zoneId"], where: { AND: [active, scheduleWhere("OVERDUE", now)] }, _count: { _all: true } }),
    db.element.count({ where: { AND: [active, scheduleWhere("DUE_SOON", now)] } }),
  ]);
  const overdueCount = overdueByZone.reduce((a, z) => a + z._count._all, 0);
  let sent = 0;
  if (overdueCount + dueSoonCount > 0) {
    const zoneIds = overdueByZone.map((z) => z.zoneId).filter((id): id is string => Boolean(id));
    const zones = await db.zone.findMany({ where: { id: { in: zoneIds } }, select: { id: true, name: true, site: { select: { name: true } } } });
    const zoneName = new Map(zones.map((z) => [z.id, `${z.site.name} · ${z.name}`]));
    const top = overdueByZone
      .sort((a, b) => b._count._all - a._count._all)
      .slice(0, 5)
      .map((z) => `• ${z.zoneId ? (zoneName.get(z.zoneId) ?? "Zona") : "Sin zona"}: ${z._count._all} vencida(s)`);
    const inspectors = await db.user.findMany({
      where: { active: true, deletedAt: null, ...hasPerm("inspections.perform") },
      select: { id: true },
    });
    sent += await notify({
      userIds: inspectors.map((u) => u.id),
      type: overdueCount > 0 ? "inspections.overdue" : "inspections.digest",
      title: `Inspecciones: ${overdueCount} vencida${overdueCount === 1 ? "" : "s"} y ${dueSoonCount} por vencer`,
      body: top.length > 0 ? `Zonas con más pendientes:\n${top.join("\n")}` : "Revisa tu lista de inspecciones del día.",
      link: "/inspections",
      dedupeKey: `inspections.digest:${today}`,
    });
  }

  // Responsables de proceso (sin realizar inspecciones): solo sus procesos y solo si hay vencidas.
  const owners = await db.user.findMany({
    where: {
      active: true,
      deletedAt: null,
      AND: [hasPerm("inspections.read.process"), { NOT: hasPerm("inspections.perform") }],
    },
    select: { id: true, processes: { select: { processId: true } } },
  });
  for (const owner of owners) {
    const processIds = owner.processes.map((p) => p.processId);
    if (processIds.length === 0) continue;
    const count = await db.element.count({
      where: { AND: [active, { processId: { in: processIds } }, scheduleWhere("OVERDUE", now)] },
    });
    if (count === 0) continue;
    sent += await notify({
      userIds: [owner.id],
      type: "inspections.overdue",
      title: `${count} inspección${count === 1 ? "" : "es"} vencida${count === 1 ? "" : "s"} en tus procesos`,
      body: "Coordina con los brigadistas para ponerlas al día.",
      link: "/inventory?schedule=OVERDUE",
      dedupeKey: `inspections.process_overdue:${today}`,
    });
  }
  return sent;
}

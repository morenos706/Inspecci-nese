import "server-only";
import { z } from "zod";
import { db } from "@/server/db";
import type { Prisma, Priority, WorkflowStatus } from "@/generated/prisma/client";
import { AuthorizationError } from "@/server/errors";
import { getReadScope, type CurrentUser } from "@/server/auth/current-user";
import { env } from "@/lib/env";
import { average, countBy, monthKey, monthsBetween, pct, programCompliance } from "@/lib/indicators";
import { todayISO, zonedDayBoundary } from "@/lib/utils";
import { expiryWhere, scheduleWhere } from "@/server/services/elements.service";
import { dueDateFromISO } from "@/server/services/findings.service";

const ISO = /^\d{4}-\d{2}-\d{2}$/;

/** Filtros del dashboard (GET): se aplican a TODOS los indicadores de la página. */
export const indicatorFiltersSchema = z.object({
  from: z.string().regex(ISO).optional().catch(undefined),
  to: z.string().regex(ISO).optional().catch(undefined),
  process: z.string().max(64).optional().catch(undefined),
  site: z.string().max(64).optional().catch(undefined),
  type: z.string().max(64).optional().catch(undefined),
  responsible: z.string().max(64).optional().catch(undefined),
  status: z.enum(["open", "closed", "PENDING", "IN_PROGRESS", "SOLVED", "VERIFIED", "CLOSED"]).optional().catch(undefined),
});
export type IndicatorFilters = z.infer<typeof indicatorFiltersSchema>;

/** Periodo por defecto: últimos 12 meses (desde el día 1 del mes, 11 meses atrás). */
export function resolvePeriod(filters: IndicatorFilters) {
  const today = todayISO(new Date(), env.APP_TIMEZONE);
  const to = filters.to && filters.to <= today ? filters.to : today;
  const [y, m] = to.split("-").map(Number) as [number, number];
  const d = new Date(Date.UTC(y, m - 1 - 11, 1));
  const defaultFrom = d.toISOString().slice(0, 10);
  const from = filters.from && filters.from <= to ? filters.from : defaultFrom;
  return { from, to, today };
}

/** Restricción por proceso según el alcance del usuario (gerencia ve todo; responsable de proceso, lo suyo). */
function processRestriction(user: CurrentUser): string[] | null {
  if (!user.permissions.has("dashboard.view")) throw new AuthorizationError();
  const scopes = [getReadScope(user, "inspections"), getReadScope(user, "findings")];
  return scopes.includes("all") ? null : user.processIds;
}

export async function getIndicators(filters: IndicatorFilters, user: CurrentUser) {
  const allowed = processRestriction(user);
  const { from, to, today } = resolvePeriod(filters);
  const start = zonedDayBoundary(from, "start", env.APP_TIMEZONE);
  const end = zonedDayBoundary(to, "end", env.APP_TIMEZONE);
  const now = new Date();

  const processIn = (field: string): Record<string, unknown> =>
    filters.process
      ? allowed && !allowed.includes(filters.process)
        ? { [field]: "__none__" }
        : { [field]: filters.process }
      : allowed
        ? { [field]: { in: allowed } }
        : {};

  // ---- Filtros por entidad (misma semántica en todas las consultas)
  const elementWhere: Prisma.ElementWhereInput = {
    deletedAt: null,
    ...processIn("processId"),
    ...(filters.site ? { siteId: filters.site } : {}),
    ...(filters.type ? { elementTypeId: filters.type } : {}),
    ...(filters.responsible ? { responsibleId: filters.responsible } : {}),
  };
  const inspectionWhere: Prisma.InspectionWhereInput = {
    status: "COMPLETED",
    completedAt: { gte: start, lte: end },
    ...processIn("processId"),
    ...(filters.site ? { siteId: filters.site } : {}),
    ...(filters.type || filters.responsible
      ? {
          element: {
            ...(filters.type ? { elementTypeId: filters.type } : {}),
            ...(filters.responsible ? { responsibleId: filters.responsible } : {}),
          },
        }
      : {}),
  };
  const findingStatus: Prisma.FindingWhereInput =
    filters.status === "open"
      ? { status: { not: "CLOSED" } }
      : filters.status === "closed"
        ? { status: "CLOSED" }
        : filters.status
          ? { status: filters.status }
          : {};
  const findingBase: Prisma.FindingWhereInput = {
    ...processIn("processId"),
    ...(filters.site ? { siteId: filters.site } : {}),
    ...(filters.type ? { element: { elementTypeId: filters.type } } : {}),
    ...(filters.responsible ? { responsibleId: filters.responsible } : {}),
  };
  const findingWhere: Prisma.FindingWhereInput = { ...findingBase, ...findingStatus, createdAt: { gte: start, lte: end } };
  const planWhere: Prisma.ActionPlanWhereInput = {
    createdAt: { gte: start, lte: end },
    ...(filters.status && !["open", "closed"].includes(filters.status) ? { status: filters.status as WorkflowStatus } : {}),
    ...(filters.status === "open" ? { status: { not: "CLOSED" } } : {}),
    ...(filters.status === "closed" ? { status: "CLOSED" } : {}),
    ...(filters.responsible ? { responsibleId: filters.responsible } : {}),
    finding: {
      ...processIn("processId"),
      ...(filters.site ? { siteId: filters.site } : {}),
      ...(filters.type ? { element: { elementTypeId: filters.type } } : {}),
    },
  };

  const [
    overdueNow,
    dueSoonNow,
    expiredNow,
    activeElements,
    inspections,
    findings,
    closedFindings,
    plans,
    overdueByProcess,
    overdueBySite,
    processes,
    sites,
  ] = await Promise.all([
    db.element.count({ where: { AND: [elementWhere, scheduleWhere("OVERDUE", now)] } }),
    db.element.count({ where: { AND: [elementWhere, scheduleWhere("DUE_SOON", now)] } }),
    db.element.count({ where: { AND: [elementWhere, expiryWhere("EXPIRED", today)] } }),
    db.element.count({ where: { ...elementWhere, status: "ACTIVE" } }),
    db.inspection.findMany({
      where: inspectionWhere,
      select: { completedAt: true, compliancePct: true, result: true, processId: true, siteId: true },
    }),
    db.finding.findMany({
      where: findingWhere,
      select: { priority: true, status: true, source: true, processId: true, siteId: true, createdAt: true },
    }),
    db.finding.findMany({
      where: { ...findingBase, closedAt: { gte: start, lte: end } },
      select: { closedAt: true },
    }),
    db.actionPlan.findMany({ where: planWhere, select: { status: true, dueDate: true } }),
    db.element.groupBy({
      by: ["processId"],
      where: { AND: [elementWhere, scheduleWhere("OVERDUE", now)] },
      _count: { _all: true },
    }),
    db.element.groupBy({
      by: ["siteId"],
      where: { AND: [elementWhere, scheduleWhere("OVERDUE", now)] },
      _count: { _all: true },
    }),
    db.process.findMany({
      where: { deletedAt: null, ...(allowed ? { id: { in: allowed } } : {}) },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    db.site.findMany({ where: { deletedAt: null }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);

  // ---- Inspecciones
  const done = inspections.length;
  const pcts = inspections.filter((i) => i.compliancePct !== null).map((i) => Number(i.compliancePct));
  const compliantInspections = inspections.filter((i) => i.result === "COMPLIANT").length;

  // ---- Hallazgos
  const isOpen = (s: WorkflowStatus) => s !== "CLOSED";
  const openFindings = findings.filter((f) => isOpen(f.status));
  const priorities: Priority[] = ["CRITICAL", "HIGH", "MEDIUM", "LOW"];
  const byPriority = countBy(findings, (f) => f.priority);

  // ---- Planes
  const todayNoon = dueDateFromISO(today);
  const planStatuses: WorkflowStatus[] = ["PENDING", "IN_PROGRESS", "SOLVED", "VERIFIED", "CLOSED"];
  const plansByStatus = countBy(plans, (p) => p.status);
  const overduePlans = plans.filter((p) => (p.status === "PENDING" || p.status === "IN_PROGRESS") && p.dueDate < todayNoon).length;

  // ---- Por proceso y por sede
  function breakdown(key: "processId" | "siteId", entities: { id: string; name: string }[], overdue: Map<string, number>) {
    return entities
      .map((e) => {
        const ins = inspections.filter((i) => i[key] === e.id);
        const insPcts = ins.filter((i) => i.compliancePct !== null).map((i) => Number(i.compliancePct));
        return {
          id: e.id,
          name: e.name,
          inspections: ins.length,
          avgCompliance: average(insPcts),
          compliantShare: pct(ins.filter((i) => i.result === "COMPLIANT").length, ins.length),
          openFindings: openFindings.filter((f) => f[key] === e.id).length,
          overdueElements: overdue.get(e.id) ?? 0,
        };
      })
      .filter((r) => r.inspections + r.openFindings + r.overdueElements > 0);
  }
  const byProcess = breakdown(
    "processId",
    filters.process ? processes.filter((p) => p.id === filters.process) : processes,
    new Map(overdueByProcess.map((r) => [r.processId, r._count._all])),
  );
  const bySite = breakdown(
    "siteId",
    filters.site ? sites.filter((s) => s.id === filters.site) : sites,
    new Map(overdueBySite.map((r) => [r.siteId, r._count._all])),
  );

  // ---- Tendencia mensual
  const months = monthsBetween(from, to, 24);
  const tz = env.APP_TIMEZONE;
  const insByMonth = new Map<string, number[]>();
  for (const i of inspections) {
    const k = monthKey(i.completedAt!, tz);
    const list = insByMonth.get(k) ?? [];
    list.push(i.compliancePct === null ? NaN : Number(i.compliancePct));
    insByMonth.set(k, list);
  }
  const createdByMonth = countBy(findings, (f) => monthKey(f.createdAt, tz));
  const closedByMonth = countBy(closedFindings, (f) => (f.closedAt ? monthKey(f.closedAt, tz) : null));
  const trend = months.map((m) => {
    const list = insByMonth.get(m) ?? [];
    return {
      month: m,
      inspections: list.length,
      avgCompliance: average(list.filter((v) => !Number.isNaN(v))),
      findingsCreated: createdByMonth.get(m) ?? 0,
      findingsClosed: closedByMonth.get(m) ?? 0,
    };
  });

  return {
    period: { from, to, today },
    program: {
      done,
      pending: dueSoonNow,
      overdue: overdueNow,
      activeElements,
      expired: expiredNow,
      compliance: programCompliance(done, dueSoonNow, overdueNow),
    },
    inspections: { done, avgCompliance: average(pcts), compliantShare: pct(compliantInspections, done) },
    findings: {
      total: findings.length,
      open: openFindings.length,
      closed: findings.length - openFindings.length,
      criticalOpen: openFindings.filter((f) => f.priority === "CRITICAL").length,
      automatic: findings.filter((f) => f.source === "EXPIRY").length,
      byPriority: priorities.map((p) => ({ key: p, value: byPriority.get(p) ?? 0 })),
    },
    plans: {
      total: plans.length,
      overdue: overduePlans,
      byStatus: planStatuses.map((s) => ({ key: s, value: plansByStatus.get(s) ?? 0 })),
    },
    byProcess,
    bySite,
    trend,
  };
}

export type Indicators = Awaited<ReturnType<typeof getIndicators>>;

/** Opciones de los filtros (respetando el alcance). */
export async function getIndicatorFilterOptions(user: CurrentUser) {
  const allowed = processRestriction(user);
  const [processes, sites, types, users] = await Promise.all([
    db.process.findMany({
      where: { deletedAt: null, ...(allowed ? { id: { in: allowed } } : {}) },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    db.site.findMany({ where: { deletedAt: null }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    db.elementType.findMany({ where: { deletedAt: null }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    db.user.findMany({ where: { deletedAt: null, active: true }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);
  return { processes, sites, types, users };
}

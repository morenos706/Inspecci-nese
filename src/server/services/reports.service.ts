import "server-only";
import { db } from "@/server/db";
import type { Prisma } from "@/generated/prisma/client";
import { AuthorizationError } from "@/server/errors";
import { getReadScope, type CurrentUser } from "@/server/auth/current-user";
import { env } from "@/lib/env";
import { EXPIRY_STATUS_LABELS, expiryStatus } from "@/lib/expiry";
import { formatAnswerValue } from "@/lib/inspection-rules";
import {
  ELEMENT_STATUS_LABELS,
  FINDING_SOURCE_LABELS,
  INSPECTION_RESULT_LABELS,
  INSPECTION_STATUS_LABELS,
  PRIORITY_LABELS,
  WORKFLOW_STATUS_LABELS,
} from "@/lib/labels";
import { FREQUENCY_LABELS, SCHEDULE_STATUS_LABELS, scheduleStatus } from "@/lib/scheduling";
import { formatDate, formatDateTime, formatNumber, todayISO, zonedDayBoundary } from "@/lib/utils";
import { isPlanOverdue } from "@/lib/workflow";
import { PdfBuilder } from "@/server/reports/pdf";
import type { Cell, TableReport } from "@/server/reports/types";
import { actionPlanScopeWhere } from "@/server/services/action-plans.service";
import { elementScopeWhere } from "@/server/services/elements.service";
import { findingScopeWhere } from "@/server/services/findings.service";
import { getIndicators, resolvePeriod, type IndicatorFilters } from "@/server/services/indicators.service";
import { getInspectionDetail, inspectionScopeWhere } from "@/server/services/inspections.service";
import { storage } from "@/server/storage";

export const REPORT_ROW_LIMIT = 5000;

export const REPORT_KINDS = ["inspections", "findings", "action-plans", "inventory", "compliance"] as const;
export type ReportKind = (typeof REPORT_KINDS)[number];

export async function reportMeta(user: CurrentUser) {
  const setting = await db.systemSetting.findUnique({ where: { key: "organization.name" }, select: { value: true } });
  return {
    organization: typeof setting?.value === "string" ? setting.value : "Inspecciones de Emergencia",
    generatedBy: user.name,
    generatedAt: formatDateTime(new Date()),
  };
}

/** Texto legible de los filtros aplicados (para el subtítulo del reporte). */
async function describeFilters(f: IndicatorFilters, withPeriod = true) {
  const { from, to } = resolvePeriod(f);
  const [process, site, type, responsible] = await Promise.all([
    f.process ? db.process.findUnique({ where: { id: f.process }, select: { name: true } }) : null,
    f.site ? db.site.findUnique({ where: { id: f.site }, select: { name: true } }) : null,
    f.type ? db.elementType.findUnique({ where: { id: f.type }, select: { name: true } }) : null,
    f.responsible ? db.user.findUnique({ where: { id: f.responsible }, select: { name: true } }) : null,
  ]);
  const parts = [
    withPeriod ? `Periodo ${formatDate(`${from}T12:00:00Z`)} – ${formatDate(`${to}T12:00:00Z`)}` : null,
    process && `Proceso: ${process.name}`,
    site && `Sede: ${site.name}`,
    type && `Tipo: ${type.name}`,
    responsible && `Responsable: ${responsible.name}`,
  ].filter(Boolean);
  return parts.join(" · ") || "Sin filtros";
}

function period(f: IndicatorFilters) {
  const { from, to } = resolvePeriod(f);
  return { gte: zonedDayBoundary(from, "start", env.APP_TIMEZONE), lte: zonedDayBoundary(to, "end", env.APP_TIMEZONE) };
}

function requireScope<T>(fn: () => T): T {
  try {
    return fn();
  } catch {
    throw new AuthorizationError("No tienes acceso a este reporte.");
  }
}

// ---------------------------------------------------------------------------
// Reportes tabulares
// ---------------------------------------------------------------------------

async function inspectionsReport(f: IndicatorFilters, user: CurrentUser): Promise<TableReport> {
  const where: Prisma.InspectionWhereInput = {
    AND: [
      requireScope(() => inspectionScopeWhere(user)),
      { status: "COMPLETED", completedAt: period(f) },
      f.process ? { processId: f.process } : {},
      f.site ? { siteId: f.site } : {},
      f.type ? { element: { elementTypeId: f.type } } : {},
      f.responsible ? { element: { responsibleId: f.responsible } } : {},
    ],
  };
  const rows = await db.inspection.findMany({
    where,
    orderBy: { completedAt: "desc" },
    take: REPORT_ROW_LIMIT,
    select: {
      number: true,
      completedAt: true,
      result: true,
      compliancePct: true,
      nonCompliantCount: true,
      inspector: { select: { name: true } },
      process: { select: { name: true } },
      site: { select: { name: true } },
      element: { select: { code: true, name: true, elementType: { select: { name: true } }, zone: { select: { name: true } } } },
      _count: { select: { findings: true } },
    },
  });
  const compliant = rows.filter((r) => r.result === "COMPLIANT").length;
  return {
    fileName: "reporte-inspecciones",
    title: "Reporte de inspecciones",
    subtitle: await describeFilters(f),
    summary: [
      ["Inspecciones realizadas", String(rows.length)],
      ["Sin novedad", `${compliant} (${rows.length ? Math.round((compliant / rows.length) * 100) : 0}%)`],
      ["Con no conformidades", String(rows.length - compliant)],
      ["Hallazgos registrados", String(rows.reduce((a, r) => a + r._count.findings, 0))],
    ],
    sections: [
      {
        columns: [
          { header: "N.º", width: 7 },
          { header: "Fecha", width: 10 },
          { header: "Elemento", width: 10 },
          { header: "Tipo", width: 10 },
          { header: "Sede", width: 12 },
          { header: "Zona", width: 14 },
          { header: "Proceso", width: 11 },
          { header: "Brigadista", width: 14 },
          { header: "Resultado", width: 9 },
          { header: "% cumpl.", width: 7, align: "right" },
          { header: "No conformes", width: 8, align: "right" },
          { header: "Hallazgos", width: 7, align: "right" },
        ],
        rows: rows.map((r): Cell[] => [
          formatNumber(r.number),
          formatDate(r.completedAt),
          r.element.code,
          r.element.elementType.name,
          r.site.name,
          r.element.zone?.name ?? "",
          r.process.name,
          r.inspector.name,
          r.result ? INSPECTION_RESULT_LABELS[r.result] : "",
          r.compliancePct === null ? null : Number(r.compliancePct),
          r.nonCompliantCount,
          r._count.findings,
        ]),
      },
    ],
  };
}

async function findingsReport(f: IndicatorFilters, user: CurrentUser): Promise<TableReport> {
  const where: Prisma.FindingWhereInput = {
    AND: [
      requireScope(() => findingScopeWhere(user)),
      { createdAt: period(f) },
      f.process ? { processId: f.process } : {},
      f.site ? { siteId: f.site } : {},
      f.type ? { element: { elementTypeId: f.type } } : {},
      f.responsible ? { responsibleId: f.responsible } : {},
      f.status === "open" ? { status: { not: "CLOSED" } } : f.status === "closed" ? { status: "CLOSED" } : f.status ? { status: f.status } : {},
    ],
  };
  const rows = await db.finding.findMany({
    where,
    orderBy: [{ priority: "desc" }, { createdAt: "desc" }],
    take: REPORT_ROW_LIMIT,
    select: {
      number: true,
      createdAt: true,
      description: true,
      priority: true,
      source: true,
      status: true,
      dueDate: true,
      closedAt: true,
      requiredAction: true,
      responsible: { select: { name: true } },
      process: { select: { name: true } },
      site: { select: { name: true } },
      element: { select: { code: true, elementType: { select: { name: true } }, zone: { select: { name: true } } } },
    },
  });
  const open = rows.filter((r) => r.status !== "CLOSED");
  return {
    fileName: "reporte-hallazgos",
    title: "Reporte de hallazgos",
    subtitle: await describeFilters(f),
    summary: [
      ["Hallazgos", String(rows.length)],
      ["Abiertos", String(open.length)],
      ["Críticos abiertos", String(open.filter((r) => r.priority === "CRITICAL").length)],
      ["Cerrados", String(rows.length - open.length)],
      ["Automáticos por vencimiento", String(rows.filter((r) => r.source === "EXPIRY").length)],
    ],
    sections: [
      {
        columns: [
          { header: "N.º", width: 7 },
          { header: "Registro", width: 9 },
          { header: "Elemento", width: 9 },
          { header: "Sede / zona", width: 14 },
          { header: "Proceso", width: 10 },
          { header: "Descripción", width: 24 },
          { header: "Acción requerida", width: 20 },
          { header: "Prioridad", width: 8 },
          { header: "Responsable", width: 12 },
          { header: "Límite", width: 9 },
          { header: "Estado", width: 9 },
          { header: "Cierre", width: 9 },
        ],
        rows: rows.map((r): Cell[] => [
          formatNumber(r.number),
          formatDate(r.createdAt),
          `${r.element.code} (${r.element.elementType.name})`,
          `${r.site.name}${r.element.zone ? ` · ${r.element.zone.name}` : ""}`,
          r.process.name,
          `${r.description}${r.source === "EXPIRY" ? ` [${FINDING_SOURCE_LABELS.EXPIRY}]` : ""}`,
          r.requiredAction ?? "",
          PRIORITY_LABELS[r.priority],
          r.responsible?.name ?? "",
          formatDate(r.dueDate),
          WORKFLOW_STATUS_LABELS[r.status],
          r.closedAt ? formatDate(r.closedAt) : "",
        ]),
      },
    ],
  };
}

async function actionPlansReport(f: IndicatorFilters, user: CurrentUser): Promise<TableReport> {
  const today = todayISO(new Date(), env.APP_TIMEZONE);
  const where: Prisma.ActionPlanWhereInput = {
    AND: [
      requireScope(() => actionPlanScopeWhere(user)),
      { createdAt: period(f) },
      f.process ? { finding: { processId: f.process } } : {},
      f.site ? { finding: { siteId: f.site } } : {},
      f.type ? { finding: { element: { elementTypeId: f.type } } } : {},
      f.responsible ? { responsibleId: f.responsible } : {},
      f.status === "open" ? { status: { not: "CLOSED" } } : f.status === "closed" ? { status: "CLOSED" } : f.status ? { status: f.status } : {},
    ],
  };
  const rows = await db.actionPlan.findMany({
    where,
    orderBy: [{ dueDate: "asc" }],
    take: REPORT_ROW_LIMIT,
    select: {
      number: true,
      action: true,
      status: true,
      createdAt: true,
      dueDate: true,
      solvedAt: true,
      closedAt: true,
      responsible: { select: { name: true } },
      verifiedBy: { select: { name: true } },
      finding: { select: { number: true, priority: true, element: { select: { code: true } }, process: { select: { name: true } } } },
    },
  });
  const overdue = rows.filter((r) => isPlanOverdue(r.status, r.dueDate, today));
  return {
    fileName: "reporte-planes-de-accion",
    title: "Reporte de planes de acción",
    subtitle: await describeFilters(f),
    summary: [
      ["Planes", String(rows.length)],
      ["Vencidos", String(overdue.length)],
      ...(["PENDING", "IN_PROGRESS", "SOLVED", "VERIFIED", "CLOSED"] as const).map(
        (s): [string, string] => [WORKFLOW_STATUS_LABELS[s], String(rows.filter((r) => r.status === s).length)],
      ),
    ],
    sections: [
      {
        columns: [
          { header: "Plan", width: 7 },
          { header: "Hallazgo", width: 7 },
          { header: "Elemento", width: 8 },
          { header: "Proceso", width: 10 },
          { header: "Acción", width: 28 },
          { header: "Prioridad", width: 8 },
          { header: "Responsable", width: 13 },
          { header: "Creado", width: 9 },
          { header: "Límite", width: 9 },
          { header: "Estado", width: 9 },
          { header: "Vencido", width: 6 },
          { header: "Solucionado", width: 9 },
          { header: "Verificó", width: 12 },
          { header: "Cerrado", width: 9 },
        ],
        rows: rows.map((r): Cell[] => [
          formatNumber(r.number),
          formatNumber(r.finding.number),
          r.finding.element.code,
          r.finding.process.name,
          r.action,
          PRIORITY_LABELS[r.finding.priority],
          r.responsible.name,
          formatDate(r.createdAt),
          formatDate(r.dueDate),
          WORKFLOW_STATUS_LABELS[r.status],
          isPlanOverdue(r.status, r.dueDate, today) ? "Sí" : "No",
          r.solvedAt ? formatDate(r.solvedAt) : "",
          r.verifiedBy?.name ?? "",
          r.closedAt ? formatDate(r.closedAt) : "",
        ]),
      },
    ],
  };
}

async function inventoryReport(f: IndicatorFilters, user: CurrentUser): Promise<TableReport> {
  const today = todayISO(new Date(), env.APP_TIMEZONE);
  const now = new Date();
  const rows = await db.element.findMany({
    where: {
      AND: [
        { deletedAt: null },
        requireScope(() => elementScopeWhere(user)),
        f.process ? { processId: f.process } : {},
        f.site ? { siteId: f.site } : {},
        f.type ? { elementTypeId: f.type } : {},
        f.responsible ? { responsibleId: f.responsible } : {},
      ],
    },
    orderBy: [{ site: { name: "asc" } }, { zone: { name: "asc" } }, { code: "asc" }],
    take: REPORT_ROW_LIMIT,
    select: {
      code: true,
      name: true,
      location: true,
      status: true,
      frequency: true,
      frequencyDays: true,
      lastInspectionAt: true,
      nextInspectionAt: true,
      expiresAt: true,
      expiryLabel: true,
      elementType: { select: { name: true } },
      process: { select: { name: true } },
      site: { select: { name: true } },
      zone: { select: { name: true } },
      responsible: { select: { name: true } },
    },
  });
  const active = rows.filter((r) => r.status === "ACTIVE");
  const sched = (r: (typeof rows)[number]) => scheduleStatus(r.nextInspectionAt, r.frequency, now, r.frequencyDays);
  return {
    fileName: "reporte-inventario",
    title: "Inventario y programación de inspecciones",
    subtitle: await describeFilters(f, false),
    summary: [
      ["Elementos", String(rows.length)],
      ["Activos", String(active.length)],
      ["Inspección vencida", String(active.filter((r) => sched(r) === "OVERDUE").length)],
      ["Próximos a vencer", String(active.filter((r) => sched(r) === "DUE_SOON").length)],
      ["Vencimiento expirado", String(active.filter((r) => expiryStatus(r.expiresAt, today) === "EXPIRED").length)],
    ],
    sections: [
      {
        columns: [
          { header: "Código", width: 8 },
          { header: "Tipo", width: 9 },
          { header: "Nombre", width: 15 },
          { header: "Sede / zona", width: 15 },
          { header: "Ubicación", width: 14 },
          { header: "Proceso", width: 9 },
          { header: "Responsable", width: 12 },
          { header: "Frecuencia", width: 8 },
          { header: "Última", width: 8 },
          { header: "Próxima", width: 8 },
          { header: "Programación", width: 9 },
          { header: "Vencimiento", width: 12 },
          { header: "Estado", width: 8 },
        ],
        rows: rows.map((r): Cell[] => {
          const exp = expiryStatus(r.expiresAt, today);
          return [
            r.code,
            r.elementType.name,
            r.name,
            `${r.site.name}${r.zone ? ` · ${r.zone.name}` : ""}`,
            r.location ?? "",
            r.process.name,
            r.responsible?.name ?? "",
            r.frequency === "CUSTOM" ? `Cada ${r.frequencyDays} días` : FREQUENCY_LABELS[r.frequency],
            formatDate(r.lastInspectionAt),
            r.status === "ACTIVE" ? formatDate(r.nextInspectionAt) : "",
            r.status === "ACTIVE" ? SCHEDULE_STATUS_LABELS[sched(r)] : "",
            exp === "NONE" ? "" : `${r.expiryLabel ?? "Vencimiento"}: ${formatDate(r.expiresAt)} (${EXPIRY_STATUS_LABELS[exp]})`,
            ELEMENT_STATUS_LABELS[r.status],
          ];
        }),
      },
    ],
  };
}

async function complianceReport(f: IndicatorFilters, user: CurrentUser): Promise<TableReport> {
  const data = await getIndicators(f, user);
  const pct = (v: number | null) => (v === null ? null : v);
  const breakdown = (rows: typeof data.byProcess): Cell[][] =>
    rows.map((r) => [r.name, pct(r.avgCompliance), r.inspections, pct(r.compliantShare), r.openFindings, r.overdueElements]);
  const columns = (first: string) => [
    { header: first, width: 20 },
    { header: "Cumplimiento %", width: 10, align: "right" as const },
    { header: "Inspecciones", width: 10, align: "right" as const },
    { header: "Sin novedad %", width: 10, align: "right" as const },
    { header: "Hallazgos abiertos", width: 10, align: "right" as const },
    { header: "Insp. vencidas", width: 10, align: "right" as const },
  ];
  const fmt = (v: number | null, s = "%") => (v === null ? "—" : `${v.toLocaleString("es-CO", { maximumFractionDigits: 1 })}${s}`);
  return {
    fileName: "reporte-cumplimiento",
    title: "Reporte de cumplimiento",
    subtitle: await describeFilters(f),
    summary: [
      ["Cumplimiento del programa", fmt(data.program.compliance)],
      ["Realizadas / pendientes / vencidas", `${data.program.done} / ${data.program.pending} / ${data.program.overdue}`],
      ["Cumplimiento promedio", fmt(data.inspections.avgCompliance)],
      ["Hallazgos abiertos (críticos)", `${data.findings.open} (${data.findings.criticalOpen})`],
      ["Planes vencidos", String(data.plans.overdue)],
    ],
    sections: [
      { heading: "Cumplimiento por proceso", columns: columns("Proceso"), rows: breakdown(data.byProcess) },
      { heading: "Cumplimiento por sede", columns: columns("Sede"), rows: breakdown(data.bySite) },
      {
        heading: "Tendencia mensual",
        columns: [
          { header: "Mes", width: 12 },
          { header: "Inspecciones", width: 10, align: "right" },
          { header: "Cumplimiento %", width: 10, align: "right" },
          { header: "Hallazgos registrados", width: 10, align: "right" },
          { header: "Hallazgos cerrados", width: 10, align: "right" },
        ],
        rows: data.trend.map((t) => [t.month, t.inspections, t.avgCompliance, t.findingsCreated, t.findingsClosed]),
      },
    ],
  };
}

export async function buildReport(kind: ReportKind, filters: IndicatorFilters, user: CurrentUser): Promise<TableReport> {
  switch (kind) {
    case "inspections":
      return inspectionsReport(filters, user);
    case "findings":
      return findingsReport(filters, user);
    case "action-plans":
      return actionPlansReport(filters, user);
    case "inventory":
      return inventoryReport(filters, user);
    case "compliance":
      return complianceReport(filters, user);
  }
}

// ---------------------------------------------------------------------------
// Informe de una inspección (PDF con fotos)
// ---------------------------------------------------------------------------

async function readImage(storageKey: string): Promise<Uint8Array | null> {
  const obj = await storage().get(storageKey);
  if (!obj) return null;
  const chunks: Uint8Array[] = [];
  const reader = obj.body.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
  }
  return Buffer.concat(chunks);
}

export async function buildInspectionPdf(inspectionId: string, user: CurrentUser) {
  const insp = await getInspectionDetail(inspectionId, user);
  const evidences = await db.evidence.findMany({
    where: {
      deletedAt: null,
      kind: "PHOTO",
      OR: [{ answer: { inspectionId } }, { finding: { inspectionId } }],
    },
    select: { id: true, storageKey: true, mimeType: true, answerId: true, findingId: true },
  });
  const meta = await reportMeta(user);
  const pdf = await PdfBuilder.create({ ...meta, title: `Inspección ${formatNumber(insp.number)}` });

  pdf.heading(
    `Informe de inspección ${formatNumber(insp.number)}`,
    `${insp.element.code} · ${insp.element.elementType.name} · ${insp.element.name}`,
  );
  pdf.keyValues([
    ["Resultado", insp.result ? `${INSPECTION_RESULT_LABELS[insp.result]}${insp.compliancePct !== null ? ` · ${Number(insp.compliancePct).toFixed(0)}%` : ""}` : INSPECTION_STATUS_LABELS[insp.status]],
    ["Fecha", formatDateTime(insp.completedAt ?? insp.startedAt)],
    ["Brigadista", insp.inspector.name],
    ["Sede / zona", `${insp.site.name}${insp.element.zone ? ` · ${insp.element.zone.name}` : ""}`],
    ["Ubicación", insp.element.location ?? "—"],
    ["Proceso", insp.process.name],
    ["Cumplen / no cumplen", `${insp.compliantCount} / ${insp.nonCompliantCount}`],
    ["Hallazgos", String(insp.findings.length)],
    ["Próxima inspección", formatDate(insp.element.nextInspectionAt)],
  ]);

  pdf.table({
    heading: "Respuestas",
    columns: [
      { header: "#", width: 4 },
      { header: "Pregunta", width: 46 },
      { header: "Respuesta", width: 18 },
      { header: "Cumple", width: 9 },
      { header: "Observación", width: 28 },
    ],
    rows: insp.answers.map((a, i) => [
      i + 1,
      a.questionText,
      a.responseType === "PHOTO"
        ? `${a.evidences.length} foto(s)`
        : formatAnswerValue({ responseType: a.responseType, options: a.question.options, complianceRule: a.question.complianceRule }, a.value),
      a.isCompliant === null ? "N/A" : a.isCompliant ? "Sí" : "No",
      a.comment ?? "",
    ]),
  });

  if (insp.notes) {
    pdf.text("Observaciones generales", { size: 11, bold: true });
    pdf.text(insp.notes, { size: 9, gap: 10 });
  }

  if (insp.findings.length) {
    pdf.table({
      heading: "Hallazgos",
      columns: [
        { header: "N.º", width: 8 },
        { header: "Descripción", width: 34 },
        { header: "Acción requerida", width: 28 },
        { header: "Prioridad", width: 9 },
        { header: "Responsable", width: 14 },
        { header: "Límite", width: 9 },
        { header: "Estado", width: 10 },
      ],
      rows: insp.findings.map((f) => [
        formatNumber(f.number),
        f.description,
        f.requiredAction ?? "",
        PRIORITY_LABELS[f.priority],
        f.responsible?.name ?? "",
        formatDate(f.dueDate),
        WORKFLOW_STATUS_LABELS[f.status],
      ]),
    });
  }

  // Registro fotográfico (JPG/PNG), agrupado: respuestas y hallazgos.
  const photos = [];
  for (const e of evidences.slice(0, 40)) {
    const bytes = await readImage(e.storageKey);
    const img = bytes ? await pdf.embedImage(bytes, e.mimeType) : null;
    if (img) photos.push(img);
  }
  if (photos.length) {
    pdf.text("Registro fotográfico", { size: 11, bold: true });
    pdf.images(photos, 150);
  }

  pdf.spacer(20);
  pdf.text("Firma del brigadista: ______________________________", { size: 9 });

  return { bytes: await pdf.save(), fileName: `inspeccion-${insp.number}-${insp.element.code}` };
}

// ---------------------------------------------------------------------------
// Historial de un elemento
// ---------------------------------------------------------------------------

export async function buildElementHistoryReport(elementId: string, user: CurrentUser): Promise<TableReport> {
  const element = await db.element.findFirst({
    where: { AND: [{ id: elementId, deletedAt: null }, requireScope(() => elementScopeWhere(user))] },
    select: {
      id: true,
      code: true,
      name: true,
      location: true,
      status: true,
      frequency: true,
      frequencyDays: true,
      lastInspectionAt: true,
      nextInspectionAt: true,
      expiresAt: true,
      expiryLabel: true,
      elementType: { select: { name: true } },
      site: { select: { name: true } },
      zone: { select: { name: true } },
      process: { select: { name: true } },
      responsible: { select: { name: true } },
    },
  });
  if (!element) throw new AuthorizationError("El elemento no existe o no tienes acceso a él.");
  const canInspections = getReadScope(user, "inspections") !== null;
  const canFindings = getReadScope(user, "findings") !== null;
  const [inspections, findings] = await Promise.all([
    canInspections
      ? db.inspection.findMany({
          where: { AND: [{ elementId, status: "COMPLETED" }, inspectionScopeWhere(user)] },
          orderBy: { completedAt: "desc" },
          take: REPORT_ROW_LIMIT,
          select: { number: true, completedAt: true, result: true, compliancePct: true, nonCompliantCount: true, inspector: { select: { name: true } } },
        })
      : [],
    canFindings
      ? db.finding.findMany({
          where: { AND: [{ elementId }, findingScopeWhere(user)] },
          orderBy: { createdAt: "desc" },
          take: REPORT_ROW_LIMIT,
          select: { number: true, createdAt: true, description: true, priority: true, status: true, closedAt: true, responsible: { select: { name: true } } },
        })
      : [],
  ]);
  const today = todayISO(new Date(), env.APP_TIMEZONE);
  const exp = expiryStatus(element.expiresAt, today);
  return {
    fileName: `historial-${element.code}`,
    title: `Historial del elemento ${element.code}`,
    subtitle: `${element.elementType.name} · ${element.name} · ${element.site.name}${element.zone ? ` · ${element.zone.name}` : ""}`,
    landscape: false,
    summary: [
      ["Ubicación", element.location ?? "—"],
      ["Proceso", element.process.name],
      ["Responsable", element.responsible?.name ?? "—"],
      ["Frecuencia", element.frequency === "CUSTOM" ? `Cada ${element.frequencyDays} días` : FREQUENCY_LABELS[element.frequency]],
      ["Última / próxima inspección", `${formatDate(element.lastInspectionAt)} / ${formatDate(element.nextInspectionAt)}`],
      ["Estado", ELEMENT_STATUS_LABELS[element.status]],
      ...(exp !== "NONE" ? [[element.expiryLabel ?? "Vencimiento", `${formatDate(element.expiresAt)} (${EXPIRY_STATUS_LABELS[exp]})`] as [string, string]] : []),
    ],
    sections: [
      {
        heading: "Inspecciones",
        columns: [
          { header: "N.º", width: 10 },
          { header: "Fecha", width: 12 },
          { header: "Brigadista", width: 22 },
          { header: "Resultado", width: 12 },
          { header: "% cumpl.", width: 9, align: "right" },
          { header: "No conformes", width: 10, align: "right" },
        ],
        rows: inspections.map((i) => [
          formatNumber(i.number),
          formatDate(i.completedAt),
          i.inspector.name,
          i.result ? INSPECTION_RESULT_LABELS[i.result] : "",
          i.compliancePct === null ? null : Number(i.compliancePct),
          i.nonCompliantCount,
        ]),
      },
      {
        heading: "Hallazgos",
        columns: [
          { header: "N.º", width: 9 },
          { header: "Fecha", width: 10 },
          { header: "Descripción", width: 32 },
          { header: "Prioridad", width: 9 },
          { header: "Responsable", width: 16 },
          { header: "Estado", width: 10 },
          { header: "Cierre", width: 10 },
        ],
        rows: findings.map((f) => [
          formatNumber(f.number),
          formatDate(f.createdAt),
          f.description,
          PRIORITY_LABELS[f.priority],
          f.responsible?.name ?? "",
          WORKFLOW_STATUS_LABELS[f.status],
          f.closedAt ? formatDate(f.closedAt) : "",
        ]),
      },
    ],
  };
}

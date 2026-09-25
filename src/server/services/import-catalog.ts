import "server-only";
import type ExcelJS from "exceljs";
import { db } from "@/server/db";
import { Prisma, type InspectionFrequency } from "@/generated/prisma/client";
import { cellText, findByCodeOrName, normalizeKey, parseFrequency } from "@/lib/import-parsing";
import { questionRowToForm } from "@/lib/import-questions";
import { questionSchema } from "@/lib/validation/config";
import { getOrCreateActiveTemplate } from "@/server/services/element-types.service";
import { CODE_RE, isExampleRow, readSheet, type RowIssue, type SheetColumn } from "@/server/services/import-sheets";

/**
 * Hojas opcionales de catálogo en la carga masiva: Sedes, Procesos, Tipos y
 * Preguntas. Se aplican antes de Zonas y Elementos, así un solo archivo puede
 * montar la operación completa. Las filas nuevas reciben un ID virtual
 * ("new:<tipo>:<código>") que applyCatalog() traduce al ID real.
 */

export const SITE_COLUMNS = [
  { key: "codigo", header: "Código sede*", width: 14 },
  { key: "nombre", header: "Nombre sede*", width: 28 },
  { key: "ciudad", header: "Ciudad", width: 18 },
  { key: "direccion", header: "Dirección", width: 36 },
] as const satisfies readonly SheetColumn[];

export const PROCESS_COLUMNS = [
  { key: "codigo", header: "Código proceso*", width: 16 },
  { key: "nombre", header: "Nombre proceso*", width: 30 },
  { key: "descripcion", header: "Descripción", width: 40 },
] as const satisfies readonly SheetColumn[];

export const TYPE_COLUMNS = [
  { key: "codigo", header: "Código tipo*", width: 14 },
  { key: "nombre", header: "Nombre tipo*", width: 28 },
  { key: "prefijo", header: "Prefijo código", width: 14 },
  { key: "frecuencia", header: "Frecuencia", width: 14 },
  { key: "dias", header: "Días (si es personalizada)", width: 12 },
  { key: "descripcion", header: "Descripción", width: 40 },
] as const satisfies readonly SheetColumn[];

export const QUESTION_COLUMNS = [
  { key: "tipo", header: "Tipo*", width: 22 },
  { key: "orden", header: "Orden", width: 8 },
  { key: "pregunta", header: "Pregunta*", width: 60 },
  { key: "respuesta", header: "Tipo de respuesta*", width: 18 },
  { key: "opciones", header: "Opciones (separadas por /)", width: 30 },
  { key: "no cumple si", header: "No cumple si", width: 16 },
  { key: "minimo", header: "Mínimo", width: 9 },
  { key: "maximo", header: "Máximo", width: 9 },
  { key: "obligatoria", header: "Obligatoria", width: 11 },
  { key: "genera hallazgo", header: "Genera hallazgo", width: 11 },
  { key: "prioridad", header: "Prioridad", width: 11 },
  { key: "es vencimiento", header: "Es fecha de vencimiento", width: 12 },
  { key: "ayuda", header: "Ayuda", width: 40 },
] as const satisfies readonly SheetColumn[];

export interface CatalogRef {
  id: string;
  code: string;
  name: string;
}
export interface TypeRef extends CatalogRef {
  codePrefix?: string | null;
  defaultFrequency: InspectionFrequency;
  defaultFrequencyDays: number | null;
}

interface SitePlan { existingId: string | null; code: string; name: string; city: string | null; address: string | null }
interface ProcessPlan { existingId: string | null; code: string; name: string; description: string | null }
interface TypePlan {
  existingId: string | null;
  code: string;
  name: string;
  codePrefix: string | null;
  defaultFrequency: InspectionFrequency;
  defaultFrequencyDays: number | null;
  description: string | null;
}
type QuestionData = Extract<ReturnType<typeof questionSchema.parse>, object>;
interface QuestionSetPlan {
  typeRef: string; // ID real o virtual
  questions: { existingId: string | null; data: Omit<QuestionData, "id" | "elementTypeId"> }[];
  deactivateIds: string[];
}

export interface CatalogPlans {
  sites: SitePlan[];
  processes: ProcessPlan[];
  types: TypePlan[];
  questionSets: QuestionSetPlan[];
}

const virtualId = (kind: string, code: string) => `new:${kind}:${code}`;
const text = (v: unknown) => cellText(v);

export function hasCatalogSheets(wb: ExcelJS.Workbook) {
  return ["Sedes", "Procesos", "Tipos", "Preguntas"].some((n) => wb.worksheets.some((w) => normalizeKey(w.name) === normalizeKey(n)));
}

export function catalogRowCount(wb: ExcelJS.Workbook) {
  return (
    readSheet(wb, "Sedes", SITE_COLUMNS).length +
    readSheet(wb, "Procesos", PROCESS_COLUMNS).length +
    readSheet(wb, "Tipos", TYPE_COLUMNS).length +
    readSheet(wb, "Preguntas", QUESTION_COLUMNS).length
  );
}

/**
 * Valida las hojas de catálogo contra la BD. Devuelve los resultados por fila,
 * los planes a aplicar y los catálogos "extendidos" (existentes + nuevos del
 * archivo) para validar Zonas y Elementos del mismo archivo.
 */
export async function analyzeCatalog(
  wb: ExcelJS.Workbook,
  current: { sites: CatalogRef[]; processes: CatalogRef[]; types: TypeRef[] },
) {
  const siteRows = readSheet(wb, "Sedes", SITE_COLUMNS).filter((r) => !isExampleRow(r.values.direccion));
  const processRows = readSheet(wb, "Procesos", PROCESS_COLUMNS).filter((r) => !isExampleRow(r.values.descripcion));
  const typeRows = readSheet(wb, "Tipos", TYPE_COLUMNS).filter((r) => !isExampleRow(r.values.descripcion));
  const questionRows = readSheet(wb, "Preguntas", QUESTION_COLUMNS).filter((r) => !isExampleRow(r.values.ayuda));

  const plans: CatalogPlans = { sites: [], processes: [], types: [], questionSets: [] };
  const sites = [...current.sites];
  const processes = [...current.processes];
  const types = [...current.types];

  // Los registros inactivos también se pueden actualizar (se reactivan).
  const [allSites, allProcesses, allTypes] = await Promise.all([
    db.site.findMany({ where: { deletedAt: null }, select: { id: true, code: true, name: true } }),
    db.process.findMany({ where: { deletedAt: null }, select: { id: true, code: true, name: true } }),
    db.elementType.findMany({ where: { deletedAt: null }, select: { id: true, code: true, name: true } }),
  ]);

  /** Upsert genérico por código (o por nombre si el código no existe). */
  function simpleSheet<K extends string>(
    rows: { row: number; values: Record<K, unknown> }[],
    existingAll: CatalogRef[],
    label: string,
  ) {
    const issues: RowIssue[] = [];
    const accepted: { row: number; code: string; name: string; existing: CatalogRef | undefined; values: Record<K, unknown> }[] = [];
    const seen = new Set<string>();
    for (const { row, values } of rows) {
      const errors: string[] = [];
      const code = text((values as Record<string, unknown>).codigo).toUpperCase();
      const name = text((values as Record<string, unknown>).nombre);
      if (!code) errors.push(`Falta el código de ${label}`);
      else if (!CODE_RE.test(code) || code.length > 30) errors.push("Código inválido (máx. 30: letras, números, - y _)");
      if (!name) errors.push(`Falta el nombre de ${label}`);
      if (code && seen.has(code)) errors.push("Código repetido en el archivo");
      seen.add(code);
      const existing = existingAll.find((e) => e.code === code) ?? existingAll.find((e) => normalizeKey(e.name) === normalizeKey(name));
      if (existing && existing.code !== code) errors.push(`Ya existe «${existing.name}» con el código ${existing.code}: usa ese código`);
      issues.push({ row, code, action: errors.length ? "error" : existing ? "update" : "create", errors, warnings: [] });
      if (!errors.length) accepted.push({ row, code, name, existing, values });
    }
    return { issues, accepted };
  }

  function upsertRef(list: CatalogRef[], ref: CatalogRef) {
    const i = list.findIndex((x) => x.code === ref.code);
    if (i >= 0) list[i] = { ...list[i]!, name: ref.name };
    else list.push(ref);
  }

  // ---- Sedes
  const siteResult = simpleSheet(siteRows, allSites, "la sede");
  for (const s of siteResult.accepted) {
    plans.sites.push({
      existingId: s.existing?.id ?? null,
      code: s.code,
      name: s.name.slice(0, 120),
      city: text(s.values.ciudad).slice(0, 80) || null,
      address: text(s.values.direccion).slice(0, 200) || null,
    });
    upsertRef(sites, { id: s.existing?.id ?? virtualId("site", s.code), code: s.code, name: s.name });
  }

  // ---- Procesos
  const processResult = simpleSheet(processRows, allProcesses, "el proceso");
  for (const p of processResult.accepted) {
    plans.processes.push({
      existingId: p.existing?.id ?? null,
      code: p.code,
      name: p.name.slice(0, 120),
      description: text(p.values.descripcion).slice(0, 500) || null,
    });
    upsertRef(processes, { id: p.existing?.id ?? virtualId("process", p.code), code: p.code, name: p.name });
  }

  // ---- Tipos
  const typeResult = simpleSheet(typeRows, allTypes, "el tipo");
  for (const t of typeResult.accepted) {
    const issue = typeResult.issues.find((i) => i.row === t.row)!;
    const freqText = text(t.values.frecuencia);
    const frequency = freqText ? parseFrequency(freqText) : "MONTHLY";
    if (!frequency) issue.errors.push(`Frecuencia «${freqText}» no válida`);
    let days: number | null = null;
    if (frequency === "CUSTOM") {
      days = Number(text(t.values.dias)) || null;
      if (!days || days < 1 || days > 3650) issue.errors.push("Frecuencia personalizada: indica los días (1–3650)");
    }
    const prefix = text(t.values.prefijo).toUpperCase();
    if (prefix && !/^[A-Z0-9]{1,10}$/.test(prefix)) issue.errors.push("Prefijo: hasta 10 letras o números");
    if (issue.errors.length) {
      issue.action = "error";
      continue;
    }
    plans.types.push({
      existingId: t.existing?.id ?? null,
      code: t.code,
      name: t.name.slice(0, 80),
      codePrefix: prefix || null,
      defaultFrequency: frequency!,
      defaultFrequencyDays: days,
      description: text(t.values.descripcion).slice(0, 500) || null,
    });
    const ref: TypeRef = {
      id: t.existing?.id ?? virtualId("type", t.code),
      code: t.code,
      name: t.name,
      codePrefix: prefix || null,
      defaultFrequency: frequency!,
      defaultFrequencyDays: days,
    };
    const i = types.findIndex((x) => x.code === t.code);
    if (i >= 0) types[i] = ref;
    else types.push(ref);
  }

  // ---- Preguntas (agrupadas por tipo; el archivo define el cuestionario completo del tipo)
  const questionIssues: RowIssue[] = [];
  const byType = new Map<string, { type: TypeRef; rows: { row: number; order: number; issue: RowIssue; data: QuestionSetPlan["questions"][number]["data"] }[] }>();
  for (const [index, { row, values }] of questionRows.entries()) {
    const errors: string[] = [];
    const type = findByCodeOrName(types, text(values.tipo));
    if (!type) errors.push(`Tipo «${text(values.tipo)}» no existe (créalo en la hoja «Tipos»)`);
    const questionText = text(values.pregunta);
    const { form, errors: rowErrors } = questionRowToForm({
      text: questionText,
      responseType: text(values.respuesta),
      options: text(values.opciones),
      nonCompliant: text(values["no cumple si"]),
      min: text(values.minimo),
      max: text(values.maximo),
      required: text(values.obligatoria),
      generatesFinding: text(values["genera hallazgo"]),
      priority: text(values.prioridad),
      tracksExpiry: text(values["es vencimiento"]),
      helpText: text(values.ayuda),
    });
    errors.push(...rowErrors);
    let data: QuestionSetPlan["questions"][number]["data"] | null = null;
    if (!rowErrors.length) {
      const parsed = questionSchema.safeParse({ ...form, elementTypeId: type?.id ?? "pendiente" });
      if (!parsed.success) errors.push(...parsed.error.issues.map((i) => i.message));
      else {
        const rest: Partial<QuestionData> = { ...parsed.data };
        delete rest.id;
        delete rest.elementTypeId;
        data = rest as QuestionSetPlan["questions"][number]["data"];
      }
    }
    const orderText = text(values.orden);
    const order = orderText ? Number(orderText) : index + 1;
    if (orderText && !Number.isFinite(order)) errors.push("Orden debe ser un número");
    const issue: RowIssue = {
      row,
      code: `${type?.code ?? text(values.tipo)} · ${questionText.slice(0, 50)}`,
      action: "create",
      errors,
      warnings: [],
    };
    questionIssues.push(issue);
    if (type) {
      const group = byType.get(type.code) ?? { type, rows: [] };
      if (group.rows.some((r) => normalizeKey(r.data?.text ?? "") === normalizeKey(questionText))) errors.push("Pregunta repetida para este tipo");
      group.rows.push({ row, order: Number.isFinite(order) ? order : index + 1, issue, data: data! });
      byType.set(type.code, group);
    }
  }

  for (const { type, rows } of byType.values()) {
    const existingQuestions = type.id.startsWith("new:")
      ? []
      : await db.inspectionQuestion.findMany({
          where: { deletedAt: null, template: { elementTypeId: type.id, status: "PUBLISHED" } },
          select: { id: true, text: true, responseType: true, active: true, _count: { select: { answers: true } } },
        });
    const matched = new Set<string>();
    const questions: QuestionSetPlan["questions"] = [];
    for (const r of [...rows].sort((a, b) => a.order - b.order || a.row - b.row)) {
      if (r.issue.errors.length || !r.data) {
        r.issue.action = "error";
        continue;
      }
      const match = existingQuestions.find((q) => !matched.has(q.id) && normalizeKey(q.text) === normalizeKey(r.data.text));
      if (match) {
        matched.add(match.id);
        if (match._count.answers > 0 && match.responseType !== r.data.responseType) {
          r.issue.errors.push("Esta pregunta ya tiene respuestas: no se puede cambiar su tipo de respuesta (cambia el texto para crear una nueva)");
          r.issue.action = "error";
          continue;
        }
        r.issue.action = "update";
      }
      questions.push({ existingId: match?.id ?? null, data: r.data });
    }
    const deactivate = existingQuestions.filter((q) => !matched.has(q.id) && q.active);
    if (deactivate.length) {
      const first = [...rows].sort((a, b) => a.row - b.row)[0]!;
      first.issue.warnings.push(
        `${deactivate.length} pregunta(s) actuales de «${type.name}» no están en el archivo: se desactivarán (el historial se conserva)`,
      );
    }
    plans.questionSets.push({ typeRef: type.id, questions, deactivateIds: deactivate.map((q) => q.id) });
  }

  return {
    sections: {
      sites: siteResult.issues,
      processes: processResult.issues,
      types: typeResult.issues,
      questions: questionIssues,
    },
    plans,
    catalogs: { sites, processes, types },
  };
}

type Tx = Prisma.TransactionClient;
const json = (v: unknown) => (v === null || v === undefined ? Prisma.JsonNull : (v as Prisma.InputJsonValue));

/** Aplica los planes de catálogo dentro de la transacción; devuelve el mapa ID virtual → ID real. */
export async function applyCatalog(tx: Tx, plans: CatalogPlans): Promise<Map<string, string>> {
  const ids = new Map<string, string>();

  for (const s of plans.sites) {
    const data = { name: s.name, city: s.city, address: s.address, active: true };
    const saved = s.existingId
      ? await tx.site.update({ where: { id: s.existingId }, data, select: { id: true } })
      : await tx.site.create({ data: { ...data, code: s.code }, select: { id: true } });
    ids.set(virtualId("site", s.code), saved.id);
  }
  for (const p of plans.processes) {
    const data = { name: p.name, description: p.description, active: true };
    const saved = p.existingId
      ? await tx.process.update({ where: { id: p.existingId }, data, select: { id: true } })
      : await tx.process.create({ data: { ...data, code: p.code }, select: { id: true } });
    ids.set(virtualId("process", p.code), saved.id);
  }
  for (const t of plans.types) {
    const data = {
      name: t.name,
      codePrefix: t.codePrefix,
      defaultFrequency: t.defaultFrequency,
      defaultFrequencyDays: t.defaultFrequencyDays,
      description: t.description,
      active: true,
    };
    const saved = t.existingId
      ? await tx.elementType.update({ where: { id: t.existingId }, data, select: { id: true } })
      : await tx.elementType.create({ data: { ...data, code: t.code }, select: { id: true } });
    await getOrCreateActiveTemplate(saved.id, tx);
    ids.set(virtualId("type", t.code), saved.id);
  }

  for (const set of plans.questionSets) {
    const typeId = ids.get(set.typeRef) ?? set.typeRef;
    const template = await getOrCreateActiveTemplate(typeId, tx);
    let order = 0;
    for (const q of set.questions) {
      order++;
      const data = { ...q.data, options: json(q.data.options), complianceRule: json(q.data.complianceRule), order, active: true };
      if (q.existingId) await tx.inspectionQuestion.update({ where: { id: q.existingId }, data });
      else await tx.inspectionQuestion.create({ data: { ...data, templateId: template.id } });
    }
    for (const id of set.deactivateIds) {
      order++;
      await tx.inspectionQuestion.update({ where: { id }, data: { active: false, order } });
    }
  }
  return ids;
}

import "server-only";
import ExcelJS from "exceljs";
import { db } from "@/server/db";
import type { ElementStatus, InspectionFrequency, Prisma } from "@/generated/prisma/client";
import { audit } from "@/server/audit";
import { AuthorizationError, DomainError } from "@/server/errors";
import { expiryDateFromISO } from "@/lib/expiry";
import { cellText, findByCodeOrName, normalizeKey, parseDateCell, parseElementStatus, parseFrequency } from "@/lib/import-parsing";
import { RESPONSE_TYPE_IMPORT_LABELS } from "@/lib/import-questions";
import { ELEMENT_STATUS_LABELS, PRIORITY_LABELS } from "@/lib/labels";
import { FREQUENCIES, FREQUENCY_LABELS, scheduleFields } from "@/lib/scheduling";
import { auditCtx, type ServiceContext } from "@/server/services/context";
import { generateQrToken } from "@/server/services/elements.service";
import { nextSequentialCode, typeCodePrefix } from "@/lib/element-code";
import {
  analyzeCatalog,
  applyCatalog,
  PROCESS_COLUMNS,
  QUESTION_COLUMNS,
  SITE_COLUMNS,
  TYPE_COLUMNS,
} from "@/server/services/import-catalog";
import {
  addDropdown,
  addTemplateSheet,
  CODE_RE,
  isExampleRow,
  readSheet,
  type ImportSection,
  type RowIssue,
} from "@/server/services/import-sheets";
import { analyzeUsers, applyUsers, USER_COLUMNS } from "@/server/services/import-users";

export type { ImportSection, RowIssue } from "@/server/services/import-sheets";

export const MAX_IMPORT_ROWS = 5000;
export const MAX_IMPORT_BYTES = 5 * 1024 * 1024;

// Encabezados de la plantilla (el * indica obligatorio). El orden es el de las columnas.
const ZONE_COLUMNS = [
  { key: "sede", header: "Sede*", width: 24 },
  { key: "codigo", header: "Código zona*", width: 16 },
  { key: "nombre", header: "Nombre zona*", width: 32 },
  { key: "descripcion", header: "Descripción", width: 40 },
] as const;

const ELEMENT_COLUMNS = [
  { key: "codigo", header: "Código (vacío = automático)", width: 16 },
  { key: "tipo", header: "Tipo*", width: 16 },
  { key: "nombre", header: "Nombre*", width: 30 },
  { key: "proceso", header: "Proceso*", width: 18 },
  { key: "sede", header: "Sede*", width: 20 },
  { key: "zona", header: "Zona", width: 26 },
  { key: "ubicacion", header: "Ubicación", width: 32 },
  { key: "responsable", header: "Responsable (correo)", width: 30 },
  { key: "frecuencia", header: "Frecuencia", width: 14 },
  { key: "dias", header: "Días (si es personalizada)", width: 12 },
  { key: "ultima inspeccion", header: "Última inspección", width: 16 },
  { key: "proxima inspeccion", header: "Próxima inspección", width: 16 },
  { key: "vencimiento", header: "Vencimiento", width: 14 },
  { key: "concepto vencimiento", header: "Concepto vencimiento", width: 18 },
  { key: "estado", header: "Estado", width: 16 },
  { key: "descripcion", header: "Descripción", width: 40 },
] as const;

type ElementKey = (typeof ELEMENT_COLUMNS)[number]["key"];

// ---------------------------------------------------------------------------
// Plantilla
// ---------------------------------------------------------------------------

async function catalogs() {
  const [sites, processes, types, users, zones] = await Promise.all([
    db.site.findMany({ where: { deletedAt: null }, select: { id: true, code: true, name: true }, orderBy: { name: "asc" } }),
    db.process.findMany({ where: { deletedAt: null, active: true }, select: { id: true, code: true, name: true }, orderBy: { name: "asc" } }),
    db.elementType.findMany({
      where: { deletedAt: null, active: true },
      select: { id: true, code: true, name: true, codePrefix: true, defaultFrequency: true, defaultFrequencyDays: true },
      orderBy: { name: "asc" },
    }),
    db.user.findMany({ where: { deletedAt: null, active: true }, select: { id: true, email: true, name: true }, orderBy: { name: "asc" } }),
    db.zone.findMany({ where: { deletedAt: null }, select: { id: true, code: true, name: true, siteId: true } }),
  ]);
  return { sites, processes, types, users, zones };
}

/**
 * Plantilla Excel: instrucciones, hojas de catálogo opcionales (Sedes,
 * Procesos, Tipos, Preguntas), Zonas y Elementos, con listas desplegables.
 */
export async function buildImportTemplate(): Promise<Buffer> {
  const [{ sites, processes, types, users }, roles] = await Promise.all([
    catalogs(),
    db.role.findMany({ where: { active: true }, select: { name: true }, orderBy: { name: "asc" } }),
  ]);
  const wb = new ExcelJS.Workbook();
  wb.creator = "Inspecciones de Emergencia";

  const help = wb.addWorksheet("Instrucciones");
  help.columns = [{ width: 120 }];
  [
    "CARGA MASIVA: SEDES, PROCESOS, TIPOS DE EQUIPO, PREGUNTAS, ZONAS E INVENTARIO",
    "",
    "Llena solo las hojas que necesites (las vacías se ignoran). No cambies los encabezados. Las columnas con * son obligatorias.",
    "Se aplican en este orden: Sedes → Procesos → Usuarios → Tipos → Preguntas → Zonas → Elementos, así un solo archivo puede montar toda la operación.",
    "",
    "SEDES / PROCESOS / TIPOS: si el código ya existe se ACTUALIZA; si no, se CREA.",
    "USUARIOS: por correo. Si ya existe se actualizan nombre, cargo, roles y procesos; si no, se crea y recibe un correo de bienvenida",
    "   para definir su contraseña (enlace válido 72 horas). Roles separados por / (ej.: Brigadista / Responsable de acción). Ver hoja «Listas».",
    "TIPOS: Prefijo = inicio sugerido del código de los elementos (EXT → EXT-001). Frecuencia por defecto de inspección (vacía = Mensual).",
    "",
    "PREGUNTAS: el cuestionario de inspección de cada tipo, en orden. Para cada tipo que aparezca en la hoja, el archivo define el cuestionario completo:",
    "   · Si el texto de la pregunta ya existe en ese tipo, se actualiza; si no, se crea.",
    "   · Las preguntas actuales del tipo que NO estén en el archivo se desactivan (sus respuestas anteriores se conservan).",
    "   Tipo de respuesta: Sí/No · Sí/No/No aplica · Cumple/No cumple · Número · Fecha · Selección · Selección múltiple · Texto · Foto.",
    "   Opciones (solo Selección): separadas por /  (ej.: Bueno / Malo).",
    "   No cumple si: Sí/No → «No» (por defecto) o «Sí» para preguntas negativas (¿Hay fugas?). Selección → las opciones que no cumplen (ej.: Malo).",
    "   Número: Mínimo / Máximo aceptables (ej.: cantidades de un botiquín con Mínimo 1).",
    "   Es fecha de vencimiento = Sí (solo Fecha): la respuesta actualiza el vencimiento del elemento; al pasar genera alerta crítica y plan de acción.",
    "   Obligatoria y Genera hallazgo: Sí / No (vacío = Sí). Prioridad del hallazgo: Baja, Media, Alta o Crítica (vacío = Media).",
    "",
    "ZONAS: código o nombre de una sede existente o creada en la hoja «Sedes».",
    "ELEMENTOS: Sede, Proceso y Tipo existentes o creados en este mismo archivo (se acepta código o nombre). Zona: de esa sede.",
    "   Responsable: correo de un usuario activo. Frecuencia vacía = la del tipo. Fechas dd/mm/aaaa.",
    "   Con «Última inspección» la próxima se calcula sola; si no, se usa «Próxima inspección» (o hoy).",
    "   Código: déjalo VACÍO para elementos nuevos y el sistema asigna SEDE-TIPO-consecutivo (ej.: PRO-EXT-024).",
    "   Si escribes un código que ya existe, la fila ACTUALIZA ese elemento. Nada se borra.",
    "",
    "Al subir el archivo verás una vista previa con los errores por fila; solo se importa cuando todo está correcto y todo se guarda en una sola operación.",
  ].forEach((line, i) => {
    const row = help.addRow([line]);
    if (i === 0) row.font = { bold: true, size: 14 };
  });

  addTemplateSheet(wb, "Sedes", SITE_COLUMNS, {
    codigo: "PRINCIPAL",
    nombre: sites[0]?.name ?? "Sede Principal",
    ciudad: "Medellín",
    direccion: "Fila de ejemplo: bórrala o reemplázala",
  });
  addTemplateSheet(wb, "Procesos", PROCESS_COLUMNS, {
    codigo: "MANT",
    nombre: "Mantenimiento",
    descripcion: "Fila de ejemplo: bórrala o reemplázala",
  });
  addTemplateSheet(wb, "Usuarios", USER_COLUMNS, {
    nombre: "Carlos Ramírez",
    correo: "carlos.ramirez@miempresa.com",
    roles: "Brigadista",
    procesos: processes[0]?.name ?? "",
    cargo: "Fila de ejemplo: bórrala o reemplázala",
    activo: "Sí",
  });
  const typesWs = addTemplateSheet(wb, "Tipos", TYPE_COLUMNS, {
    codigo: "EXT",
    nombre: "Extintor",
    prefijo: "EXT",
    frecuencia: "Mensual",
    descripcion: "Fila de ejemplo: bórrala o reemplázala",
  });
  const questionsWs = addTemplateSheet(wb, "Preguntas", QUESTION_COLUMNS, {
    tipo: "Extintor",
    orden: 1,
    pregunta: "¿El manómetro indica presión adecuada?",
    respuesta: "Sí/No/No aplica",
    "no cumple si": "No",
    obligatoria: "Sí",
    "genera hallazgo": "Sí",
    prioridad: "Alta",
    "es vencimiento": "No",
    ayuda: "Fila de ejemplo: bórrala o reemplázala",
  });
  const zonesWs = addTemplateSheet(wb, "Zonas", ZONE_COLUMNS, {
    sede: sites[0]?.name ?? "Sede Principal",
    codigo: "Z1",
    nombre: "Zona 1 – Bodega",
    descripcion: "Fila de ejemplo: bórrala o reemplázala",
  });
  const elementsWs = addTemplateSheet(wb, "Elementos", ELEMENT_COLUMNS, {
    codigo: "",
    tipo: types[0]?.name ?? "Extintor",
    nombre: "Extintor ABC 20 lb",
    proceso: processes[0]?.name ?? "Producción",
    sede: sites[0]?.name ?? "Sede Principal",
    zona: "Z1",
    ubicacion: "Columna B4",
    responsable: users[0]?.email ?? "",
    frecuencia: "Mensual",
    "ultima inspeccion": "01/09/2026",
    vencimiento: "01/03/2027",
    "concepto vencimiento": "Recarga",
    estado: "Activo",
    descripcion: "Fila de ejemplo: bórrala o reemplázala",
  });

  const lists = wb.addWorksheet("Listas");
  const listColumns: [string, string[]][] = [
    ["Sedes", sites.map((s) => s.name)],
    ["Procesos", processes.map((p) => p.name)],
    ["Tipos", types.map((t) => t.name)],
    ["Responsables (correo)", users.map((u) => u.email)],
    ["Frecuencias", FREQUENCIES.map((f) => FREQUENCY_LABELS[f])],
    ["Estados", Object.values(ELEMENT_STATUS_LABELS)],
    ["Tipos de respuesta", Object.values(RESPONSE_TYPE_IMPORT_LABELS)],
    ["Sí / No", ["Sí", "No"]],
    ["Prioridades", Object.values(PRIORITY_LABELS)],
    ["Roles", roles.map((r) => r.name)],
  ];
  listColumns.forEach(([title, values], c) => {
    const col = lists.getColumn(c + 1);
    col.width = 30;
    lists.getCell(1, c + 1).value = title;
    lists.getCell(1, c + 1).font = { bold: true };
    values.forEach((v, r) => (lists.getCell(r + 2, c + 1).value = v));
  });
  const listRange = (c: number, count: number) =>
    `Listas!$${String.fromCharCode(65 + c)}$2:$${String.fromCharCode(65 + c)}$${Math.max(2, count + 1)}`;

  addDropdown(zonesWs, "sede", listRange(0, sites.length));
  addDropdown(elementsWs, "sede", listRange(0, sites.length));
  addDropdown(elementsWs, "proceso", listRange(1, processes.length));
  addDropdown(elementsWs, "tipo", listRange(2, types.length));
  addDropdown(elementsWs, "responsable", listRange(3, users.length));
  addDropdown(elementsWs, "frecuencia", listRange(4, FREQUENCIES.length));
  addDropdown(elementsWs, "estado", listRange(5, 4));
  addDropdown(typesWs, "frecuencia", listRange(4, FREQUENCIES.length));
  addDropdown(questionsWs, "respuesta", listRange(6, Object.keys(RESPONSE_TYPE_IMPORT_LABELS).length));
  for (const key of ["obligatoria", "genera hallazgo", "es vencimiento"]) addDropdown(questionsWs, key, listRange(7, 2));
  addDropdown(questionsWs, "prioridad", listRange(8, Object.keys(PRIORITY_LABELS).length));

  return Buffer.from(await wb.xlsx.writeBuffer());
}

// ---------------------------------------------------------------------------
// Lectura y validación
// ---------------------------------------------------------------------------

interface ZonePlan {
  row: number;
  siteId: string;
  code: string;
  name: string;
  description: string | null;
  existingId: string | null;
}

interface ElementPlan {
  row: number;
  existingId: string | null;
  data: {
    code: string;
    elementTypeId: string;
    name: string;
    description: string | null;
    processId: string;
    siteId: string;
    zoneRef: { id: string } | { siteId: string; code: string } | null;
    location: string | null;
    responsibleId: string | null;
    frequency: InspectionFrequency;
    frequencyDays: number | null;
    lastInspectionAt: string | null;
    nextInspectionAt: string | null;
    expiresAt: string | null;
    expiryLabel: string | null;
    status: ElementStatus;
  };
}

export interface ImportPreview {
  sections: ImportSection[];
  summary: { create: number; update: number; errors: number; rows: number };
}

export async function analyzeImport(buffer: Buffer | ArrayBuffer, currentUserId: string | null = null) {
  const wb = new ExcelJS.Workbook();
  try {
    await wb.xlsx.load(buffer as ArrayBuffer);
  } catch {
    throw new DomainError("No se pudo leer el archivo. Usa la plantilla en formato Excel (.xlsx).");
  }
  const zoneRows = readSheet(wb, "Zonas", ZONE_COLUMNS).filter((r) => !isExampleRow(r.values.descripcion));
  const elementRows = readSheet(wb, "Elementos", ELEMENT_COLUMNS).filter((r) => !isExampleRow(r.values.descripcion));

  const base = await catalogs();
  const catalog = await analyzeCatalog(wb, base);
  const userSheet = await analyzeUsers(wb, catalog.catalogs.processes, currentUserId);
  // Sedes, procesos, tipos y usuarios existentes + los que crea este mismo archivo.
  const cat = { ...base, ...catalog.catalogs, users: [...base.users, ...userSheet.refs] };
  const catalogRows = Object.values(catalog.sections).reduce((a, rows) => a + rows.length, 0) + userSheet.issues.length;
  const totalRows = catalogRows + zoneRows.length + elementRows.length;
  if (totalRows === 0) {
    throw new DomainError("El archivo no tiene filas para importar (hojas Sedes, Procesos, Tipos, Preguntas, Zonas o Elementos).");
  }
  if (totalRows > MAX_IMPORT_ROWS) {
    throw new DomainError(`Máximo ${MAX_IMPORT_ROWS} filas por archivo. Divide el archivo en partes.`);
  }
  const text = (v: unknown) => cellText(v);

  // ---- Zonas
  const zonePlans: ZonePlan[] = [];
  const zoneIssues: RowIssue[] = [];
  const seenZones = new Set<string>();
  for (const { row, values } of zoneRows) {
    const errors: string[] = [];
    const site = findByCodeOrName(cat.sites, text(values.sede));
    if (!site) errors.push(`Sede «${text(values.sede)}» no existe`);
    const code = text(values.codigo).toUpperCase();
    if (!code) errors.push("Falta el código de la zona");
    else if (!CODE_RE.test(code)) errors.push("Código inválido (solo letras, números, - y _)");
    const name = text(values.nombre);
    if (!name) errors.push("Falta el nombre de la zona");
    const key = `${site?.id}:${code}`;
    if (site && code && seenZones.has(key)) errors.push("Zona repetida en el archivo");
    seenZones.add(key);
    const existing = site ? cat.zones.find((z) => z.siteId === site.id && z.code === code) : undefined;
    zoneIssues.push({ row, code, action: errors.length ? "error" : existing ? "update" : "create", errors, warnings: [] });
    if (!errors.length) {
      zonePlans.push({
        row,
        siteId: site!.id,
        code,
        name: name.slice(0, 120),
        description: text(values.descripcion).slice(0, 300) || null,
        existingId: existing?.id ?? null,
      });
    }
  }

  // ---- Elementos
  const existingElements = await db.element.findMany({
    where: { code: { in: elementRows.map((r) => text(r.values.codigo).toUpperCase()).filter(Boolean) } },
    select: { id: true, code: true, elementTypeId: true, deletedAt: true, _count: { select: { inspections: true } } },
  });
  const elementPlans: ElementPlan[] = [];
  const elementIssues: RowIssue[] = [];
  const seenCodes = new Set<string>();
  // Códigos ya usados (incluye eliminados) + los del archivo: para asignar consecutivos a las filas sin código.
  const usedCodes = new Set(
    elementRows.some((r) => !text(r.values.codigo)) ? (await db.element.findMany({ select: { code: true } })).map((e) => e.code) : [],
  );
  for (const r of elementRows) if (text(r.values.codigo)) usedCodes.add(text(r.values.codigo).toUpperCase());
  for (const { row, values } of elementRows) {
    const errors: string[] = [];
    const warnings: string[] = [];
    const type = findByCodeOrName(cat.types, text(values.tipo));
    if (!type) errors.push(`Tipo «${text(values.tipo)}» no existe o está inactivo`);
    const name = text(values.nombre);
    if (!name) errors.push("Falta el nombre");
    const process = findByCodeOrName(cat.processes, text(values.proceso));
    if (!process) errors.push(`Proceso «${text(values.proceso)}» no existe o está inactivo`);
    const site = findByCodeOrName(cat.sites, text(values.sede));
    if (!site) errors.push(`Sede «${text(values.sede)}» no existe`);

    // Código vacío → el sistema asigna SEDE-TIPO-NNN (elemento nuevo). Con código → crea o actualiza ese elemento.
    let code = text(values.codigo).toUpperCase();
    if (!code && site && type) {
      code = nextSequentialCode(site.code, typeCodePrefix(type), usedCodes);
      usedCodes.add(code);
      warnings.push(`Código asignado automáticamente: ${code}`);
    }
    if (!code) errors.push("Sin código: indica sede y tipo válidos para asignarlo");
    else if (!CODE_RE.test(code) || code.length > 40) errors.push("Código inválido (solo letras, números, - y _)");
    if (code && seenCodes.has(code)) errors.push("Código repetido en el archivo");
    seenCodes.add(code);

    // Zona: existente en la sede o creada en la hoja Zonas del mismo archivo
    let zoneRef: ElementPlan["data"]["zoneRef"] = null;
    const zoneText = text(values.zona);
    if (zoneText && site) {
      const existingZone = findByCodeOrName(cat.zones.filter((z) => z.siteId === site.id), zoneText);
      const fileZone = zonePlans.find(
        (z) => z.siteId === site.id && (z.code === zoneText.toUpperCase() || normalizeKey(z.name) === normalizeKey(zoneText)),
      );
      if (existingZone) zoneRef = { id: existingZone.id };
      else if (fileZone) zoneRef = { siteId: site.id, code: fileZone.code };
      else errors.push(`Zona «${zoneText}» no existe en la sede ${site.name}`);
    }

    let responsibleId: string | null = null;
    const email = text(values.responsable).toLowerCase();
    if (email) {
      const user = cat.users.find((u) => u.email === email);
      if (!user) errors.push(`Responsable «${email}» no es un usuario activo`);
      else responsibleId = user.id;
    }

    let frequency: InspectionFrequency | null = type?.defaultFrequency ?? null;
    if (text(values.frecuencia)) {
      frequency = parseFrequency(text(values.frecuencia));
      if (!frequency) errors.push(`Frecuencia «${text(values.frecuencia)}» no válida`);
    }
    let frequencyDays: number | null = null;
    if (frequency === "CUSTOM") {
      frequencyDays = Number(text(values.dias)) || (text(values.frecuencia) ? null : (type?.defaultFrequencyDays ?? null));
      if (!frequencyDays || frequencyDays < 1 || frequencyDays > 3650) errors.push("Frecuencia personalizada: indica los días (1–3650)");
    }

    const date = (key: ElementKey, label: string) => {
      try {
        return parseDateCell(values[key]);
      } catch (e) {
        errors.push(`${label}: ${(e as Error).message}`);
        return null;
      }
    };
    const lastInspectionAt = date("ultima inspeccion", "Última inspección");
    const nextInspectionAt = date("proxima inspeccion", "Próxima inspección");
    const expiresAt = date("vencimiento", "Vencimiento");
    if (lastInspectionAt && lastInspectionAt > new Date().toISOString().slice(0, 10)) {
      errors.push("La última inspección no puede ser futura");
    }

    const status = parseElementStatus(text(values.estado));
    if (!status) errors.push(`Estado «${text(values.estado)}» no válido`);

    const existing = existingElements.find((e) => e.code === code);
    if (existing?.deletedAt) errors.push("El código pertenece a un elemento eliminado");
    if (existing && type && existing.elementTypeId !== type.id && existing._count.inspections > 0) {
      errors.push("El elemento ya tiene inspecciones: no se puede cambiar su tipo");
    }
    if (existing && existing._count.inspections > 0 && lastInspectionAt) {
      warnings.push("Tiene inspecciones registradas: se conserva su última inspección real");
    }

    elementIssues.push({ row, code, action: errors.length ? "error" : existing ? "update" : "create", errors, warnings });
    if (!errors.length) {
      elementPlans.push({
        row,
        existingId: existing?.id ?? null,
        data: {
          code,
          elementTypeId: type!.id,
          name: name.slice(0, 150),
          description: text(values.descripcion).slice(0, 1000) || null,
          processId: process!.id,
          siteId: site!.id,
          zoneRef,
          location: text(values.ubicacion).slice(0, 200) || null,
          responsibleId,
          frequency: frequency!,
          frequencyDays,
          lastInspectionAt: existing && existing._count.inspections > 0 ? null : lastInspectionAt,
          nextInspectionAt,
          expiresAt,
          expiryLabel: expiresAt ? text(values["concepto vencimiento"]).slice(0, 80) || "Vencimiento" : null,
          status: status!,
        },
      });
    }
  }

  const sections: ImportSection[] = (
    [
      { key: "sites", title: "Sedes", rows: catalog.sections.sites },
      { key: "processes", title: "Procesos", rows: catalog.sections.processes },
      { key: "users", title: "Usuarios", rows: userSheet.issues },
      { key: "types", title: "Tipos", rows: catalog.sections.types },
      { key: "questions", title: "Preguntas", rows: catalog.sections.questions },
      { key: "zones", title: "Zonas", rows: zoneIssues },
      { key: "elements", title: "Elementos", rows: elementIssues },
    ] satisfies ImportSection[]
  ).filter((sec) => sec.rows.length > 0);
  const all = sections.flatMap((sec) => sec.rows);
  const preview: ImportPreview = {
    sections,
    summary: {
      create: all.filter((r) => r.action === "create").length,
      update: all.filter((r) => r.action === "update").length,
      errors: all.filter((r) => r.action === "error").length,
      rows: all.length,
    },
  };
  return {
    preview,
    catalogPlans: catalog.plans,
    userPlans: userSheet.plans,
    zonePlans,
    elementPlans,
    withInspections: new Set(existingElements.filter((e) => e._count.inspections > 0).map((e) => e.id)),
  };
}

// ---------------------------------------------------------------------------
// Aplicación
// ---------------------------------------------------------------------------

export async function applyImport(buffer: Buffer | ArrayBuffer, ctx: ServiceContext) {
  const { preview, catalogPlans, userPlans, zonePlans, elementPlans, withInspections } = await analyzeImport(buffer, ctx.user.id);
  if (preview.summary.errors > 0) {
    throw new DomainError(`El archivo tiene ${preview.summary.errors} fila(s) con errores. Corrígelas y vuelve a cargarlo.`);
  }
  const need = (condition: boolean, permission: Parameters<typeof ctx.user.permissions.has>[0], what: string) => {
    if (condition && !ctx.user.permissions.has(permission)) throw new AuthorizationError(`No tienes permiso para crear o modificar ${what}.`);
  };
  need(zonePlans.length > 0 || catalogPlans.sites.length > 0, "sites.manage", "sedes y zonas");
  need(catalogPlans.processes.length > 0, "processes.manage", "procesos");
  need(userPlans.length > 0, "users.manage", "usuarios");
  need(catalogPlans.types.length > 0 || catalogPlans.questionSets.length > 0, "element_types.manage", "tipos de elemento y preguntas");

  const invited = await db.$transaction(
    async (tx) => {
      // 1. Catálogo: sedes, procesos, tipos y preguntas (IDs virtuales → reales)
      const ids = await applyCatalog(tx, catalogPlans);
      const real = (id: string) => ids.get(id) ?? id;
      // 2. Usuarios (pueden ser responsables de los elementos del mismo archivo)
      const createdUsers = await applyUsers(tx, userPlans, real, ids);

      // 2. Zonas (upsert por sede + código)
      const zoneIds = new Map<string, string>();
      for (const z of zonePlans) {
        const saved = z.existingId
          ? await tx.zone.update({ where: { id: z.existingId }, data: { name: z.name, description: z.description, active: true, deletedAt: null } })
          : await tx.zone.create({ data: { siteId: real(z.siteId), code: z.code, name: z.name, description: z.description } });
        zoneIds.set(`${z.siteId}:${z.code}`, saved.id);
      }

      // 3. Elementos (upsert por código)
      for (const { data, existingId } of elementPlans) {
        const zoneId = !data.zoneRef ? null : "id" in data.zoneRef ? data.zoneRef.id : zoneIds.get(`${data.zoneRef.siteId}:${data.zoneRef.code}`)!;
        const noon = (iso: string | null) => (iso ? new Date(`${iso}T12:00:00.000Z`) : null);
        const base: Prisma.ElementUncheckedUpdateInput = {
          elementTypeId: real(data.elementTypeId),
          name: data.name,
          description: data.description,
          processId: real(data.processId),
          siteId: real(data.siteId),
          zoneId,
          location: data.location,
          responsibleId: data.responsibleId ? real(data.responsibleId) : null,
          frequency: data.frequency,
          frequencyDays: data.frequencyDays,
          status: data.status,
          expiresAt: data.expiresAt ? expiryDateFromISO(data.expiresAt) : null,
          expiryLabel: data.expiryLabel,
        };
        if (existingId) {
          const keepHistory = withInspections.has(existingId);
          const current = await tx.element.findUniqueOrThrow({ where: { id: existingId }, select: { lastInspectionAt: true } });
          const last = keepHistory ? current.lastInspectionAt : noon(data.lastInspectionAt);
          await tx.element.update({
            where: { id: existingId },
            data: {
              ...base,
              lastInspectionAt: last,
              ...scheduleFields({
                lastInspectionAt: last,
                frequency: data.frequency,
                frequencyDays: data.frequencyDays,
                firstInspectionAt: noon(data.nextInspectionAt),
              }),
            },
          });
        } else {
          const last = noon(data.lastInspectionAt);
          await tx.element.create({
            data: {
              ...(base as Prisma.ElementUncheckedCreateInput),
              code: data.code,
              qrToken: generateQrToken(),
              lastInspectionAt: last,
              ...scheduleFields({
                lastInspectionAt: last,
                frequency: data.frequency,
                frequencyDays: data.frequencyDays,
                firstInspectionAt: noon(data.nextInspectionAt),
              }),
            },
          });
        }
      }

      await audit(
        auditCtx(ctx),
        {
          action: "import.inventory",
          entityType: "Element",
          after: {
            ...preview.summary,
            sections: Object.fromEntries(preview.sections.map((sec) => [sec.key, sec.rows.length])),
            userEmails: userPlans.map((u) => u.email),
            zoneCodes: zonePlans.map((z) => z.code),
            elementCodes: elementPlans.map((e) => e.data.code),
          },
        },
        tx,
      );
      return createdUsers;
    },
    { timeout: 120_000, maxWait: 10_000 },
  );
  return { summary: preview.summary, invitedUserIds: invited };
}

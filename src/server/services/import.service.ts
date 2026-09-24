import "server-only";
import ExcelJS from "exceljs";
import { db } from "@/server/db";
import type { ElementStatus, InspectionFrequency, Prisma } from "@/generated/prisma/client";
import { audit } from "@/server/audit";
import { AuthorizationError, DomainError } from "@/server/errors";
import { expiryDateFromISO } from "@/lib/expiry";
import {
  cellText,
  findByCodeOrName,
  normalizeKey,
  parseDateCell,
  parseElementStatus,
  parseFrequency,
} from "@/lib/import-parsing";
import { ELEMENT_STATUS_LABELS } from "@/lib/labels";
import { FREQUENCIES, FREQUENCY_LABELS, scheduleFields } from "@/lib/scheduling";
import { auditCtx, type ServiceContext } from "@/server/services/context";
import { generateQrToken } from "@/server/services/elements.service";

export const MAX_IMPORT_ROWS = 5000;
export const MAX_IMPORT_BYTES = 5 * 1024 * 1024;

const CODE_RE = /^[A-Z0-9_-]+$/;

// Encabezados de la plantilla (el * indica obligatorio). El orden es el de las columnas.
const ZONE_COLUMNS = [
  { key: "sede", header: "Sede*", width: 24 },
  { key: "codigo", header: "Código zona*", width: 16 },
  { key: "nombre", header: "Nombre zona*", width: 32 },
  { key: "descripcion", header: "Descripción", width: 40 },
] as const;

const ELEMENT_COLUMNS = [
  { key: "codigo", header: "Código*", width: 14 },
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
      select: { id: true, code: true, name: true, defaultFrequency: true, defaultFrequencyDays: true },
      orderBy: { name: "asc" },
    }),
    db.user.findMany({ where: { deletedAt: null, active: true }, select: { id: true, email: true, name: true }, orderBy: { name: "asc" } }),
    db.zone.findMany({ where: { deletedAt: null }, select: { id: true, code: true, name: true, siteId: true } }),
  ]);
  return { sites, processes, types, users, zones };
}

/** Plantilla Excel con instrucciones, hojas Zonas y Elementos, y listas desplegables con los valores válidos. */
export async function buildImportTemplate(): Promise<Buffer> {
  const { sites, processes, types, users } = await catalogs();
  const wb = new ExcelJS.Workbook();
  wb.creator = "Inspecciones de Emergencia";

  const help = wb.addWorksheet("Instrucciones");
  help.columns = [{ width: 110 }];
  [
    "CARGA MASIVA DE ZONAS E INVENTARIO",
    "",
    "1. Llena la hoja «Zonas» (opcional) y la hoja «Elementos». No cambies los encabezados. Las columnas con * son obligatorias.",
    "2. Sede, Proceso y Tipo deben existir en el sistema: usa las listas desplegables (hoja «Listas»). Se aceptan el código o el nombre.",
    "3. Zona: código o nombre de una zona de esa sede (existente o creada en la hoja «Zonas» de este mismo archivo).",
    "4. Responsable: correo de un usuario activo del sistema.",
    "5. Frecuencia: Diaria, Semanal, Quincenal, Mensual, Bimestral, Trimestral, Semestral, Anual o Personalizada (con «Días»). Vacía = la del tipo.",
    "6. Fechas en formato dd/mm/aaaa. Si hay «Última inspección», la próxima se calcula sola; si no, se usa «Próxima inspección» (o hoy).",
    "7. Vencimiento: fecha de vencimiento del elemento (p. ej. recarga del extintor). Al pasar genera alerta crítica y plan de acción.",
    "8. Si el código ya existe, la fila ACTUALIZA el elemento; si no, lo CREA. Nada se borra.",
    "9. Sube el archivo en el sistema: primero verás una vista previa con los errores por fila; solo se importa cuando todo está correcto.",
  ].forEach((line, i) => {
    const row = help.addRow([line]);
    if (i === 0) row.font = { bold: true, size: 14 };
  });

  const lists = wb.addWorksheet("Listas");
  const listColumns: [string, string[]][] = [
    ["Sedes", sites.map((s) => s.name)],
    ["Procesos", processes.map((p) => p.name)],
    ["Tipos", types.map((t) => t.name)],
    ["Responsables (correo)", users.map((u) => u.email)],
    ["Frecuencias", FREQUENCIES.map((f) => FREQUENCY_LABELS[f])],
    ["Estados", Object.values(ELEMENT_STATUS_LABELS)],
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

  function sheet<K extends string>(name: string, columns: readonly { key: K; header: string; width: number }[], example: Partial<Record<K, string>>) {
    const ws = wb.addWorksheet(name, { views: [{ state: "frozen", ySplit: 1 }] });
    ws.columns = columns.map((c) => ({ header: c.header, key: c.key, width: c.width }));
    ws.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
    ws.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1D4ED8" } };
    ws.addRow(example);
    ws.getRow(2).font = { italic: true, color: { argb: "FF64748B" } };
    return ws;
  }

  const zonesWs = sheet("Zonas", ZONE_COLUMNS, {
    sede: sites[0]?.name ?? "Sede Principal",
    codigo: "Z1",
    nombre: "Zona 1 – Bodega",
    descripcion: "Fila de ejemplo: bórrala o reemplázala",
  });
  const elementsWs = sheet("Elementos", ELEMENT_COLUMNS, {
    codigo: "EXT-100",
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

  // Listas desplegables (filas 2..1000)
  const dropdown = (ws: ExcelJS.Worksheet, colKey: string, formula: string) => {
    const col = ws.getColumn(colKey);
    for (let r = 2; r <= 1000; r++) {
      ws.getCell(r, col.number).dataValidation = { type: "list", allowBlank: true, formulae: [formula], showErrorMessage: false };
    }
  };
  dropdown(zonesWs, "sede", listRange(0, sites.length));
  dropdown(elementsWs, "sede", listRange(0, sites.length));
  dropdown(elementsWs, "proceso", listRange(1, processes.length));
  dropdown(elementsWs, "tipo", listRange(2, types.length));
  dropdown(elementsWs, "responsable", listRange(3, users.length));
  dropdown(elementsWs, "frecuencia", listRange(4, FREQUENCIES.length));
  dropdown(elementsWs, "estado", listRange(5, 4));

  return Buffer.from(await wb.xlsx.writeBuffer());
}

// ---------------------------------------------------------------------------
// Lectura y validación
// ---------------------------------------------------------------------------

export interface RowIssue {
  row: number;
  code: string;
  action: "create" | "update" | "error";
  errors: string[];
  warnings: string[];
}

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
  zones: RowIssue[];
  elements: RowIssue[];
  summary: { zonesCreate: number; zonesUpdate: number; elementsCreate: number; elementsUpdate: number; errors: number };
}

function readSheet<K extends string>(wb: ExcelJS.Workbook, name: string, columns: readonly { key: K; header: string }[]) {
  const ws = wb.worksheets.find((w) => normalizeKey(w.name) === normalizeKey(name));
  if (!ws) return [];
  const headerRow = ws.getRow(1);
  const map = new Map<number, K>();
  headerRow.eachCell((cell, col) => {
    const key = normalizeKey(cellText(cell.value)).replace(/\s*\(.*$/, "");
    const match = columns.find((c) => normalizeKey(c.header).replace(/\s*\(.*$/, "") === key || c.key === key);
    if (match) map.set(col, match.key);
  });
  const rows: { row: number; values: Record<K, unknown> }[] = [];
  ws.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;
    const values = {} as Record<K, unknown>;
    let any = false;
    map.forEach((key, col) => {
      const v = row.getCell(col).value;
      values[key] = v;
      if (cellText(v) !== "") any = true;
    });
    if (any) rows.push({ row: rowNumber, values });
  });
  return rows;
}

const isExampleRow = (text: unknown) => normalizeKey(cellText(text)).startsWith("fila de ejemplo");

export async function analyzeImport(buffer: Buffer | ArrayBuffer) {
  const wb = new ExcelJS.Workbook();
  try {
    await wb.xlsx.load(buffer as ArrayBuffer);
  } catch {
    throw new DomainError("No se pudo leer el archivo. Usa la plantilla en formato Excel (.xlsx).");
  }
  const zoneRows = readSheet(wb, "Zonas", ZONE_COLUMNS).filter((r) => !isExampleRow(r.values.descripcion));
  const elementRows = readSheet(wb, "Elementos", ELEMENT_COLUMNS).filter((r) => !isExampleRow(r.values.descripcion));
  if (zoneRows.length + elementRows.length === 0) {
    throw new DomainError("El archivo no tiene filas en las hojas «Zonas» o «Elementos».");
  }
  if (zoneRows.length + elementRows.length > MAX_IMPORT_ROWS) {
    throw new DomainError(`Máximo ${MAX_IMPORT_ROWS} filas por archivo. Divide el archivo en partes.`);
  }

  const cat = await catalogs();
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
  for (const { row, values } of elementRows) {
    const errors: string[] = [];
    const warnings: string[] = [];
    const code = text(values.codigo).toUpperCase();
    if (!code) errors.push("Falta el código");
    else if (!CODE_RE.test(code) || code.length > 40) errors.push("Código inválido (solo letras, números, - y _)");
    if (code && seenCodes.has(code)) errors.push("Código repetido en el archivo");
    seenCodes.add(code);

    const type = findByCodeOrName(cat.types, text(values.tipo));
    if (!type) errors.push(`Tipo «${text(values.tipo)}» no existe o está inactivo`);
    const name = text(values.nombre);
    if (!name) errors.push("Falta el nombre");
    const process = findByCodeOrName(cat.processes, text(values.proceso));
    if (!process) errors.push(`Proceso «${text(values.proceso)}» no existe o está inactivo`);
    const site = findByCodeOrName(cat.sites, text(values.sede));
    if (!site) errors.push(`Sede «${text(values.sede)}» no existe`);

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

  const count = (list: RowIssue[], action: RowIssue["action"]) => list.filter((r) => r.action === action).length;
  const preview: ImportPreview = {
    zones: zoneIssues,
    elements: elementIssues,
    summary: {
      zonesCreate: count(zoneIssues, "create"),
      zonesUpdate: count(zoneIssues, "update"),
      elementsCreate: count(elementIssues, "create"),
      elementsUpdate: count(elementIssues, "update"),
      errors: count(zoneIssues, "error") + count(elementIssues, "error"),
    },
  };
  return { preview, zonePlans, elementPlans, withInspections: new Set(existingElements.filter((e) => e._count.inspections > 0).map((e) => e.id)) };
}

// ---------------------------------------------------------------------------
// Aplicación
// ---------------------------------------------------------------------------

export async function applyImport(buffer: Buffer | ArrayBuffer, ctx: ServiceContext) {
  const { preview, zonePlans, elementPlans, withInspections } = await analyzeImport(buffer);
  if (preview.summary.errors > 0) {
    throw new DomainError(`El archivo tiene ${preview.summary.errors} fila(s) con errores. Corrígelas y vuelve a cargarlo.`);
  }
  if (zonePlans.length > 0 && !ctx.user.permissions.has("sites.manage")) {
    throw new AuthorizationError("No tienes permiso para crear o modificar zonas.");
  }

  await db.$transaction(
    async (tx) => {
      // 1. Zonas (upsert por sede + código)
      const zoneIds = new Map<string, string>();
      for (const z of zonePlans) {
        const saved = z.existingId
          ? await tx.zone.update({ where: { id: z.existingId }, data: { name: z.name, description: z.description, active: true, deletedAt: null } })
          : await tx.zone.create({ data: { siteId: z.siteId, code: z.code, name: z.name, description: z.description } });
        zoneIds.set(`${z.siteId}:${z.code}`, saved.id);
      }

      // 2. Elementos (upsert por código)
      for (const { data, existingId } of elementPlans) {
        const zoneId = !data.zoneRef ? null : "id" in data.zoneRef ? data.zoneRef.id : zoneIds.get(`${data.zoneRef.siteId}:${data.zoneRef.code}`)!;
        const noon = (iso: string | null) => (iso ? new Date(`${iso}T12:00:00.000Z`) : null);
        const base: Prisma.ElementUncheckedUpdateInput = {
          elementTypeId: data.elementTypeId,
          name: data.name,
          description: data.description,
          processId: data.processId,
          siteId: data.siteId,
          zoneId,
          location: data.location,
          responsibleId: data.responsibleId,
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
            zoneCodes: zonePlans.map((z) => z.code),
            elementCodes: elementPlans.map((e) => e.data.code),
          },
        },
        tx,
      );
    },
    { timeout: 120_000, maxWait: 10_000 },
  );
  return preview.summary;
}

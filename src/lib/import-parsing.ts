/**
 * Interpretación tolerante de celdas de Excel para la carga masiva (código
 * puro, probado). Acepta lo que un usuario escribe normalmente: fechas
 * dd/mm/aaaa o celdas de fecha, frecuencias y estados en español, textos con
 * o sin tildes.
 */
import { FREQUENCIES, FREQUENCY_LABELS, type Frequency } from "@/lib/scheduling";

/** minúsculas, sin tildes, sin asteriscos ni espacios extra: para comparar encabezados y valores. */
export function normalizeKey(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[*()]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

/** Valor de una celda de ExcelJS como texto (fórmulas, enlaces, texto enriquecido). */
export function cellText(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === "object") {
    const v = value as { text?: unknown; result?: unknown; richText?: { text: string }[]; hyperlink?: string };
    if (Array.isArray(v.richText)) return v.richText.map((r) => r.text).join("").trim();
    if (v.result !== undefined) return cellText(v.result);
    if (v.text !== undefined) return cellText(v.text);
    return "";
  }
  return String(value).trim();
}

/**
 * Fecha "YYYY-MM-DD" desde: celda de fecha de Excel, "dd/mm/aaaa", "d-m-aaaa",
 * "aaaa-mm-dd" o número de serie de Excel. Vacío → null. Inválida → Error.
 */
export function parseDateCell(value: unknown): string | null {
  if (value === null || value === undefined || value === "") return null;
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) throw new Error("Fecha inválida");
    return value.toISOString().slice(0, 10);
  }
  if (typeof value === "number") {
    // Número de serie de Excel (días desde 1899-12-30)
    const d = new Date(Date.UTC(1899, 11, 30) + Math.round(value) * 86_400_000);
    return d.toISOString().slice(0, 10);
  }
  const text = cellText(value);
  if (!text) return null;
  let y: number, m: number, d: number;
  let match = text.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
  if (match) {
    [y, m, d] = [Number(match[1]), Number(match[2]), Number(match[3])];
  } else {
    match = text.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})$/);
    if (!match) throw new Error(`Fecha inválida "${text}" (usa dd/mm/aaaa)`);
    [d, m, y] = [Number(match[1]), Number(match[2]), Number(match[3])];
    if (y < 100) y += 2000;
  }
  const date = new Date(Date.UTC(y, m - 1, d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) {
    throw new Error(`Fecha inválida "${text}"`);
  }
  return date.toISOString().slice(0, 10);
}

const FREQUENCY_ALIASES: Record<string, Frequency> = {
  diario: "DAILY",
  diaria: "DAILY",
  semanal: "WEEKLY",
  quincenal: "BIWEEKLY",
  mensual: "MONTHLY",
  bimestral: "BIMONTHLY",
  trimestral: "QUARTERLY",
  semestral: "SEMIANNUAL",
  anual: "ANNUAL",
  personalizada: "CUSTOM",
  personalizado: "CUSTOM",
};

export function parseFrequency(value: string): Frequency | null {
  const key = normalizeKey(value);
  if (!key) return null;
  const byCode = FREQUENCIES.find((f) => f.toLowerCase() === key);
  if (byCode) return byCode;
  const byLabel = FREQUENCIES.find((f) => normalizeKey(FREQUENCY_LABELS[f]) === key);
  return byLabel ?? FREQUENCY_ALIASES[key] ?? null;
}

const STATUS_ALIASES: Record<string, "ACTIVE" | "INACTIVE" | "MAINTENANCE" | "RETIRED"> = {
  activo: "ACTIVE",
  active: "ACTIVE",
  inactivo: "INACTIVE",
  inactive: "INACTIVE",
  "en mantenimiento": "MAINTENANCE",
  mantenimiento: "MAINTENANCE",
  maintenance: "MAINTENANCE",
  retirado: "RETIRED",
  retired: "RETIRED",
};

export function parseElementStatus(value: string) {
  const key = normalizeKey(value);
  if (!key) return "ACTIVE" as const;
  return STATUS_ALIASES[key] ?? null;
}

/** Busca por código o por nombre (sin distinguir mayúsculas ni tildes). */
export function findByCodeOrName<T extends { code: string; name: string }>(items: T[], value: string): T | undefined {
  const key = normalizeKey(value);
  if (!key) return undefined;
  return items.find((i) => normalizeKey(i.code) === key) ?? items.find((i) => normalizeKey(i.name) === key);
}

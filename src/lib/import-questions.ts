/**
 * Interpretación de la hoja «Preguntas» de la carga masiva (código puro).
 * Convierte el texto de Excel ("Sí / No", "Bueno / Malo", "Número"…) a los
 * campos que entiende el editor de preguntas (questionSchema).
 */
import type { Priority, ResponseType } from "@/generated/prisma/enums";
import { normalizeKey } from "@/lib/import-parsing";

const RESPONSE_ALIASES: Record<string, ResponseType> = {
  "si/no": "YES_NO",
  "si no": "YES_NO",
  "sino": "YES_NO",
  "si/no/no aplica": "YES_NO_NA",
  "si/no/na": "YES_NO_NA",
  "si/no/n/a": "YES_NO_NA",
  "si/no/n.a.": "YES_NO_NA",
  "cumple/no cumple": "COMPLIES",
  cumple: "COMPLIES",
  texto: "TEXT",
  "texto libre": "TEXT",
  numero: "NUMBER",
  cantidad: "NUMBER",
  fecha: "DATE",
  seleccion: "SELECT",
  "seleccion unica": "SELECT",
  lista: "SELECT",
  opciones: "SELECT",
  "seleccion multiple": "MULTI_SELECT",
  foto: "PHOTO",
  fotografia: "PHOTO",
  "archivo/foto": "PHOTO",
};

export const RESPONSE_TYPE_IMPORT_LABELS: Record<ResponseType, string> = {
  YES_NO: "Sí/No",
  YES_NO_NA: "Sí/No/No aplica",
  COMPLIES: "Cumple/No cumple",
  TEXT: "Texto",
  NUMBER: "Número",
  DATE: "Fecha",
  SELECT: "Selección",
  MULTI_SELECT: "Selección múltiple",
  PHOTO: "Foto",
};

export function parseResponseType(value: string): ResponseType | null {
  const key = normalizeKey(value).replace(/\s*\/\s*/g, "/");
  return RESPONSE_ALIASES[key] ?? null;
}

/** "Bueno / Malo", "Bueno; Malo" o una por línea → ["Bueno", "Malo"] (sin repetidos). */
export function splitOptions(value: string): string[] {
  const parts = value
    .split(/\s*(?:\/|;|\n)\s*/)
    .map((p) => p.trim())
    .filter(Boolean);
  const seen = new Set<string>();
  return parts.filter((p) => {
    const k = normalizeKey(p);
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

/** Sí/No de una celda (vacía = valor por defecto; null = no reconocido). */
export function parseYesNo(value: string, fallback: boolean): boolean | null {
  const key = normalizeKey(value);
  if (!key) return fallback;
  if (["si", "s", "x", "true", "1", "verdadero"].includes(key)) return true;
  if (["no", "n", "false", "0", "falso"].includes(key)) return false;
  return null;
}

const PRIORITY_ALIASES: Record<string, Priority> = {
  baja: "LOW",
  media: "MEDIUM",
  alta: "HIGH",
  critica: "CRITICAL",
};

export function parsePriority(value: string): Priority | null {
  const key = normalizeKey(value);
  if (!key) return "MEDIUM";
  return PRIORITY_ALIASES[key] ?? null;
}

export interface QuestionRowInput {
  text: string;
  responseType: string;
  options: string;
  nonCompliant: string;
  min: string;
  max: string;
  required: string;
  generatesFinding: string;
  priority: string;
  tracksExpiry: string;
  helpText: string;
}

/**
 * Fila de Excel → objeto para questionSchema (el mismo validador del editor),
 * o la lista de errores de la fila.
 */
export function questionRowToForm(row: QuestionRowInput): { form: Record<string, unknown>; errors: string[] } {
  const errors: string[] = [];
  const responseType = parseResponseType(row.responseType);
  if (!responseType) errors.push(`Tipo de respuesta «${row.responseType}» no válido (usa Sí/No, Sí/No/No aplica, Número, Fecha, Selección, Texto o Foto)`);

  const flag = (label: string, value: string, fallback: boolean) => {
    const v = parseYesNo(value, fallback);
    if (v === null) errors.push(`${label}: escribe Sí o No`);
    return v ?? fallback;
  };
  const required = flag("Obligatoria", row.required, true);
  const generatesFinding = flag("Genera hallazgo", row.generatesFinding, true);
  const tracksExpiry = flag("Es fecha de vencimiento", row.tracksExpiry, false);
  if (tracksExpiry && responseType && responseType !== "DATE") errors.push("Solo una pregunta de tipo Fecha puede ser fecha de vencimiento");

  const priority = parsePriority(row.priority);
  if (!priority) errors.push(`Prioridad «${row.priority}» no válida (Baja, Media, Alta o Crítica)`);

  const num = (label: string, value: string) => {
    if (!value.trim()) return undefined;
    const n = Number(value.replace(",", "."));
    if (!Number.isFinite(n)) errors.push(`${label}: debe ser un número`);
    return Number.isFinite(n) ? n : undefined;
  };

  const options = splitOptions(row.options);
  const nonCompliant = splitOptions(row.nonCompliant);
  const form: Record<string, unknown> = {
    text: row.text,
    helpText: row.helpText || undefined,
    responseType: responseType ?? undefined,
    required,
    active: true,
    generatesFinding,
    defaultPriority: priority ?? "MEDIUM",
    tracksExpiry,
    min: responseType === "NUMBER" ? num("Mínimo", row.min) : undefined,
    max: responseType === "NUMBER" ? num("Máximo", row.max) : undefined,
    nonCompliantOptions: [] as string[],
  };

  if (responseType === "SELECT" || responseType === "MULTI_SELECT") {
    if (options.length < 2) errors.push("Selección: escribe al menos 2 opciones separadas por /");
    const unknown = nonCompliant.filter((v) => !options.some((o) => normalizeKey(o) === normalizeKey(v)));
    if (unknown.length) errors.push(`«No cumple si» debe ser una de las opciones: ${unknown.join(", ")}`);
    form.optionsText = options.join("\n");
    form.nonCompliantOptions = options.filter((o) => nonCompliant.some((v) => normalizeKey(v) === normalizeKey(o)));
  } else if (responseType === "YES_NO" || responseType === "YES_NO_NA") {
    const key = normalizeKey(nonCompliant[0] ?? "");
    if (key && !["si", "no"].includes(key)) errors.push("«No cumple si» para Sí/No debe ser Sí o No");
    form.nonCompliantAnswer = key === "si" ? "YES" : "NO";
  } else if (row.nonCompliant.trim() && responseType !== "COMPLIES") {
    errors.push("«No cumple si» solo aplica a Sí/No y Selección (para Número usa Mínimo / Máximo)");
  }
  return { form, errors };
}

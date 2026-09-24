/**
 * Motor de reglas de las preguntas dinámicas (código puro, cliente y servidor).
 *
 *  - Define el formato de `options` y `complianceRule` guardados en JSON.
 *  - Valida/normaliza el valor de una respuesta según su tipo.
 *  - Evalúa si una respuesta cumple (true), no cumple (false) o no es
 *    evaluable (null: texto, foto, "No aplica", sin regla).
 *
 * Valores normalizados por tipo:
 *   YES_NO / YES_NO_NA → "YES" | "NO" | "NA"
 *   COMPLIES           → "COMPLIES" | "NOT_COMPLIES"
 *   TEXT               → string
 *   NUMBER             → number
 *   DATE               → "YYYY-MM-DD"
 *   SELECT             → string (valor de una opción)
 *   MULTI_SELECT       → string[]
 *   PHOTO              → null (las fotos se guardan como Evidence de la respuesta)
 */
import { z } from "zod";
import type { ResponseType } from "@/generated/prisma/enums";

export const optionSchema = z.object({ value: z.string().min(1).max(100), label: z.string().min(1).max(100) });
export const optionsSchema = z.array(optionSchema).max(50);
export type QuestionOption = z.infer<typeof optionSchema>;

export const complianceRuleSchema = z.object({
  /** Valores que NO cumplen (Sí/No, Cumple, Selección). */
  nonCompliantValues: z.array(z.string()).optional(),
  /** Rango aceptable para NUMBER. */
  min: z.number().optional(),
  max: z.number().optional(),
  /** DATE: cumple solo si la fecha es hoy o futura (p.ej. fecha de vencimiento). */
  dateNotPast: z.boolean().optional(),
});
export type ComplianceRule = z.infer<typeof complianceRuleSchema>;

export interface RuleQuestion {
  responseType: ResponseType;
  options?: unknown;
  complianceRule?: unknown;
}

/** Tipos cuya respuesta puede evaluarse como cumple / no cumple. */
export const EVALUABLE_TYPES: readonly ResponseType[] = [
  "YES_NO",
  "YES_NO_NA",
  "COMPLIES",
  "NUMBER",
  "DATE",
  "SELECT",
  "MULTI_SELECT",
];

/** Valores no conformes por defecto (si la pregunta no define regla). */
const DEFAULT_NON_COMPLIANT: Partial<Record<ResponseType, string[]>> = {
  YES_NO: ["NO"],
  YES_NO_NA: ["NO"],
  COMPLIES: ["NOT_COMPLIES"],
};

/** Opciones fijas de los tipos binarios, con su etiqueta. */
export const FIXED_CHOICES: Partial<Record<ResponseType, QuestionOption[]>> = {
  YES_NO: [
    { value: "YES", label: "Sí" },
    { value: "NO", label: "No" },
  ],
  YES_NO_NA: [
    { value: "YES", label: "Sí" },
    { value: "NO", label: "No" },
    { value: "NA", label: "No aplica" },
  ],
  COMPLIES: [
    { value: "COMPLIES", label: "Cumple" },
    { value: "NOT_COMPLIES", label: "No cumple" },
  ],
};

export function parseOptions(raw: unknown): QuestionOption[] {
  const parsed = optionsSchema.safeParse(raw);
  return parsed.success ? parsed.data : [];
}

export function parseRule(raw: unknown): ComplianceRule {
  const parsed = complianceRuleSchema.safeParse(raw ?? {});
  return parsed.success ? parsed.data : {};
}

/** Opciones disponibles para responder (fijas o configuradas). */
export function choicesFor(question: RuleQuestion): QuestionOption[] {
  return FIXED_CHOICES[question.responseType] ?? parseOptions(question.options);
}

/** Valores no conformes efectivos (regla configurada o valores por defecto). */
export function nonCompliantValuesFor(question: RuleQuestion): string[] {
  const rule = parseRule(question.complianceRule);
  return rule.nonCompliantValues ?? DEFAULT_NON_COMPLIANT[question.responseType] ?? [];
}

/** ¿La pregunta tiene una regla que permita evaluar cumplimiento? */
export function isEvaluable(question: RuleQuestion): boolean {
  const rule = parseRule(question.complianceRule);
  switch (question.responseType) {
    case "YES_NO":
    case "YES_NO_NA":
    case "COMPLIES":
      return true;
    case "SELECT":
    case "MULTI_SELECT":
      return (rule.nonCompliantValues?.length ?? 0) > 0;
    case "NUMBER":
      return rule.min !== undefined || rule.max !== undefined;
    case "DATE":
      return rule.dateNotPast === true;
    default:
      return false;
  }
}

export type AnswerValue = string | number | string[] | null;

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Valida y normaliza el valor recibido del cliente. Lanza un Error con
 * mensaje para el usuario si el valor no es válido para la pregunta.
 * `null`/vacío significa "sin responder".
 */
export function normalizeAnswerValue(question: RuleQuestion, raw: unknown): AnswerValue {
  if (raw === null || raw === undefined || raw === "") return null;
  switch (question.responseType) {
    case "YES_NO":
    case "YES_NO_NA":
    case "COMPLIES":
    case "SELECT": {
      const value = String(raw);
      if (!choicesFor(question).some((c) => c.value === value)) throw new Error("Selecciona una opción válida");
      return value;
    }
    case "MULTI_SELECT": {
      const values = Array.isArray(raw) ? raw.map(String) : [String(raw)];
      const allowed = new Set(choicesFor(question).map((c) => c.value));
      if (values.some((v) => !allowed.has(v))) throw new Error("Selecciona opciones válidas");
      const unique = [...new Set(values)];
      return unique.length ? unique : null;
    }
    case "NUMBER": {
      const n = typeof raw === "number" ? raw : Number(String(raw).replace(",", "."));
      if (!Number.isFinite(n)) throw new Error("Ingresa un número válido");
      return n;
    }
    case "DATE": {
      const value = String(raw);
      if (!DATE_RE.test(value) || Number.isNaN(Date.parse(`${value}T00:00:00Z`))) {
        throw new Error("Ingresa una fecha válida");
      }
      return value;
    }
    case "TEXT": {
      const value = String(raw).trim();
      if (value.length > 2000) throw new Error("Máximo 2000 caracteres");
      return value || null;
    }
    case "PHOTO":
      return null;
  }
}

/**
 * Evalúa el cumplimiento de una respuesta ya normalizada.
 * `today` es la fecha local actual "YYYY-MM-DD" (para reglas de fecha).
 */
export function evaluateCompliance(question: RuleQuestion, value: AnswerValue, today: string): boolean | null {
  if (value === null || value === "NA") return null;
  if (!isEvaluable(question)) return null;
  const rule = parseRule(question.complianceRule);

  switch (question.responseType) {
    case "YES_NO":
    case "YES_NO_NA":
    case "COMPLIES":
    case "SELECT":
      return !nonCompliantValuesFor(question).includes(String(value));
    case "MULTI_SELECT": {
      const bad = new Set(nonCompliantValuesFor(question));
      return !(Array.isArray(value) ? value : [String(value)]).some((v) => bad.has(v));
    }
    case "NUMBER": {
      const n = Number(value);
      if (rule.min !== undefined && n < rule.min) return false;
      if (rule.max !== undefined && n > rule.max) return false;
      return true;
    }
    case "DATE":
      return String(value) >= today;
    default:
      return null;
  }
}

/** Texto legible de un valor (historial, reportes). */
export function formatAnswerValue(question: RuleQuestion, value: unknown): string {
  if (value === null || value === undefined || value === "") return "—";
  const choices = choicesFor(question);
  const label = (v: string) => choices.find((c) => c.value === v)?.label ?? v;
  if (Array.isArray(value)) return value.map((v) => label(String(v))).join(", ");
  if (question.responseType === "DATE" && typeof value === "string" && DATE_RE.test(value)) {
    const [y, m, d] = value.split("-");
    return `${d}/${m}/${y}`;
  }
  return label(String(value));
}

/** Describe la regla de cumplimiento para mostrarla al administrador. */
export function describeRule(question: RuleQuestion): string | null {
  if (!isEvaluable(question)) return null;
  const rule = parseRule(question.complianceRule);
  switch (question.responseType) {
    case "NUMBER":
      if (rule.min !== undefined && rule.max !== undefined) return `Cumple entre ${rule.min} y ${rule.max}`;
      if (rule.min !== undefined) return `Cumple si es ≥ ${rule.min}`;
      return `Cumple si es ≤ ${rule.max}`;
    case "DATE":
      return "Cumple si la fecha es hoy o posterior";
    default: {
      const labels = nonCompliantValuesFor(question).map(
        (v) => choicesFor(question).find((c) => c.value === v)?.label ?? v,
      );
      return `No cumple si responde: ${labels.join(", ")}`;
    }
  }
}

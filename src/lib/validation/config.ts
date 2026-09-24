import { z } from "zod";
import { ElementStatus, InspectionFrequency, Priority, ResponseType } from "@/generated/prisma/enums";
import { zCheckbox, zCode, zId, zOptionalText, zRequiredText } from "@/lib/validation/form";
import { isEvaluable, type ComplianceRule, type QuestionOption } from "@/lib/inspection-rules";

const zFrequency = z.enum(InspectionFrequency, { error: "Selecciona una frecuencia" });

const zOptionalInt = (label: string, min: number, max: number) =>
  z.coerce
    .number({ error: `${label} debe ser un número` })
    .int(`${label} debe ser un número entero`)
    .min(min, `${label}: mínimo ${min}`)
    .max(max, `${label}: máximo ${max}`)
    .optional();

/** Si la frecuencia es personalizada, exige los días. */
function refineCustomDays(field: "frequencyDays" | "defaultFrequencyDays") {
  return (data: Record<string, unknown>, ctx: z.RefinementCtx) => {
    const frequency = data.frequency ?? data.defaultFrequency;
    if (frequency === "CUSTOM" && !data[field]) {
      ctx.addIssue({ code: "custom", path: [field], message: "Indica cada cuántos días se inspecciona" });
    }
  };
}

// ------------------------------------------------------- Tipos de elemento
export const elementTypeSchema = z
  .object({
    id: zId.optional(),
    code: zCode(),
    name: zRequiredText("El nombre", 80),
    description: zOptionalText(500),
    codePrefix: z
      .string()
      .trim()
      .toUpperCase()
      .max(10, "Máximo 10 caracteres")
      .regex(/^[A-Z0-9]*$/, "Solo letras y números")
      .optional(),
    defaultFrequency: zFrequency,
    defaultFrequencyDays: zOptionalInt("Los días", 1, 3650),
    active: zCheckbox,
  })
  .superRefine(refineCustomDays("defaultFrequencyDays"))
  .transform((d) => ({ ...d, defaultFrequencyDays: d.defaultFrequency === "CUSTOM" ? d.defaultFrequencyDays : undefined }));

// ------------------------------------------------------------- Preguntas
const zOptionalNumber = z.coerce.number({ error: "Debe ser un número" }).optional();

export const questionSchema = z
  .object({
    id: zId.optional(),
    elementTypeId: zId,
    text: zRequiredText("La pregunta", 300).pipe(z.string().min(3, "Mínimo 3 caracteres")),
    helpText: zOptionalText(500),
    responseType: z.enum(ResponseType, { error: "Selecciona el tipo de respuesta" }),
    required: zCheckbox,
    active: zCheckbox,
    generatesFinding: zCheckbox,
    defaultPriority: z.enum(Priority).default("MEDIUM"),
    // Configuración según tipo (llega del formulario)
    optionsText: z.string().max(5000).optional(),
    nonCompliantAnswer: z.enum(["NO", "YES"]).optional(),
    nonCompliantOptions: z.array(z.string().max(100)).default([]),
    min: zOptionalNumber,
    max: zOptionalNumber,
    dateNotPast: zCheckbox,
  })
  .transform((d, ctx) => {
    let options: QuestionOption[] | null = null;
    const rule: ComplianceRule = {};

    if (d.responseType === "SELECT" || d.responseType === "MULTI_SELECT") {
      const labels = [...new Set((d.optionsText ?? "").split("\n").map((l) => l.trim()).filter(Boolean))];
      if (labels.length < 2) {
        ctx.addIssue({ code: "custom", path: ["optionsText"], message: "Escribe al menos 2 opciones (una por línea)" });
        return z.NEVER;
      }
      if (labels.some((l) => l.length > 100)) {
        ctx.addIssue({ code: "custom", path: ["optionsText"], message: "Cada opción admite máximo 100 caracteres" });
        return z.NEVER;
      }
      options = labels.map((label) => ({ value: label, label }));
      const bad = d.nonCompliantOptions.filter((v) => labels.includes(v));
      if (bad.length) rule.nonCompliantValues = bad;
    }
    if (d.responseType === "YES_NO" || d.responseType === "YES_NO_NA") {
      // Por defecto "NO" no cumple; se invierte para preguntas negativas ("¿Tiene faltantes?").
      if (d.nonCompliantAnswer === "YES") rule.nonCompliantValues = ["YES"];
    }
    if (d.responseType === "NUMBER") {
      if (d.min !== undefined && d.max !== undefined && d.min > d.max) {
        ctx.addIssue({ code: "custom", path: ["max"], message: "El máximo debe ser mayor o igual al mínimo" });
        return z.NEVER;
      }
      if (d.min !== undefined) rule.min = d.min;
      if (d.max !== undefined) rule.max = d.max;
    }
    if (d.responseType === "DATE" && d.dateNotPast) rule.dateNotPast = true;

    const complianceRule = Object.keys(rule).length ? rule : null;
    const evaluable = isEvaluable({ responseType: d.responseType, options, complianceRule });

    return {
      id: d.id,
      elementTypeId: d.elementTypeId,
      text: d.text,
      helpText: d.helpText ?? null,
      responseType: d.responseType,
      required: d.required,
      active: d.active,
      // Solo las preguntas evaluables pueden proponer hallazgos.
      generatesFinding: evaluable && d.generatesFinding,
      defaultPriority: d.defaultPriority,
      options,
      complianceRule,
    };
  });

export const QUESTION_FORM_ARRAYS = ["nonCompliantOptions"] as const;

// ------------------------------------------------------------ Elementos
const zDateInput = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha inválida")
  .transform((v) => new Date(`${v}T12:00:00.000Z`))
  .optional();

export const elementSchema = z
  .object({
    id: zId.optional(),
    elementTypeId: z.string({ error: "Selecciona el tipo" }).min(1, "Selecciona el tipo").max(64),
    code: zRequiredText("El código", 40)
      .transform((v) => v.toUpperCase())
      .pipe(z.string().regex(/^[A-Z0-9_-]+$/, "Solo letras, números, guion (-) o guion bajo (_)")),
    name: zRequiredText("El nombre", 150),
    description: zOptionalText(1000),
    processId: z.string({ error: "Selecciona el proceso" }).min(1, "Selecciona el proceso"),
    siteId: z.string({ error: "Selecciona la sede" }).min(1, "Selecciona la sede"),
    zoneId: zId.optional(),
    location: zOptionalText(200),
    responsibleId: zId.optional(),
    frequency: zFrequency,
    frequencyDays: zOptionalInt("Los días", 1, 3650),
    lastInspectionAt: zDateInput,
    firstInspectionAt: zDateInput,
    status: z.enum(ElementStatus).default("ACTIVE"),
  })
  .superRefine(refineCustomDays("frequencyDays"))
  .superRefine((d, ctx) => {
    if (d.lastInspectionAt && d.lastInspectionAt.getTime() > Date.now() + 86_400_000) {
      ctx.addIssue({ code: "custom", path: ["lastInspectionAt"], message: "La última inspección no puede ser futura" });
    }
  })
  .transform((d) => ({
    ...d,
    frequencyDays: d.frequency === "CUSTOM" ? (d.frequencyDays ?? null) : null,
  }));

export const elementListQuerySchema = z.object({
  q: z.string().trim().max(100).optional().catch(undefined),
  page: z.coerce.number().int().min(1).max(10_000).catch(1).default(1),
  type: z.string().max(64).optional().catch(undefined),
  process: z.string().max(64).optional().catch(undefined),
  site: z.string().max(64).optional().catch(undefined),
  status: z.enum(ElementStatus).optional().catch(undefined),
  schedule: z.enum(["OVERDUE", "DUE_SOON", "ON_TIME"]).optional().catch(undefined),
});

export type ElementListQuery = z.infer<typeof elementListQuerySchema>;

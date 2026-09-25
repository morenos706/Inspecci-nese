import { z } from "zod";
import { Priority } from "@/generated/prisma/enums";
import { zId, zRequiredText } from "@/lib/validation/form";

const zDueDate = z
  .string({ error: "Indica la fecha límite" })
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha inválida");

/**
 * Hallazgo registrado desde una respuesta que no cumple (durante la
 * inspección). El brigadista describe lo encontrado; el plan de acción,
 * el responsable y la fecha límite se asignan en la revisión.
 */
export const findingFromAnswerSchema = z.object({
  inspectionId: zId,
  answerId: zId,
  description: zRequiredText("La descripción", 1000).pipe(z.string().min(5, "Describe el hallazgo (mínimo 5 caracteres)")),
  priority: z.enum(Priority, { error: "Selecciona la prioridad" }),
  requiredAction: z.string().trim().max(1000).optional().transform((v) => v || undefined),
});

/** Revisión: asignar el plan de acción de un hallazgo. */
export const reviewAssignSchema = z.object({
  findingId: zId,
  action: zRequiredText("La acción", 1000).pipe(z.string().min(5, "Describe la acción (mínimo 5 caracteres)")),
  responsibleId: z.string({ error: "Selecciona el responsable" }).min(1, "Selecciona el responsable").max(64),
  dueDate: zDueDate,
  priority: z.enum(Priority, { error: "Selecciona la prioridad" }),
});

/** Revisión: el hallazgo no procede (se cierra con el motivo). */
export const reviewDismissSchema = z.object({
  findingId: zId,
  reason: zRequiredText("El motivo", 500).pipe(z.string().min(5, "Explica por qué no procede (mínimo 5 caracteres)")),
});

export type FindingFromAnswerInput = z.infer<typeof findingFromAnswerSchema>;

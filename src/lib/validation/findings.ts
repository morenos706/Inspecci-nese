import { z } from "zod";
import { Priority } from "@/generated/prisma/enums";
import { zId, zRequiredText } from "@/lib/validation/form";

const zDueDate = z
  .string({ error: "Indica la fecha límite" })
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha inválida");

/** Hallazgo registrado desde una respuesta que no cumple (durante la inspección). */
export const findingFromAnswerSchema = z.object({
  inspectionId: zId,
  answerId: zId,
  description: zRequiredText("La descripción", 1000).pipe(z.string().min(5, "Describe el hallazgo (mínimo 5 caracteres)")),
  priority: z.enum(Priority, { error: "Selecciona la prioridad" }),
  requiredAction: zRequiredText("La acción requerida", 1000).pipe(z.string().min(5, "Describe la acción (mínimo 5 caracteres)")),
  responsibleId: z.string({ error: "Selecciona el responsable" }).min(1, "Selecciona el responsable").max(64),
  dueDate: zDueDate,
});

export type FindingFromAnswerInput = z.infer<typeof findingFromAnswerSchema>;

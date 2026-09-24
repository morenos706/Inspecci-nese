/**
 * Cálculo del resultado de una inspección (código puro).
 *
 *  - Cumplimiento % = respuestas que cumplen / respuestas evaluables.
 *    Texto, foto y "No aplica" no cuentan.
 *  - Resultado = NO CUMPLE si hay al menos una respuesta que no cumple.
 */
import type { Priority } from "@/generated/prisma/enums";

export interface AnswerForResult {
  questionId: string;
  hasValue: boolean;
  isCompliant: boolean | null;
}

export interface QuestionForResult {
  id: string;
  required: boolean;
  responseType: string;
}

export function computeInspectionResult(
  questions: QuestionForResult[],
  answers: AnswerForResult[],
  photoCountByQuestion: Record<string, number> = {},
) {
  const byQuestion = new Map(answers.map((a) => [a.questionId, a]));
  const isAnswered = (q: QuestionForResult) =>
    q.responseType === "PHOTO" ? (photoCountByQuestion[q.id] ?? 0) > 0 : Boolean(byQuestion.get(q.id)?.hasValue);

  const missingRequired = questions.filter((q) => q.required && !isAnswered(q)).map((q) => q.id);
  const answeredCount = questions.filter(isAnswered).length;
  const evaluated = answers.filter((a) => a.isCompliant !== null);
  const compliantCount = evaluated.filter((a) => a.isCompliant).length;
  const nonCompliantCount = evaluated.length - compliantCount;

  return {
    totalQuestions: questions.length,
    answeredCount,
    missingRequired,
    compliantCount,
    nonCompliantCount,
    compliancePct: evaluated.length ? Math.round((compliantCount / evaluated.length) * 10_000) / 100 : null,
    result: nonCompliantCount > 0 ? ("NON_COMPLIANT" as const) : ("COMPLIANT" as const),
  };
}

/** Días sugeridos para la fecha límite de un hallazgo según su prioridad. */
export const DEFAULT_DUE_DAYS: Record<Priority, number> = {
  CRITICAL: 1,
  HIGH: 7,
  MEDIUM: 15,
  LOW: 30,
};

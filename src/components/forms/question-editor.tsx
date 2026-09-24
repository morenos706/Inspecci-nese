"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowDown, ArrowUp, ListChecks, Pencil, Plus, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { ConfirmButton } from "@/components/ui/confirm-button";
import { EmptyState } from "@/components/ui/empty-state";
import { QuestionForm, type QuestionValues } from "@/components/forms/question-form";
import { choicesFor, describeRule } from "@/lib/inspection-rules";
import { PRIORITY_LABELS, PRIORITY_TONES, RESPONSE_TYPE_LABELS } from "@/lib/labels";
import { deleteQuestionAction, moveQuestionAction } from "@/server/actions/element-types.actions";

/**
 * Editor de la lista de preguntas de un tipo: agregar, editar en línea,
 * reordenar (botones accesibles, funcionan en móvil) y eliminar.
 */
export function QuestionEditor({
  elementTypeId,
  questions,
  templateVersion,
}: {
  elementTypeId: string;
  questions: QuestionValues[];
  templateVersion: number;
}) {
  const [editing, setEditing] = useState<string | null>(null);
  const [adding, setAdding] = useState(questions.length === 0);
  const [moving, startMove] = useTransition();
  const router = useRouter();
  const activeCount = questions.filter((q) => q.active).length;

  function move(id: string, direction: "up" | "down") {
    startMove(async () => {
      const result = await moveQuestionAction(id, direction);
      if (!result.ok) toast.error(result.message ?? "No se pudo reordenar");
      router.refresh();
    });
  }

  return (
    <Card>
      <CardHeader
        title="Preguntas de inspección"
        description={`${activeCount} activa(s) · plantilla v${templateVersion}. El formulario de inspección se genera con estas preguntas, en este orden.`}
        actions={
          !adding && (
            <Button size="sm" onClick={() => setAdding(true)}>
              <Plus className="h-4 w-4" aria-hidden /> Agregar
            </Button>
          )
        }
      />

      {questions.length === 0 && !adding && (
        <EmptyState icon={ListChecks} title="Sin preguntas" description="Agrega la primera pregunta de la inspección." />
      )}

      <ol className="divide-y divide-border" aria-busy={moving || undefined}>
        {questions.map((q, index) => (
          <li key={q.id} className="px-4 py-3 sm:px-6">
            {editing === q.id ? (
              <QuestionForm elementTypeId={elementTypeId} question={q} onDone={() => setEditing(null)} />
            ) : (
              <div className="flex gap-3">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-surface-muted text-sm font-semibold text-muted">
                  {index + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <p className={q.active ? "font-medium" : "font-medium text-subtle line-through"}>{q.text}</p>
                  {q.helpText && <p className="text-sm text-subtle">{q.helpText}</p>}
                  <div className="mt-1.5 flex flex-wrap gap-1">
                    <Badge tone="primary">{RESPONSE_TYPE_LABELS[q.responseType]}</Badge>
                    {q.required && <Badge>Obligatoria</Badge>}
                    {!q.active && <Badge tone="neutral">Inactiva</Badge>}
                    {q.generatesFinding && (
                      <Badge tone={PRIORITY_TONES[q.defaultPriority]}>Hallazgo · {PRIORITY_LABELS[q.defaultPriority]}</Badge>
                    )}
                    {q.answerCount > 0 && <Badge tone="info">{q.answerCount} respuesta(s)</Badge>}
                  </div>
                  {(q.responseType === "SELECT" || q.responseType === "MULTI_SELECT") && (
                    <p className="mt-1 text-xs text-subtle">
                      Opciones: {choicesFor(q).map((c) => c.label).join(" · ")}
                    </p>
                  )}
                  {describeRule(q) && <p className="mt-1 text-xs text-subtle">{describeRule(q)}</p>}
                </div>
                <div className="flex shrink-0 flex-col gap-1 sm:flex-row sm:items-start">
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => move(q.id, "up")}
                    disabled={index === 0 || moving}
                    aria-label={`Subir pregunta ${index + 1}`}
                  >
                    <ArrowUp className="h-4 w-4" aria-hidden />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => move(q.id, "down")}
                    disabled={index === questions.length - 1 || moving}
                    aria-label={`Bajar pregunta ${index + 1}`}
                  >
                    <ArrowDown className="h-4 w-4" aria-hidden />
                  </Button>
                  <Button variant="ghost" size="icon" onClick={() => setEditing(q.id)} aria-label={`Editar pregunta ${index + 1}`}>
                    <Pencil className="h-4 w-4" aria-hidden />
                  </Button>
                  <ConfirmButton
                    action={deleteQuestionAction.bind(null, q.id)}
                    title="Eliminar pregunta"
                    description={
                      q.answerCount > 0
                        ? "La pregunta dejará de aparecer en nuevas inspecciones. Las inspecciones anteriores conservan su respuesta."
                        : "La pregunta dejará de aparecer en nuevas inspecciones."
                    }
                    confirmLabel="Eliminar"
                    variant="ghost"
                    size="icon"
                    ariaLabel={`Eliminar pregunta ${index + 1}`}
                  >
                    <Trash2 className="h-4 w-4 text-danger" aria-hidden />
                  </ConfirmButton>
                </div>
              </div>
            )}
          </li>
        ))}
      </ol>

      {adding && (
        <CardBody className="border-t border-border bg-surface-muted/60">
          <h3 className="mb-3 text-sm font-semibold">Nueva pregunta</h3>
          <QuestionForm elementTypeId={elementTypeId} />
          {questions.length > 0 && (
            <Button variant="ghost" size="sm" className="mt-2" onClick={() => setAdding(false)}>
              Cerrar
            </Button>
          )}
        </CardBody>
      )}
    </Card>
  );
}

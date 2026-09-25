"use client";

import { useState, useTransition, type FormEvent } from "react";
import { toast } from "sonner";
import { ClipboardCheck } from "lucide-react";
import type { Priority } from "@/generated/prisma/enums";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { Input, Select, Textarea } from "@/components/ui/input";
import { initialActionState, type ActionState } from "@/lib/action-state";
import { DEFAULT_DUE_DAYS } from "@/lib/inspection-result";
import { PRIORITIES, PRIORITY_LABELS, PRIORITY_TONES } from "@/lib/labels";
import { addDaysISO, formatNumber } from "@/lib/utils";
import { assignFindingPlanAction, dismissFindingAction } from "@/server/actions/action-plans.actions";

export interface ReviewFinding {
  id: string;
  number: number;
  description: string;
  priority: Priority;
  requiredAction: string | null;
  evidences: { id: string; fileName: string }[];
}

type UserOption = { id: string; name: string; jobTitle: string | null };

/**
 * Revisión de una inspección con hallazgos: por cada hallazgo, quien gestiona
 * el proceso asigna el plan de acción (acción, responsable, fecha límite) o lo
 * cierra como «no procede». Al terminar el último, la inspección queda revisada.
 */
export function ReviewPanel({
  inspectionId,
  findings,
  users,
  defaultResponsibleId,
  today,
}: {
  inspectionId: string;
  findings: ReviewFinding[];
  users: UserOption[];
  defaultResponsibleId: string | null;
  today: string;
}) {
  return (
    <section className="mb-6 rounded-xl border-2 border-amber-300 bg-surface shadow-sm" aria-labelledby="review-title">
      <div className="flex items-start gap-3 border-b border-border p-4 sm:px-6">
        <ClipboardCheck className="mt-0.5 h-6 w-6 shrink-0 text-warning" aria-hidden />
        <div>
          <h2 id="review-title" className="font-semibold">
            Revisión: {findings.length} hallazgo(s) por asignar
          </h2>
          <p className="text-sm text-muted">
            Asigna a cada hallazgo la acción de mejora, el responsable y la fecha límite. El responsable recibe la notificación
            y la inspección queda revisada cuando no quede ninguno pendiente.
          </p>
        </div>
      </div>
      <ul className="divide-y divide-border">
        {findings.map((f) => (
          <li key={f.id} className="p-4 sm:px-6">
            <FindingReview
              inspectionId={inspectionId}
              finding={f}
              users={users}
              defaultResponsibleId={defaultResponsibleId}
              today={today}
            />
          </li>
        ))}
      </ul>
    </section>
  );
}

/**
 * Envío con aviso inmediato: al guardar, el hallazgo sale de la lista de
 * pendientes (el formulario se desmonta), así que el toast se muestra aquí
 * mismo en lugar de esperar a un efecto que ya no se ejecutaría.
 */
function useReviewAction(action: (prev: ActionState, formData: FormData) => Promise<ActionState>) {
  const [pending, startTransition] = useTransition();
  const [fieldErrors, setFieldErrors] = useState<ActionState["fieldErrors"]>({});
  const onSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    startTransition(async () => {
      const result = await action(initialActionState, formData);
      setFieldErrors(result.fieldErrors ?? {});
      if (result.ok) toast.success(result.message ?? "Guardado.");
      else toast.error(result.message ?? "No se pudo guardar.");
    });
  };
  return { onSubmit, pending, errors: (name: string) => fieldErrors?.[name] };
}

function FindingReview({
  inspectionId,
  finding,
  users,
  defaultResponsibleId,
  today,
}: {
  inspectionId: string;
  finding: ReviewFinding;
  users: UserOption[];
  defaultResponsibleId: string | null;
  today: string;
}) {
  const [mode, setMode] = useState<"assign" | "dismiss">("assign");
  const [priority, setPriority] = useState<Priority>(finding.priority);
  const [dueDate, setDueDate] = useState(addDaysISO(today, DEFAULT_DUE_DAYS[finding.priority]));
  const [dueTouched, setDueTouched] = useState(false);
  const assign = useReviewAction(assignFindingPlanAction);
  const dismiss = useReviewAction(dismissFindingAction);
  const validDefault = users.some((u) => u.id === defaultResponsibleId) ? defaultResponsibleId! : "";

  return (
    <div className="space-y-3">
      <div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-semibold">Hallazgo {formatNumber(finding.number)}</span>
          <Badge tone={PRIORITY_TONES[finding.priority]}>{PRIORITY_LABELS[finding.priority]}</Badge>
        </div>
        <p className="mt-1 text-sm">{finding.description}</p>
        {finding.requiredAction && <p className="text-sm text-muted">Acción sugerida por el brigadista: {finding.requiredAction}</p>}
        {finding.evidences.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-2">
            {finding.evidences.map((e) => (
              <a key={e.id} href={`/api/evidences/${e.id}`} target="_blank" rel="noopener" className="block h-16 w-16 overflow-hidden rounded-lg border border-border">
                {/* eslint-disable-next-line @next/next/no-img-element -- archivo privado servido con control de acceso */}
                <img src={`/api/evidences/${e.id}`} alt={e.fileName} className="h-full w-full object-cover" loading="lazy" />
              </a>
            ))}
          </div>
        )}
      </div>

      <div className="flex gap-1 rounded-lg bg-surface-muted p-1 text-sm sm:inline-flex" role="tablist" aria-label="Decisión">
        {(
          [
            ["assign", "Asignar plan"],
            ["dismiss", "No procede"],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={mode === key}
            onClick={() => setMode(key)}
            className={`flex-1 rounded-md px-3 py-1.5 font-medium sm:flex-none ${mode === key ? "bg-surface shadow-sm" : "text-subtle"}`}
          >
            {label}
          </button>
        ))}
      </div>

      {mode === "assign" ? (
        <form onSubmit={assign.onSubmit} className="space-y-3" noValidate>
          <input type="hidden" name="findingId" value={finding.id} />
          <input type="hidden" name="inspectionId" value={inspectionId} />
          <FormField label="Acción de mejora" errors={assign.errors("action")} required>
            <Textarea
              id={`ra-${finding.id}`}
              name="action"
              rows={2}
              maxLength={1000}
              defaultValue={finding.requiredAction ?? ""}
              placeholder="Ej.: Enviar el extintor a recarga y reemplazarlo temporalmente"
            />
          </FormField>
          <div className="grid gap-3 sm:grid-cols-3">
            <FormField label="Responsable" errors={assign.errors("responsibleId")} required>
              <Select id={`rr-${finding.id}`} name="responsibleId" defaultValue={validDefault}>
                <option value="">Selecciona…</option>
                {users.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name}
                    {u.jobTitle ? ` — ${u.jobTitle}` : ""}
                  </option>
                ))}
              </Select>
            </FormField>
            <FormField label="Prioridad" errors={assign.errors("priority")} required>
              <Select
                id={`rp-${finding.id}`}
                name="priority"
                value={priority}
                onChange={(e) => {
                  const p = e.target.value as Priority;
                  setPriority(p);
                  if (!dueTouched) setDueDate(addDaysISO(today, DEFAULT_DUE_DAYS[p]));
                }}
              >
                {PRIORITIES.map((p) => (
                  <option key={p} value={p}>
                    {PRIORITY_LABELS[p]}
                  </option>
                ))}
              </Select>
            </FormField>
            <FormField label="Fecha límite" errors={assign.errors("dueDate")} required>
              <Input
                id={`rd-${finding.id}`}
                name="dueDate"
                type="date"
                min={today}
                value={dueDate}
                onChange={(e) => {
                  setDueTouched(true);
                  setDueDate(e.target.value);
                }}
              />
            </FormField>
          </div>
          <Button type="submit" loading={assign.pending} className="w-full sm:w-auto">
            Asignar plan y notificar
          </Button>
        </form>
      ) : (
        <form onSubmit={dismiss.onSubmit} className="space-y-3" noValidate>
          <input type="hidden" name="findingId" value={finding.id} />
          <input type="hidden" name="inspectionId" value={inspectionId} />
          <FormField label="¿Por qué no procede?" errors={dismiss.errors("reason")} required>
            <Textarea
              id={`rn-${finding.id}`}
              name="reason"
              rows={2}
              maxLength={500}
              placeholder="Ej.: Se corrigió en el momento de la inspección / respuesta registrada por error"
            />
          </FormField>
          <Button type="submit" variant="outline" loading={dismiss.pending} className="w-full sm:w-auto">
            Cerrar hallazgo como «no procede»
          </Button>
        </form>
      )}
    </div>
  );
}

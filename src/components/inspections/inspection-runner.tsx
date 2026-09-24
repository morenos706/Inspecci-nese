"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Check, CloudOff, Loader2, MapPin, MessageSquarePlus, RotateCw } from "lucide-react";
import { Alert } from "@/components/ui/alert";
import { ConfirmButton } from "@/components/ui/confirm-button";
import { Textarea } from "@/components/ui/input";
import { AnswerControl, type RunnerQuestion } from "@/components/inspections/answer-control";
import { FindingPanel, type DraftFinding } from "@/components/inspections/finding-panel";
import { PhotoUploader, type EvidenceThumb } from "@/components/inspections/photo-uploader";
import { evaluateCompliance, type AnswerValue } from "@/lib/inspection-rules";
import { cn, formatNumber } from "@/lib/utils";
import {
  cancelInspectionAction,
  finalizeInspectionAction,
  saveAnswerAction,
} from "@/server/actions/inspections.actions";

export interface RunnerAnswer {
  id: string;
  value: AnswerValue;
  isCompliant: boolean | null;
  comment: string | null;
  evidences: EvidenceThumb[];
  findings: DraftFinding[];
}

type SaveStatus = "idle" | "saving" | "saved" | "error";

interface LocalAnswer {
  answerId: string | null;
  value: AnswerValue;
  isCompliant: boolean | null;
  comment: string;
  status: SaveStatus;
}

/**
 * Ejecución de la inspección (móvil primero):
 *  - Preguntas construidas dinámicamente desde la plantilla.
 *  - Autoguardado por respuesta, con estado visible y reintento.
 *  - "No cumple" abre de inmediato el registro del hallazgo.
 *  - Barra fija con progreso y "Finalizar".
 */
export function InspectionRunner({
  inspection,
  questions,
  answers,
  users,
  today,
}: {
  inspection: {
    id: string;
    number: number;
    notes: string | null;
    element: {
      code: string;
      name: string;
      location: string | null;
      responsibleId: string | null;
      typeName: string;
      zoneName: string | null;
      siteName: string;
    };
  };
  questions: RunnerQuestion[];
  answers: Record<string, RunnerAnswer>;
  users: { id: string; name: string; jobTitle: string | null }[];
  today: string;
}) {
  const [local, setLocal] = useState<Record<string, LocalAnswer>>(() =>
    Object.fromEntries(
      Object.entries(answers).map(([qid, a]) => [
        qid,
        { answerId: a.id, value: a.value, isCompliant: a.isCompliant, comment: a.comment ?? "", status: "idle" as SaveStatus },
      ]),
    ),
  );
  const [openComments, setOpenComments] = useState<Record<string, boolean>>({});
  const [notes, setNotes] = useState(inspection.notes ?? "");
  const [online, setOnline] = useState(true);
  const pendingRetry = useRef<Record<string, { value: AnswerValue; comment?: string }>>({});

  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);

  async function save(question: RunnerQuestion, value: AnswerValue, comment?: string) {
    // Respuesta optimista: el color de cumplimiento se ve al instante.
    setLocal((prev) => ({
      ...prev,
      [question.id]: {
        answerId: prev[question.id]?.answerId ?? null,
        comment: comment ?? prev[question.id]?.comment ?? "",
        value,
        isCompliant: evaluateCompliance(question, value, today),
        status: "saving",
      },
    }));
    const result = await saveAnswerAction({
      inspectionId: inspection.id,
      questionId: question.id,
      value: value as string | number | string[] | null,
      ...(comment !== undefined ? { comment: comment || null } : {}),
    });
    if (result.ok) {
      delete pendingRetry.current[question.id];
      setLocal((prev) => ({
        ...prev,
        [question.id]: {
          ...prev[question.id]!,
          answerId: result.answerId ?? prev[question.id]?.answerId ?? null,
          isCompliant: result.isCompliant ?? null,
          status: "saved",
        },
      }));
    } else {
      pendingRetry.current[question.id] = { value, comment };
      setLocal((prev) => ({ ...prev, [question.id]: { ...prev[question.id]!, status: "error" } }));
      toast.error(navigator.onLine ? (result.message ?? "No se pudo guardar") : "Sin conexión: la respuesta no se guardó");
    }
  }

  const photoCount = (qid: string) => answers[qid]?.evidences.length ?? 0;
  const isAnswered = (q: RunnerQuestion) =>
    q.responseType === "PHOTO" ? photoCount(q.id) > 0 : local[q.id]?.value !== null && local[q.id]?.value !== undefined;
  const answered = questions.filter(isAnswered).length;
  const missingRequired = questions.filter((q) => q.required && !isAnswered(q));
  const nonCompliantWithoutFinding = questions.filter(
    (q) => q.generatesFinding && local[q.id]?.isCompliant === false && !(answers[q.id]?.findings.length),
  );
  const unsaved = Object.values(local).some((a) => a.status === "saving" || a.status === "error");
  const progress = questions.length ? Math.round((answered / questions.length) * 100) : 0;

  return (
    <div className="pb-40 lg:pb-28">
      {/* Encabezado del elemento */}
      <div className="mb-4 rounded-xl border border-border bg-surface p-4 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-wide text-brand">
          {inspection.element.typeName} · Inspección {formatNumber(inspection.number)}
        </p>
        <h1 className="mt-1 text-2xl font-bold">{inspection.element.code}</h1>
        <p className="text-sm text-muted">{inspection.element.name}</p>
        <p className="mt-2 flex items-start gap-1.5 text-sm text-subtle">
          <MapPin className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <span>
            {inspection.element.siteName}
            {inspection.element.zoneName && ` · ${inspection.element.zoneName}`}
            {inspection.element.location && ` · ${inspection.element.location}`}
          </span>
        </p>
      </div>

      {!online && (
        <Alert tone="warning" className="mb-4" title="Sin conexión">
          Las respuestas no se guardarán hasta recuperar la señal. Puedes reintentar cada una.
        </Alert>
      )}

      <ol className="space-y-3">
        {questions.map((q, index) => {
          const a = local[q.id];
          const server = answers[q.id];
          const status = a?.status ?? "idle";
          const finding = server?.findings[0];
          const showFinding = q.generatesFinding && a?.isCompliant === false && (a.answerId || finding);
          return (
            <li
              key={q.id}
              className={cn(
                "rounded-xl border bg-surface p-4 shadow-sm",
                a?.isCompliant === false ? "border-red-300" : "border-border",
              )}
            >
              <div className="mb-3 flex items-start gap-3">
                <span
                  className={cn(
                    "flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-sm font-semibold",
                    isAnswered(q) ? "bg-primary text-white" : "bg-surface-muted text-muted",
                  )}
                >
                  {isAnswered(q) ? <Check className="h-4 w-4" aria-label="Respondida" /> : index + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <p id={`q-${q.id}-label`} className="text-base font-semibold leading-snug">
                    {q.text}
                    {q.required && (
                      <span className="text-danger" aria-label="obligatoria">
                        {" "}
                        *
                      </span>
                    )}
                  </p>
                  {q.helpText && <p className="mt-0.5 text-sm text-subtle">{q.helpText}</p>}
                </div>
                <span className="shrink-0 text-xs" aria-live="polite">
                  {status === "saving" && <Loader2 className="h-4 w-4 animate-spin text-subtle" aria-label="Guardando" />}
                  {status === "saved" && <span className="text-success">Guardado</span>}
                </span>
              </div>

              {q.responseType === "PHOTO" ? (
                <PhotoUploader
                  target={{ kind: "answer", inspectionId: inspection.id, questionId: q.id }}
                  inspectionId={inspection.id}
                  photos={server?.evidences ?? []}
                  label="Agrega al menos una foto"
                />
              ) : (
                <AnswerControl question={q} value={a?.value ?? null} today={today} onChange={(v) => save(q, v)} />
              )}

              {status === "error" && (
                <button
                  type="button"
                  onClick={() => {
                    const retry = pendingRetry.current[q.id];
                    if (retry) void save(q, retry.value, retry.comment);
                  }}
                  className="mt-2 flex items-center gap-1.5 text-sm font-medium text-danger"
                >
                  <RotateCw className="h-4 w-4" aria-hidden /> No se guardó. Reintentar
                </button>
              )}

              {/* Observación opcional y fotos de apoyo */}
              {q.responseType !== "PHOTO" && (
                <div className="mt-3">
                  {openComments[q.id] || a?.comment ? (
                    <Textarea
                      aria-label={`Observación de la pregunta ${index + 1}`}
                      rows={2}
                      maxLength={1000}
                      placeholder="Observación (opcional)"
                      defaultValue={a?.comment ?? ""}
                      onBlur={(e) => {
                        if ((a?.comment ?? "") !== e.target.value) void save(q, a?.value ?? null, e.target.value);
                      }}
                    />
                  ) : (
                    <button
                      type="button"
                      onClick={() => setOpenComments((o) => ({ ...o, [q.id]: true }))}
                      className="flex items-center gap-1.5 text-sm text-primary"
                    >
                      <MessageSquarePlus className="h-4 w-4" aria-hidden /> Agregar observación
                    </button>
                  )}
                  {(a?.isCompliant === false || (server?.evidences.length ?? 0) > 0) && (
                    <div className="mt-3">
                      <PhotoUploader
                        target={{ kind: "answer", inspectionId: inspection.id, questionId: q.id }}
                        inspectionId={inspection.id}
                        photos={server?.evidences ?? []}
                        label="Fotos de la respuesta"
                      />
                    </div>
                  )}
                </div>
              )}

              {showFinding && (
                <div className="mt-3">
                  <FindingPanel
                    key={finding?.id ?? "new"}
                    inspectionId={inspection.id}
                    answerId={(a?.answerId ?? server?.id)!}
                    questionText={q.text}
                    defaultPriority={q.defaultPriority}
                    defaultResponsibleId={inspection.element.responsibleId}
                    users={users}
                    today={today}
                    finding={finding}
                  />
                </div>
              )}
              {finding && a?.isCompliant !== false && (
                <Alert tone="warning" className="mt-3">
                  Hay un hallazgo ({formatNumber(finding.number)}) registrado para esta pregunta pero la respuesta ahora
                  cumple. Si fue un error, elimínalo antes de finalizar.
                </Alert>
              )}
            </li>
          );
        })}
      </ol>

      <div className="mt-4 rounded-xl border border-border bg-surface p-4 shadow-sm">
        <label htmlFor="inspection-notes" className="text-sm font-semibold">
          Observaciones generales
        </label>
        <Textarea
          id="inspection-notes"
          className="mt-2"
          rows={3}
          maxLength={2000}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Opcional"
        />
      </div>

      <div className="mt-4 flex justify-center">
        <ConfirmButton
          action={cancelInspectionAction.bind(null, inspection.id)}
          title="Anular inspección"
          description="La inspección quedará registrada como anulada y el elemento seguirá pendiente."
          confirmLabel="Anular"
          variant="ghost"
        >
          Anular inspección
        </ConfirmButton>
      </div>

      {/* Barra fija: progreso + finalizar (sobre la navegación inferior en móvil) */}
      <div className="pb-safe fixed inset-x-0 bottom-16 z-20 border-t border-border bg-surface/95 px-4 py-3 backdrop-blur lg:bottom-0 lg:left-64">
        <div className="mx-auto flex max-w-6xl items-center gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium">
              {answered} de {questions.length} respondidas
              {!online && <CloudOff className="ml-2 inline h-4 w-4 text-warning" aria-label="Sin conexión" />}
            </p>
            <div className="mt-1 h-2 overflow-hidden rounded-full bg-surface-muted" aria-hidden>
              <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${progress}%` }} />
            </div>
          </div>
          <ConfirmButton
            action={() => finalizeInspectionAction(inspection.id, notes)}
            title="Finalizar inspección"
            confirmLabel="Finalizar"
            confirmVariant="primary"
            variant="primary"
            description={
              <div className="space-y-2">
                {missingRequired.length > 0 ? (
                  <Alert tone="danger" title={`Faltan ${missingRequired.length} pregunta(s) obligatoria(s)`}>
                    {missingRequired.map((q) => q.text).join(" · ")}
                  </Alert>
                ) : (
                  <p>Se calculará el resultado y se programará la próxima inspección del elemento.</p>
                )}
                {nonCompliantWithoutFinding.length > 0 && (
                  <Alert tone="warning" title="Respuestas que no cumplen sin hallazgo">
                    {nonCompliantWithoutFinding.map((q) => q.text).join(" · ")}
                  </Alert>
                )}
                {unsaved && <Alert tone="warning">Hay respuestas sin guardar.</Alert>}
              </div>
            }
          >
            Finalizar
          </ConfirmButton>
        </div>
      </div>
    </div>
  );
}

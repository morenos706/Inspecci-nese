"use client";

import { useState, type FormEvent } from "react";
import { CheckCircle2, CornerUpLeft, Lock, PlayCircle, ShieldCheck } from "lucide-react";
import { Alert } from "@/components/ui/alert";
import { Button, type ButtonVariant } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { Input, Textarea } from "@/components/ui/input";
import { useActionForm } from "@/hooks/use-action-form";
import type { WorkflowAction } from "@/lib/workflow";
import { addPlanCommentAction, transitionActionPlanAction } from "@/server/actions/action-plans.actions";

const CONFIG: Record<
  WorkflowAction,
  { title: string; button: string; variant: ButtonVariant; icon: typeof PlayCircle; comment?: "required" | "optional"; placeholder?: string }
> = {
  start: { title: "Iniciar la gestión", button: "Iniciar gestión", variant: "secondary", icon: PlayCircle, comment: "optional", placeholder: "Opcional: qué vas a hacer" },
  solve: {
    title: "Reportar solución",
    button: "Marcar como solucionado",
    variant: "primary",
    icon: CheckCircle2,
    comment: "required",
    placeholder: "Describe qué se hizo para solucionarlo",
  },
  verify: { title: "Verificar solución", button: "Verificar", variant: "primary", icon: ShieldCheck, comment: "optional", placeholder: "Opcional" },
  reject: {
    title: "Devolver al responsable",
    button: "Devolver",
    variant: "outline",
    icon: CornerUpLeft,
    comment: "required",
    placeholder: "Explica qué falta o por qué no se aprueba",
  },
  close: { title: "Cerrar plan", button: "Cerrar plan", variant: "primary", icon: Lock },
};

function TransitionForm({
  planId,
  action,
  isExpiry,
  expiryLabel,
  hasEvidence,
  today,
  onSubmit,
  pending,
  errors,
}: {
  planId: string;
  action: WorkflowAction;
  isExpiry: boolean;
  expiryLabel: string;
  hasEvidence: boolean;
  today: string;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  pending: boolean;
  errors: (field: string) => string[] | undefined;
}) {
  const cfg = CONFIG[action];
  return (
    <form onSubmit={onSubmit} className="space-y-3 rounded-lg border border-border p-3" noValidate>
      <input type="hidden" name="planId" value={planId} />
      <input type="hidden" name="action" value={action} />
      <p className="text-sm font-semibold">{cfg.title}</p>
      {action === "solve" && !hasEvidence && (
        <Alert tone="warning">Primero adjunta al menos una evidencia (foto o PDF) de la solución.</Alert>
      )}
      {cfg.comment && (
        <FormField label={cfg.comment === "required" ? "Comentario" : "Comentario (opcional)"} errors={errors("comment")} required={cfg.comment === "required"}>
          <Textarea id={`c-${action}`} name="comment" rows={2} maxLength={2000} placeholder={cfg.placeholder} />
        </FormField>
      )}
      {action === "solve" && isExpiry && (
        <FormField
          label={`Nueva fecha de vencimiento (${expiryLabel.toLowerCase()})`}
          errors={errors("newExpiryDate")}
          hint="Se actualiza en el elemento y se apaga la alerta de vencimiento."
          required
        >
          <Input id="newExpiryDate" name="newExpiryDate" type="date" min={today} />
        </FormField>
      )}
      <Button type="submit" variant={cfg.variant} loading={pending} className="w-full sm:w-auto" disabled={action === "solve" && !hasEvidence}>
        <cfg.icon className="h-4 w-4" aria-hidden /> {cfg.button}
      </Button>
    </form>
  );
}

function CommentForm({ planId }: { planId: string }) {
  const { onSubmit, pending, errors } = useActionForm(addPlanCommentAction, {
    onSuccess: () => (document.getElementById("plan-comment") as HTMLTextAreaElement | null)?.form?.reset(),
  });
  return (
    <form onSubmit={onSubmit} className="space-y-2" noValidate>
      <input type="hidden" name="planId" value={planId} />
      <FormField label="Agregar observación" errors={errors("comment")}>
        <Textarea id="plan-comment" name="comment" rows={2} maxLength={2000} placeholder="Avance, novedades, compras…" />
      </FormField>
      <Button type="submit" variant="outline" size="sm" loading={pending}>
        Guardar observación
      </Button>
    </form>
  );
}

/** Acciones disponibles para el usuario según estado + permisos (calculadas en el servidor). */
export function WorkflowPanel({
  planId,
  actions,
  blockedReason,
  isExpiry,
  expiryLabel,
  hasEvidence,
  canComment,
  today,
}: {
  planId: string;
  actions: WorkflowAction[];
  blockedReason: string | null;
  isExpiry: boolean;
  expiryLabel: string;
  hasEvidence: boolean;
  canComment: boolean;
  today: string;
}) {
  // El envío se maneja aquí (componente que permanece montado): tras el cambio
  // de estado el formulario de la acción desaparece, pero el aviso se muestra.
  const form = useActionForm(transitionActionPlanAction);
  const [active, setActive] = useState<WorkflowAction | null>(null);
  return (
    <div className="space-y-3">
      {actions.length === 0 && blockedReason && <Alert tone="info">{blockedReason}</Alert>}
      {actions.map((a) => (
        <TransitionForm
          key={a}
          planId={planId}
          action={a}
          isExpiry={isExpiry}
          expiryLabel={expiryLabel}
          hasEvidence={hasEvidence}
          today={today}
          onSubmit={(event) => {
            setActive(a);
            form.onSubmit(event);
          }}
          pending={form.pending && active === a}
          errors={(field) => (active === a ? form.errors(field) : undefined)}
        />
      ))}
      {canComment && <CommentForm planId={planId} />}
    </div>
  );
}

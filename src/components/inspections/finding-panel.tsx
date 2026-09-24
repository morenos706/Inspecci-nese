"use client";

import { useState } from "react";
import { AlertTriangle, Trash2 } from "lucide-react";
import type { Priority } from "@/generated/prisma/enums";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmButton } from "@/components/ui/confirm-button";
import { FormField } from "@/components/ui/form-field";
import { Input, Select, Textarea } from "@/components/ui/input";
import { PhotoUploader, type EvidenceThumb } from "@/components/inspections/photo-uploader";
import { useActionForm } from "@/hooks/use-action-form";
import { DEFAULT_DUE_DAYS } from "@/lib/inspection-result";
import { PRIORITIES, PRIORITY_LABELS, PRIORITY_TONES } from "@/lib/labels";
import { addDaysISO, formatDate, formatNumber } from "@/lib/utils";
import { createFindingAction, deleteDraftFindingAction } from "@/server/actions/inspections.actions";

export interface DraftFinding {
  id: string;
  number: number;
  description: string;
  priority: Priority;
  requiredAction: string | null;
  dueDate: Date | string | null;
  responsible: { name: string } | null;
  evidences: EvidenceThumb[];
}

/**
 * Registro de hallazgo que aparece inmediatamente cuando una respuesta no
 * cumple. Prioridad y fecha límite se sugieren (editables).
 */
export function FindingPanel({
  inspectionId,
  answerId,
  questionText,
  defaultPriority,
  defaultResponsibleId,
  users,
  today,
  finding,
}: {
  inspectionId: string;
  answerId: string;
  questionText: string;
  defaultPriority: Priority;
  defaultResponsibleId: string | null;
  users: { id: string; name: string; jobTitle: string | null }[];
  today: string;
  finding?: DraftFinding;
}) {
  const [priority, setPriority] = useState<Priority>(defaultPriority);
  const [dueDate, setDueDate] = useState(addDaysISO(today, DEFAULT_DUE_DAYS[defaultPriority]));
  const [dueTouched, setDueTouched] = useState(false);
  const { onSubmit, pending, errors } = useActionForm(createFindingAction);

  if (finding) {
    return (
      <div className="rounded-lg border border-red-200 bg-danger-soft/40 p-3">
        <div className="flex items-start justify-between gap-2">
          <p className="flex items-center gap-2 text-sm font-semibold text-danger">
            <AlertTriangle className="h-4 w-4" aria-hidden /> Hallazgo {formatNumber(finding.number)}
          </p>
          <ConfirmButton
            action={deleteDraftFindingAction.bind(null, finding.id, inspectionId)}
            title="Eliminar hallazgo"
            description="Úsalo si la respuesta fue corregida. El plan de acción asociado también se elimina."
            confirmLabel="Eliminar"
            variant="ghost"
            size="icon"
            ariaLabel={`Eliminar hallazgo ${formatNumber(finding.number)}`}
          >
            <Trash2 className="h-4 w-4 text-danger" aria-hidden />
          </ConfirmButton>
        </div>
        <p className="mt-1 text-sm">{finding.description}</p>
        {finding.requiredAction && <p className="mt-1 text-sm text-muted">Acción: {finding.requiredAction}</p>}
        <div className="mt-2 flex flex-wrap gap-1 text-xs">
          <Badge tone={PRIORITY_TONES[finding.priority]}>{PRIORITY_LABELS[finding.priority]}</Badge>
          {finding.responsible && <Badge>{finding.responsible.name}</Badge>}
          <Badge>Límite {formatDate(finding.dueDate)}</Badge>
        </div>
        <div className="mt-3">
          <PhotoUploader
            target={{ kind: "finding", findingId: finding.id }}
            inspectionId={inspectionId}
            photos={finding.evidences}
            label="Fotos del hallazgo"
          />
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-3 rounded-lg border border-red-200 bg-danger-soft/40 p-3" noValidate>
      <p className="flex items-center gap-2 text-sm font-semibold text-danger">
        <AlertTriangle className="h-4 w-4" aria-hidden /> Registrar hallazgo
      </p>
      <input type="hidden" name="inspectionId" value={inspectionId} />
      <input type="hidden" name="answerId" value={answerId} />
      <FormField label="¿Qué se encontró?" errors={errors("description")} required>
        <Textarea
          id={`fd-${answerId}`}
          name="description"
          rows={2}
          maxLength={1000}
          placeholder={`Ej.: ${questionText.replace(/[¿?]/g, "")} — describe la situación`}
        />
      </FormField>
      <FormField label="Acción requerida" errors={errors("requiredAction")} required>
        <Textarea id={`fa-${answerId}`} name="requiredAction" rows={2} maxLength={1000} placeholder="Ej.: Retirar las cajas y garantizar acceso" />
      </FormField>
      <div className="grid gap-3 sm:grid-cols-3">
        <FormField label="Prioridad" errors={errors("priority")} required>
          <Select
            id={`fp-${answerId}`}
            name="priority"
            value={priority}
            onChange={(e) => {
              const p = e.target.value as Priority;
              setPriority(p);
              // La fecha sugerida sigue a la prioridad mientras el usuario no la cambie.
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
        <FormField label="Responsable" errors={errors("responsibleId")} required>
          <Select id={`fr-${answerId}`} name="responsibleId" defaultValue={defaultResponsibleId ?? ""}>
            <option value="">Selecciona…</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
                {u.jobTitle ? ` — ${u.jobTitle}` : ""}
              </option>
            ))}
          </Select>
        </FormField>
        <FormField label="Fecha límite" errors={errors("dueDate")} required>
          <Input
            id={`fdd-${answerId}`}
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
      <Button type="submit" variant="danger" loading={pending} className="w-full sm:w-auto">
        Registrar hallazgo
      </Button>
      <p className="text-xs text-subtle">Después de registrarlo podrás agregar fotos del hallazgo.</p>
    </form>
  );
}

"use client";

import { useState } from "react";
import { AlertTriangle, Trash2 } from "lucide-react";
import type { Priority } from "@/generated/prisma/enums";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmButton } from "@/components/ui/confirm-button";
import { FormField } from "@/components/ui/form-field";
import { Select, Textarea } from "@/components/ui/input";
import { PhotoUploader, type EvidenceThumb } from "@/components/inspections/photo-uploader";
import { useActionForm } from "@/hooks/use-action-form";
import { PRIORITIES, PRIORITY_LABELS, PRIORITY_TONES } from "@/lib/labels";
import { formatNumber } from "@/lib/utils";
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
 * cumple. El brigadista describe lo encontrado y la prioridad; el plan de
 * acción, el responsable y la fecha límite se asignan en la revisión.
 */
export function FindingPanel({
  inspectionId,
  answerId,
  questionText,
  defaultPriority,
  finding,
}: {
  inspectionId: string;
  answerId: string;
  questionText: string;
  defaultPriority: Priority;
  finding?: DraftFinding;
}) {
  const [priority, setPriority] = useState<Priority>(defaultPriority);
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
            description="Úsalo si la respuesta fue corregida."
            confirmLabel="Eliminar"
            variant="ghost"
            size="icon"
            ariaLabel={`Eliminar hallazgo ${formatNumber(finding.number)}`}
          >
            <Trash2 className="h-4 w-4 text-danger" aria-hidden />
          </ConfirmButton>
        </div>
        <p className="mt-1 text-sm">{finding.description}</p>
        {finding.requiredAction && <p className="mt-1 text-sm text-muted">Acción sugerida: {finding.requiredAction}</p>}
        <div className="mt-2 flex flex-wrap gap-1 text-xs">
          <Badge tone={PRIORITY_TONES[finding.priority]}>{PRIORITY_LABELS[finding.priority]}</Badge>
          <Badge tone="warning">El plan se asigna en la revisión</Badge>
        </div>
        <div className="mt-3">
          <PhotoUploader
            target={{ kind: "finding", findingId: finding.id }}
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
      <FormField label="Acción sugerida (opcional)" errors={errors("requiredAction")}>
        <Textarea id={`fa-${answerId}`} name="requiredAction" rows={2} maxLength={1000} placeholder="Ej.: Retirar las cajas y garantizar acceso" />
      </FormField>
      <FormField label="Prioridad" errors={errors("priority")} required className="sm:max-w-xs">
        <Select id={`fp-${answerId}`} name="priority" value={priority} onChange={(e) => setPriority(e.target.value as Priority)}>
          {PRIORITIES.map((p) => (
            <option key={p} value={p}>
              {PRIORITY_LABELS[p]}
            </option>
          ))}
        </Select>
      </FormField>
      <Button type="submit" variant="danger" loading={pending} className="w-full sm:w-auto">
        Registrar hallazgo
      </Button>
      <p className="text-xs text-subtle">
        Después de registrarlo podrás agregar fotos. Al finalizar, la inspección pasa a revisión y el responsable del proceso asigna
        el plan de acción.
      </p>
    </form>
  );
}

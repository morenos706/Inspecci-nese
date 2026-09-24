"use client";

import { useState } from "react";
import type { ElementStatus, InspectionFrequency } from "@/generated/prisma/enums";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { FormField } from "@/components/ui/form-field";
import { Input, Select, Textarea } from "@/components/ui/input";
import { FormActions } from "@/components/forms/form-actions";
import { FrequencyFields } from "@/components/forms/frequency-fields";
import { useActionForm } from "@/hooks/use-action-form";
import { ELEMENT_STATUS_LABELS, ELEMENT_STATUSES } from "@/lib/labels";
import { scheduleFields } from "@/lib/scheduling";
import { formatDate } from "@/lib/utils";
import { saveElementAction } from "@/server/actions/elements.actions";

interface TypeOption {
  id: string;
  name: string;
  defaultFrequency: InspectionFrequency;
  defaultFrequencyDays: number | null;
}

export interface ElementFormValues {
  id: string;
  code: string;
  name: string;
  description: string | null;
  elementTypeId: string;
  processId: string;
  siteId: string;
  zoneId: string | null;
  location: string | null;
  responsibleId: string | null;
  frequency: InspectionFrequency;
  frequencyDays: number | null;
  lastInspectionAt: Date | null;
  nextInspectionAt: Date | null;
  status: ElementStatus;
  inspectionCount: number;
}

const toInputDate = (d: Date | null | undefined) => (d ? new Date(d).toISOString().slice(0, 10) : "");

export function ElementForm({
  element,
  types,
  codeSuggestions,
  processes,
  sites,
  users,
}: {
  element?: ElementFormValues;
  types: TypeOption[];
  codeSuggestions: Record<string, string>;
  processes: { id: string; name: string }[];
  sites: { id: string; name: string; zones: { id: string; name: string }[] }[];
  users: { id: string; name: string; jobTitle: string | null }[];
}) {
  const { onSubmit, pending, errors } = useActionForm(saveElementAction);
  const [typeId, setTypeId] = useState(element?.elementTypeId ?? "");
  const [code, setCode] = useState(element?.code ?? "");
  const [siteId, setSiteId] = useState(element?.siteId ?? "");
  const [frequency, setFrequency] = useState<InspectionFrequency>(element?.frequency ?? "MONTHLY");
  const [lastDate, setLastDate] = useState(toInputDate(element?.lastInspectionAt));
  const [firstDate, setFirstDate] = useState(element?.lastInspectionAt ? "" : toInputDate(element?.nextInspectionAt));
  const hasInspections = (element?.inspectionCount ?? 0) > 0;
  const zones = sites.find((s) => s.id === siteId)?.zones ?? [];

  function onTypeChange(id: string) {
    const type = types.find((t) => t.id === id);
    // Al elegir el tipo se sugieren frecuencia y código (si el usuario no escribió uno propio).
    if (type && !element) setFrequency(type.defaultFrequency);
    if (!element && (!code || Object.values(codeSuggestions).includes(code))) setCode(codeSuggestions[id] ?? "");
    setTypeId(id);
  }

  // Vista previa de la próxima inspección con la misma función que usa el servidor.
  let preview: string | null = null;
  try {
    if (frequency !== "CUSTOM") {
      const { nextInspectionAt } = scheduleFields({
        lastInspectionAt: lastDate ? new Date(`${lastDate}T12:00:00Z`) : null,
        frequency,
        firstInspectionAt: firstDate ? new Date(`${firstDate}T12:00:00Z`) : null,
      });
      preview = formatDate(nextInspectionAt);
    }
  } catch {
    preview = null;
  }

  return (
    <form onSubmit={onSubmit} className="space-y-6" noValidate>
      {element && <input type="hidden" name="id" value={element.id} />}

      <Card>
        <CardHeader title="Identificación" />
        <CardBody className="grid gap-4 sm:grid-cols-2">
          <FormField
            label="Tipo de elemento"
            errors={errors("elementTypeId")}
            hint={hasInspections ? "Tiene inspecciones: el tipo no se puede cambiar." : undefined}
            required
          >
            <Select
              name="elementTypeId"
              value={typeId}
              onChange={(e) => onTypeChange(e.target.value)}
              disabled={hasInspections}
            >
              <option value="">Selecciona…</option>
              {types.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </Select>
          </FormField>
          {hasInspections && <input type="hidden" name="elementTypeId" value={typeId} />}
          <FormField label="Código" errors={errors("code")} hint="Único. Ej.: EXT-023" required>
            <Input name="code" value={code} onChange={(e) => setCode(e.target.value)} className="uppercase" maxLength={40} />
          </FormField>
          <FormField label="Nombre" errors={errors("name")} required className="sm:col-span-2">
            <Input name="name" defaultValue={element?.name} maxLength={150} placeholder="Ej.: Extintor ABC 20 lb" />
          </FormField>
          <FormField label="Descripción" errors={errors("description")} className="sm:col-span-2">
            <Textarea name="description" defaultValue={element?.description ?? ""} maxLength={1000} />
          </FormField>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Ubicación y responsable" />
        <CardBody className="grid gap-4 sm:grid-cols-2">
          <FormField label="Proceso" errors={errors("processId")} required>
            <Select name="processId" defaultValue={element?.processId ?? ""}>
              <option value="">Selecciona…</option>
              {processes.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </Select>
          </FormField>
          <FormField label="Responsable" errors={errors("responsibleId")}>
            <Select name="responsibleId" defaultValue={element?.responsibleId ?? ""}>
              <option value="">Sin responsable</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                  {u.jobTitle ? ` — ${u.jobTitle}` : ""}
                </option>
              ))}
            </Select>
          </FormField>
          <FormField label="Sede" errors={errors("siteId")} required>
            <Select name="siteId" value={siteId} onChange={(e) => setSiteId(e.target.value)}>
              <option value="">Selecciona…</option>
              {sites.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </Select>
          </FormField>
          <FormField label="Zona" errors={errors("zoneId")}>
            <Select
              key={siteId}
              name="zoneId"
              defaultValue={element?.siteId === siteId ? (element?.zoneId ?? "") : ""}
              disabled={!siteId}
            >
              <option value="">{siteId ? "Sin zona" : "Selecciona primero la sede"}</option>
              {zones.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </Select>
          </FormField>
          <FormField label="Ubicación exacta" errors={errors("location")} className="sm:col-span-2">
            <Input name="location" defaultValue={element?.location ?? ""} maxLength={200} placeholder="Ej.: Columna B4, junto a estantería 3" />
          </FormField>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Programación y estado" />
        <CardBody className="grid gap-4 sm:grid-cols-2">
          <FrequencyFields
            name="frequency"
            daysName="frequencyDays"
            frequency={frequency}
            onFrequencyChange={setFrequency}
            defaultDays={element?.frequencyDays ?? types.find((t) => t.id === typeId)?.defaultFrequencyDays}
            errors={errors}
          />
          <FormField
            label="Última inspección"
            errors={errors("lastInspectionAt")}
            hint={
              hasInspections
                ? "Se actualiza automáticamente con cada inspección finalizada."
                : "Opcional: para cargar elementos que ya se venían inspeccionando."
            }
          >
            <Input
              name="lastInspectionAt"
              type="date"
              value={lastDate}
              onChange={(e) => setLastDate(e.target.value)}
              disabled={hasInspections}
            />
          </FormField>
          {!lastDate && (
            <FormField
              label="Primera inspección programada"
              errors={errors("firstInspectionAt")}
              hint="Si se deja vacía, queda programada para hoy."
            >
              <Input name="firstInspectionAt" type="date" value={firstDate} onChange={(e) => setFirstDate(e.target.value)} />
            </FormField>
          )}
          <FormField label="Estado" errors={errors("status")} required>
            <Select name="status" defaultValue={element?.status ?? "ACTIVE"}>
              {ELEMENT_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {ELEMENT_STATUS_LABELS[s]}
                </option>
              ))}
            </Select>
          </FormField>
          {preview && (
            <Alert tone="info" className="sm:col-span-2">
              Próxima inspección: <strong>{preview}</strong>
            </Alert>
          )}
        </CardBody>
      </Card>

      <FormActions cancelHref={element ? `/inventory/${element.id}` : "/inventory"}>
        <Button type="submit" loading={pending} className="w-full sm:w-auto">
          {element ? "Guardar cambios" : "Crear elemento"}
        </Button>
      </FormActions>
    </form>
  );
}

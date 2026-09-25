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
import { idKey, normalizeIdNumber, type CodeInfo } from "@/lib/element-code";

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
  expiresAt: Date | null;
  expiryLabel: string | null;
  status: ElementStatus;
  inspectionCount: number;
}

const toInputDate = (d: Date | null | undefined) => (d ? new Date(d).toISOString().slice(0, 10) : "");

export function ElementForm({
  element,
  types,
  codeInfo,
  processes,
  sites,
  users,
}: {
  element?: ElementFormValues;
  types: TypeOption[];
  codeInfo: CodeInfo;
  processes: { id: string; name: string }[];
  sites: { id: string; code: string; name: string; zones: { id: string; name: string }[] }[];
  users: { id: string; name: string; jobTitle: string | null }[];
}) {
  const { onSubmit, pending, errors } = useActionForm(saveElementAction);
  const [typeId, setTypeId] = useState(element?.elementTypeId ?? "");
  const [siteId, setSiteId] = useState(element?.siteId ?? "");
  const [idNumber, setIdNumber] = useState("");
  const [frequency, setFrequency] = useState<InspectionFrequency>(element?.frequency ?? "MONTHLY");
  const [lastDate, setLastDate] = useState(toInputDate(element?.lastInspectionAt));
  const [firstDate, setFirstDate] = useState(element?.lastInspectionAt ? "" : toInputDate(element?.nextInspectionAt));
  const hasInspections = (element?.inspectionCount ?? 0) > 0;
  const zones = sites.find((s) => s.id === siteId)?.zones ?? [];
  // Código = SEDE-TIPO-ID. El ID se escribe al crear (o se toma el siguiente libre) y luego no se cambia.
  const moved = element && (siteId !== element.siteId || typeId !== element.elementTypeId);
  const siteCode = sites.find((x) => x.id === siteId)?.code;
  const prefix = codeInfo.typePrefix[typeId];
  const typedId = idNumber.trim() ? normalizeIdNumber(idNumber) : null;
  const idError = idNumber.trim()
    ? !typedId
      ? "Solo números y una letra opcional (ej.: 23 o 34A)"
      : codeInfo.usedIds[typeId]?.[idKey(typedId)]
        ? `Ya existe: ${codeInfo.usedIds[typeId]![idKey(typedId)]}`
        : null
    : null;
  const codeText = element
    ? moved
      ? `${element.code} → se actualizará al guardar`
      : element.code
    : siteCode && prefix
      ? `${siteCode}-${prefix}-${typedId ?? codeInfo.nextId[typeId] ?? "???"}`
      : "Elige la sede y el tipo";

  function onTypeChange(id: string) {
    const type = types.find((t) => t.id === id);
    // Al elegir el tipo se sugiere la frecuencia.
    if (type && !element) setFrequency(type.defaultFrequency);
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
          {!element && (
            <FormField
              label="ID del elemento"
              errors={idError ? [idError] : errors("idNumber")}
              hint={typeId ? `Número del equipo. Vacío = siguiente libre (${codeInfo.nextId[typeId] ?? "—"}). No puede repetirse en ninguna sede.` : "Elige primero el tipo."}
            >
              <Input
                name="idNumber"
                value={idNumber}
                onChange={(e) => setIdNumber(e.target.value)}
                inputMode="numeric"
                maxLength={10}
                placeholder={typeId ? codeInfo.nextId[typeId] : "Ej.: 23"}
                disabled={!typeId}
                className="font-mono uppercase"
              />
            </FormField>
          )}
          <FormField
            label="Código (automático)"
            hint={
              element
                ? "No se puede modificar. Cambia solo la codificación si cambias la sede, la zona o el tipo; el ID se conserva."
                : "SEDE-TIPO-ID. Se asigna al guardar y no se puede modificar."
            }
          >
            <Input value={codeText} readOnly disabled aria-readonly="true" className="font-mono uppercase" />
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
          <FormField
            label="Fecha de vencimiento"
            errors={errors("expiresAt")}
            hint="Ej.: próxima recarga. Al vencer se genera alerta crítica. Se actualiza con cada inspección."
          >
            <Input name="expiresAt" type="date" defaultValue={toInputDate(element?.expiresAt)} />
          </FormField>
          <FormField label="Concepto del vencimiento" errors={errors("expiryLabel")}>
            <Input name="expiryLabel" defaultValue={element?.expiryLabel ?? ""} maxLength={80} placeholder="Ej.: Recarga" />
          </FormField>
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
        <Button type="submit" loading={pending} disabled={Boolean(idError)} className="w-full sm:w-auto">
          {element ? "Guardar cambios" : "Crear elemento"}
        </Button>
      </FormActions>
    </form>
  );
}

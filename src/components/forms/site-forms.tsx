"use client";

import { useRef } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardBody } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { FormActions } from "@/components/forms/form-actions";
import { useActionForm } from "@/hooks/use-action-form";
import { saveZoneAction, saveSiteAction } from "@/server/actions/sites.actions";

export function SiteForm({
  site,
}: {
  site?: { id: string; code: string; name: string; address: string | null; city: string | null; active: boolean };
}) {
  const { onSubmit, pending, errors } = useActionForm(saveSiteAction);
  return (
    <form onSubmit={onSubmit} className="space-y-6" noValidate>
      {site && <input type="hidden" name="id" value={site.id} />}
      <Card>
        <CardBody className="grid gap-4 sm:grid-cols-2">
          <FormField label="Nombre" errors={errors("name")} required>
            <Input name="name" defaultValue={site?.name} maxLength={120} />
          </FormField>
          <FormField label="Código" errors={errors("code")} hint="Ej.: PRINCIPAL, NORTE" required>
            <Input name="code" defaultValue={site?.code} className="uppercase" maxLength={30} />
          </FormField>
          <FormField label="Dirección" errors={errors("address")}>
            <Input name="address" defaultValue={site?.address ?? ""} maxLength={200} />
          </FormField>
          <FormField label="Ciudad" errors={errors("city")}>
            <Input name="city" defaultValue={site?.city ?? ""} maxLength={80} />
          </FormField>
          <div className="sm:col-span-2">
            <Checkbox name="active" defaultChecked={site?.active ?? true} label="Sede activa" />
          </div>
        </CardBody>
      </Card>
      <FormActions cancelHref="/admin/sites">
        <Button type="submit" loading={pending} className="w-full sm:w-auto">
          {site ? "Guardar cambios" : "Crear sede"}
        </Button>
      </FormActions>
    </form>
  );
}

/** Formulario compacto de zona (crear o editar en línea dentro de la ficha de la sede). */
export function ZoneForm({
  siteId,
  zone,
  onDone,
}: {
  siteId: string;
  zone?: { id: string; code: string; name: string; description: string | null; active: boolean };
  onDone?: () => void;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const { onSubmit, pending, errors } = useActionForm(saveZoneAction, {
    onSuccess: () => {
      if (!zone) formRef.current?.reset();
      onDone?.();
    },
  });
  const prefix = zone?.id ?? "new";

  return (
    <form ref={formRef} onSubmit={onSubmit} className="grid gap-3 sm:grid-cols-[1fr_10rem_auto] sm:items-end" noValidate>
      <input type="hidden" name="siteId" value={siteId} />
      {zone && <input type="hidden" name="id" value={zone.id} />}
      <FormField label="Nombre de la zona" errors={errors("name")} required>
        <Input id={`${prefix}-name`} name="name" defaultValue={zone?.name} maxLength={120} placeholder="Ej.: Bodega principal" />
      </FormField>
      <FormField label="Código" errors={errors("code")} required>
        <Input id={`${prefix}-code`} name="code" defaultValue={zone?.code} className="uppercase" maxLength={30} placeholder="BOD" />
      </FormField>
      <input type="hidden" name="description" value={zone?.description ?? ""} />
      <div className="flex items-center gap-3">
        {zone && <Checkbox id={`${prefix}-active`} name="active" defaultChecked={zone.active} label="Activa" />}
        {!zone && <input type="hidden" name="active" value="on" />}
        <Button type="submit" loading={pending} variant={zone ? "primary" : "secondary"} className="w-full sm:w-auto">
          {zone ? "Guardar" : "Agregar zona"}
        </Button>
      </div>
    </form>
  );
}

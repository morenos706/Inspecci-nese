"use client";

import type { InspectionFrequency } from "@/generated/prisma/enums";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { FormField } from "@/components/ui/form-field";
import { Input, Textarea } from "@/components/ui/input";
import { FormActions } from "@/components/forms/form-actions";
import { FrequencyFields } from "@/components/forms/frequency-fields";
import { useActionForm } from "@/hooks/use-action-form";
import { saveElementTypeAction } from "@/server/actions/element-types.actions";

export interface ElementTypeFormValues {
  id: string;
  code: string;
  name: string;
  description: string | null;
  codePrefix: string | null;
  defaultFrequency: InspectionFrequency;
  defaultFrequencyDays: number | null;
  active: boolean;
}

export function ElementTypeForm({ type }: { type?: ElementTypeFormValues }) {
  const { onSubmit, pending, errors } = useActionForm(saveElementTypeAction);
  return (
    <form onSubmit={onSubmit} className="space-y-6" noValidate>
      {type && <input type="hidden" name="id" value={type.id} />}
      <Card>
        <CardHeader title="Datos del tipo" />
        <CardBody className="grid gap-4 sm:grid-cols-2">
          <FormField label="Nombre" errors={errors("name")} required>
            <Input name="name" defaultValue={type?.name} maxLength={80} placeholder="Ej.: Extintor" />
          </FormField>
          <FormField label="Código" errors={errors("code")} hint="Identificador interno. Ej.: EXT" required>
            <Input name="code" defaultValue={type?.code} className="uppercase" maxLength={30} />
          </FormField>
          <FormField
            label="Prefijo para códigos de elementos"
            errors={errors("codePrefix")}
            hint="Se usa para sugerir códigos: EXT → EXT-024"
          >
            <Input name="codePrefix" defaultValue={type?.codePrefix ?? ""} className="uppercase" maxLength={10} />
          </FormField>
          <FrequencyFields
            name="defaultFrequency"
            daysName="defaultFrequencyDays"
            defaultFrequency={type?.defaultFrequency}
            defaultDays={type?.defaultFrequencyDays}
            errors={errors}
          />
          <FormField label="Descripción" errors={errors("description")} className="sm:col-span-2">
            <Textarea name="description" defaultValue={type?.description ?? ""} maxLength={500} />
          </FormField>
          <div className="sm:col-span-2">
            <Checkbox
              name="active"
              defaultChecked={type?.active ?? true}
              label="Tipo activo"
              description="Los tipos inactivos no se ofrecen al crear elementos. Los elementos existentes se conservan."
            />
          </div>
        </CardBody>
      </Card>
      <FormActions cancelHref="/admin/element-types">
        <Button type="submit" loading={pending} className="w-full sm:w-auto">
          {type ? "Guardar cambios" : "Crear tipo"}
        </Button>
      </FormActions>
    </form>
  );
}

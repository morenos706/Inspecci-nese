"use client";

import { Button } from "@/components/ui/button";
import { Card, CardBody } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { FormField } from "@/components/ui/form-field";
import { Input, Textarea } from "@/components/ui/input";
import { FormActions } from "@/components/forms/form-actions";
import { useActionForm } from "@/hooks/use-action-form";
import { saveProcessAction } from "@/server/actions/processes.actions";

export function ProcessForm({
  process,
}: {
  process?: { id: string; code: string; name: string; description: string | null; active: boolean };
}) {
  const { onSubmit, pending, errors } = useActionForm(saveProcessAction);
  return (
    <form onSubmit={onSubmit} className="space-y-6" noValidate>
      {process && <input type="hidden" name="id" value={process.id} />}
      <Card>
        <CardBody className="grid gap-4 sm:grid-cols-2">
          <FormField label="Nombre" errors={errors("name")} required>
            <Input name="name" defaultValue={process?.name} maxLength={120} />
          </FormField>
          <FormField label="Código" errors={errors("code")} hint="Ej.: PROD, SEG, MANT" required>
            <Input name="code" defaultValue={process?.code} className="uppercase" maxLength={30} />
          </FormField>
          <FormField label="Descripción" errors={errors("description")} className="sm:col-span-2">
            <Textarea name="description" defaultValue={process?.description ?? ""} maxLength={500} />
          </FormField>
          <div className="sm:col-span-2">
            <Checkbox
              name="active"
              defaultChecked={process?.active ?? true}
              label="Proceso activo"
              description="Los procesos inactivos no se ofrecen al crear elementos, pero conservan su historial."
            />
          </div>
        </CardBody>
      </Card>
      <FormActions cancelHref="/admin/processes">
        <Button type="submit" loading={pending} className="w-full sm:w-auto">
          {process ? "Guardar cambios" : "Crear proceso"}
        </Button>
      </FormActions>
    </form>
  );
}

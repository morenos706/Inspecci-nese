"use client";

import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { FormField } from "@/components/ui/form-field";
import { Input, Textarea } from "@/components/ui/input";
import { Alert } from "@/components/ui/alert";
import { FormActions } from "@/components/forms/form-actions";
import { useActionForm } from "@/hooks/use-action-form";
import { saveRoleAction } from "@/server/actions/roles.actions";

export interface RoleFormValues {
  id?: string;
  code: string;
  name: string;
  description: string | null;
  active: boolean;
  isSystem: boolean;
  locked: boolean;
  permissionCodes: string[];
}

export function RoleForm({
  role,
  permissionGroups,
}: {
  role?: RoleFormValues;
  permissionGroups: { module: string; permissions: { code: string; description: string }[] }[];
}) {
  const { onSubmit, pending, errors } = useActionForm(saveRoleAction);
  const locked = role?.locked ?? false;

  return (
    <form onSubmit={onSubmit} className="space-y-6" noValidate>
      {role?.id && <input type="hidden" name="id" value={role.id} />}
      <Card>
        <CardHeader title="Datos del rol" />
        <CardBody className="grid gap-4 sm:grid-cols-2">
          <FormField label="Nombre" errors={errors("name")} required>
            <Input name="name" defaultValue={role?.name} maxLength={80} />
          </FormField>
          <FormField
            label="Código"
            errors={errors("code")}
            hint={role?.isSystem ? "El código de un rol del sistema no se puede cambiar." : "Ej.: SUPERVISOR"}
            required
          >
            <Input
              name="code"
              defaultValue={role?.code}
              readOnly={role?.isSystem}
              className="uppercase"
              maxLength={30}
            />
          </FormField>
          <FormField label="Descripción" errors={errors("description")} className="sm:col-span-2">
            <Textarea name="description" defaultValue={role?.description ?? ""} maxLength={300} />
          </FormField>
          <div className="sm:col-span-2">
            {locked ? (
              <input type="hidden" name="active" value="on" />
            ) : (
              <Checkbox name="active" defaultChecked={role?.active ?? true} label="Rol activo" />
            )}
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Permisos" description="Marca las acciones que pueden realizar los usuarios con este rol." />
        <CardBody className="space-y-6">
          {locked && (
            <Alert tone="info">
              El rol Administrador siempre tiene todos los permisos para evitar que el sistema quede sin acceso.
            </Alert>
          )}
          {permissionGroups.map((group) => (
            <fieldset key={group.module} disabled={locked}>
              <legend className="mb-2 text-sm font-semibold text-foreground">{group.module}</legend>
              <div className="grid gap-1 sm:grid-cols-2">
                {group.permissions.map((p) => (
                  <Checkbox
                    key={p.code}
                    name="permissions"
                    value={p.code}
                    label={p.description}
                    description={<code className="text-xs">{p.code}</code>}
                    defaultChecked={locked || role?.permissionCodes.includes(p.code)}
                  />
                ))}
              </div>
            </fieldset>
          ))}
        </CardBody>
      </Card>

      <FormActions cancelHref="/admin/roles">
        <Button type="submit" loading={pending} className="w-full sm:w-auto">
          {role?.id ? "Guardar cambios" : "Crear rol"}
        </Button>
      </FormActions>
    </form>
  );
}

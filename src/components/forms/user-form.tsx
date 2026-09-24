"use client";

import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { FormActions } from "@/components/forms/form-actions";
import { useActionForm } from "@/hooks/use-action-form";
import { saveUserAction } from "@/server/actions/users.actions";

interface Option {
  id: string;
  name: string;
}

export interface UserFormValues {
  id?: string;
  name: string;
  email: string;
  phone: string | null;
  jobTitle: string | null;
  active: boolean;
  roleIds: string[];
  processIds: string[];
}

export function UserForm({
  user,
  roles,
  processes,
}: {
  user?: UserFormValues;
  roles: Option[];
  processes: Option[];
}) {
  const { onSubmit, pending, errors } = useActionForm(saveUserAction);
  const isNew = !user?.id;

  return (
    <form onSubmit={onSubmit} className="space-y-6" noValidate>
      {user?.id && <input type="hidden" name="id" value={user.id} />}

      <Card>
        <CardHeader title="Datos personales" />
        <CardBody className="grid gap-4 sm:grid-cols-2">
          <FormField label="Nombre completo" errors={errors("name")} required>
            <Input name="name" defaultValue={user?.name} autoComplete="off" maxLength={120} />
          </FormField>
          <FormField label="Correo electrónico" errors={errors("email")} required>
            <Input name="email" type="email" defaultValue={user?.email} autoComplete="off" inputMode="email" />
          </FormField>
          <FormField label="Cargo" errors={errors("jobTitle")}>
            <Input name="jobTitle" defaultValue={user?.jobTitle ?? ""} maxLength={120} />
          </FormField>
          <FormField label="Teléfono" errors={errors("phone")}>
            <Input name="phone" type="tel" defaultValue={user?.phone ?? ""} inputMode="tel" maxLength={30} />
          </FormField>
          {isNew && (
            <FormField
              label="Contraseña temporal"
              errors={errors("password")}
              hint="Opcional. Si la dejas vacía, el usuario recibirá un correo para definir su contraseña."
              className="sm:col-span-2"
            >
              <Input name="password" type="password" autoComplete="new-password" />
            </FormField>
          )}
          <div className="sm:col-span-2">
            <Checkbox
              name="active"
              defaultChecked={user?.active ?? true}
              label="Usuario activo"
              description="Un usuario inactivo no puede iniciar sesión y se cierran sus sesiones abiertas."
            />
          </div>
        </CardBody>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title="Roles" description="Los permisos del usuario son la suma de sus roles." />
          <CardBody>
            <fieldset aria-describedby={errors("roleIds") ? "roleIds-error" : undefined}>
              <legend className="sr-only">Roles</legend>
              <div className="grid gap-1">
                {roles.map((role) => (
                  <Checkbox
                    key={role.id}
                    name="roleIds"
                    value={role.id}
                    label={role.name}
                    defaultChecked={user?.roleIds.includes(role.id)}
                  />
                ))}
              </div>
              {errors("roleIds") && (
                <p id="roleIds-error" className="mt-2 text-xs font-medium text-danger" role="alert">
                  {errors("roleIds")![0]}
                </p>
              )}
            </fieldset>
          </CardBody>
        </Card>
        <Card>
          <CardHeader
            title="Procesos"
            description="Definen qué elementos, hallazgos y planes puede ver un responsable de proceso."
          />
          <CardBody>
            <fieldset>
              <legend className="sr-only">Procesos</legend>
              {processes.length === 0 ? (
                <p className="text-sm text-subtle">No hay procesos activos.</p>
              ) : (
                <div className="grid gap-1 sm:grid-cols-2">
                  {processes.map((p) => (
                    <Checkbox
                      key={p.id}
                      name="processIds"
                      value={p.id}
                      label={p.name}
                      defaultChecked={user?.processIds.includes(p.id)}
                    />
                  ))}
                </div>
              )}
            </fieldset>
          </CardBody>
        </Card>
      </div>

      <FormActions cancelHref="/admin/users">
        <Button type="submit" loading={pending} className="w-full sm:w-auto">
          {isNew ? "Crear usuario" : "Guardar cambios"}
        </Button>
      </FormActions>
    </form>
  );
}

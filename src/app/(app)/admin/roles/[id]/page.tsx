import { Trash2 } from "lucide-react";
import { ConfirmButton } from "@/components/ui/confirm-button";
import { PageHeader } from "@/components/ui/page-header";
import { RoleForm } from "@/components/forms/role-form";
import { groupPermissionsByModule, LOCKED_ROLE_CODE } from "@/lib/permissions";
import { requirePagePermission } from "@/server/auth/current-user";
import { deleteRoleAction } from "@/server/actions/roles.actions";
import { orNotFound } from "@/server/page-helpers";
import { getRole } from "@/server/services/roles.service";

export const metadata = { title: "Editar rol" };

export default async function EditRolePage({ params }: PageProps<"/admin/roles/[id]">) {
  await requirePagePermission("roles.manage");
  const { id } = await params;
  const role = await orNotFound(getRole(id));

  return (
    <>
      <PageHeader
        title={role.name}
        description={`${role._count.users} usuario(s) con este rol`}
        back={{ href: "/admin/roles", label: "Roles" }}
        actions={
          !role.isSystem && (
            <ConfirmButton
              action={deleteRoleAction.bind(null, role.id)}
              title="Eliminar rol"
              description="Solo se pueden eliminar roles sin usuarios asignados. Esta acción queda registrada en la auditoría."
              confirmLabel="Eliminar"
            >
              <Trash2 className="h-4 w-4" aria-hidden /> Eliminar
            </ConfirmButton>
          )
        }
      />
      <RoleForm
        role={{
          id: role.id,
          code: role.code,
          name: role.name,
          description: role.description,
          active: role.active,
          isSystem: role.isSystem,
          locked: role.code === LOCKED_ROLE_CODE,
          permissionCodes: role.permissionCodes,
        }}
        permissionGroups={groupPermissionsByModule()}
      />
    </>
  );
}

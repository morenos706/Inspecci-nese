import { PageHeader } from "@/components/ui/page-header";
import { RoleForm } from "@/components/forms/role-form";
import { groupPermissionsByModule } from "@/lib/permissions";
import { requirePagePermission } from "@/server/auth/current-user";

export const metadata = { title: "Nuevo rol" };

export default async function NewRolePage() {
  await requirePagePermission("roles.manage");
  return (
    <>
      <PageHeader title="Nuevo rol" back={{ href: "/admin/roles", label: "Roles" }} />
      <RoleForm permissionGroups={groupPermissionsByModule()} />
    </>
  );
}

import { PageHeader } from "@/components/ui/page-header";
import { UserForm } from "@/components/forms/user-form";
import { requirePagePermission } from "@/server/auth/current-user";
import { listProcessOptions } from "@/server/services/processes.service";
import { listRoleOptions } from "@/server/services/roles.service";

export const metadata = { title: "Nuevo usuario" };

export default async function NewUserPage() {
  await requirePagePermission("users.manage");
  const [roles, processes] = await Promise.all([listRoleOptions(), listProcessOptions()]);
  return (
    <>
      <PageHeader title="Nuevo usuario" back={{ href: "/admin/users", label: "Usuarios" }} />
      <UserForm roles={roles} processes={processes} />
    </>
  );
}

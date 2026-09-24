import { KeyRound, Lock, Plus } from "lucide-react";
import { ActiveBadge, Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { DataList } from "@/components/ui/data-list";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { requirePagePermission } from "@/server/auth/current-user";
import { listRoles } from "@/server/services/roles.service";

export const metadata = { title: "Roles y permisos" };

export default async function RolesPage() {
  await requirePagePermission("roles.manage");
  const roles = await listRoles();

  return (
    <>
      <PageHeader
        title="Roles y permisos"
        description="Cada rol agrupa permisos. La autorización se valida en el servidor en cada acción."
        actions={
          <ButtonLink href="/admin/roles/new">
            <Plus className="h-4 w-4" aria-hidden /> Nuevo rol
          </ButtonLink>
        }
      />
      <Card>
        <DataList
          caption="Roles"
          rows={roles}
          rowKey={(r) => r.id}
          rowHref={(r) => `/admin/roles/${r.id}`}
          empty={<EmptyState icon={KeyRound} title="No hay roles" />}
          columns={[
            {
              key: "name",
              header: "Rol",
              cell: (r) => (
                <span className="inline-flex items-center gap-1.5">
                  {r.isSystem && <Lock className="h-3.5 w-3.5 text-subtle" aria-label="Rol del sistema" />}
                  {r.name}
                </span>
              ),
            },
            { key: "code", header: "Código", cell: (r) => <code className="text-xs">{r.code}</code> },
            { key: "description", header: "Descripción", hideOnMobile: true, cell: (r) => r.description ?? "—" },
            { key: "permissions", header: "Permisos", cell: (r) => <Badge>{r._count.permissions}</Badge> },
            { key: "users", header: "Usuarios", cell: (r) => <Badge tone="primary">{r._count.users}</Badge> },
            { key: "active", header: "Estado", cell: (r) => <ActiveBadge active={r.active} /> },
          ]}
        />
      </Card>
    </>
  );
}

import { Plus, Users } from "lucide-react";
import { ActiveBadge, Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { DataList } from "@/components/ui/data-list";
import { EmptyState } from "@/components/ui/empty-state";
import { ListFilters } from "@/components/ui/list-filters";
import { PageHeader } from "@/components/ui/page-header";
import { Pagination } from "@/components/ui/pagination";
import { formatDateTime } from "@/lib/utils";
import { listQuerySchema } from "@/lib/validation/admin";
import { hasPermission, requirePagePermission } from "@/server/auth/current-user";
import { listUsers } from "@/server/services/users.service";

export const metadata = { title: "Usuarios" };

export default async function UsersPage({ searchParams }: PageProps<"/admin/users">) {
  const user = await requirePagePermission("users.read", "users.manage");
  const raw = await searchParams;
  const query = listQuerySchema.parse(raw);
  const result = await listUsers(query);
  const canManage = hasPermission(user, "users.manage");

  return (
    <>
      <PageHeader
        title="Usuarios"
        description="Personas con acceso al sistema, sus roles y procesos."
        actions={
          canManage && (
            <ButtonLink href="/admin/users/new">
              <Plus className="h-4 w-4" aria-hidden /> Nuevo usuario
            </ButtonLink>
          )
        }
      />
      <Card>
        <ListFilters q={query.q} status={query.status} placeholder="Buscar por nombre, correo o cargo" />
        <DataList
          caption="Usuarios"
          rows={result.items}
          rowKey={(u) => u.id}
          rowHref={canManage ? (u) => `/admin/users/${u.id}` : undefined}
          empty={<EmptyState icon={Users} title="No hay usuarios" description="Ajusta los filtros o crea un usuario." />}
          columns={[
            { key: "name", header: "Nombre", cell: (u) => u.name },
            { key: "email", header: "Correo", cell: (u) => <span className="break-all">{u.email}</span> },
            {
              key: "roles",
              header: "Roles",
              cell: (u) => (
                <div className="flex flex-wrap gap-1">
                  {u.roles.map(({ role }) => (
                    <Badge key={role.id} tone="primary">
                      {role.name}
                    </Badge>
                  ))}
                </div>
              ),
            },
            {
              key: "processes",
              header: "Procesos",
              hideOnMobile: true,
              cell: (u) => u.processes.map((p) => p.process.name).join(", ") || "—",
            },
            { key: "lastLogin", header: "Último ingreso", hideOnMobile: true, cell: (u) => formatDateTime(u.lastLoginAt) },
            { key: "active", header: "Estado", cell: (u) => <ActiveBadge active={u.active} /> },
          ]}
        />
        <Pagination
          page={result.page}
          pageCount={result.pageCount}
          total={result.total}
          basePath="/admin/users"
          searchParams={{ q: query.q, status: query.status }}
        />
      </Card>
    </>
  );
}

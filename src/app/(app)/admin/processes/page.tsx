import { Network, Plus } from "lucide-react";
import { ActiveBadge, Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { DataList } from "@/components/ui/data-list";
import { EmptyState } from "@/components/ui/empty-state";
import { ListFilters } from "@/components/ui/list-filters";
import { PageHeader } from "@/components/ui/page-header";
import { Pagination } from "@/components/ui/pagination";
import { listQuerySchema } from "@/lib/validation/admin";
import { requirePagePermission } from "@/server/auth/current-user";
import { listProcesses } from "@/server/services/processes.service";

export const metadata = { title: "Procesos" };

export default async function ProcessesPage({ searchParams }: PageProps<"/admin/processes">) {
  await requirePagePermission("processes.manage");
  const query = listQuerySchema.parse(await searchParams);
  const result = await listProcesses(query);

  return (
    <>
      <PageHeader
        title="Procesos"
        description="Áreas funcionales de la organización responsables de los elementos."
        actions={
          <ButtonLink href="/admin/processes/new">
            <Plus className="h-4 w-4" aria-hidden /> Nuevo proceso
          </ButtonLink>
        }
      />
      <Card>
        <ListFilters q={query.q} status={query.status} placeholder="Buscar por nombre o código" />
        <DataList
          caption="Procesos"
          rows={result.items}
          rowKey={(p) => p.id}
          rowHref={(p) => `/admin/processes/${p.id}`}
          empty={
            <EmptyState
              icon={Network}
              title="No hay procesos"
              description="Crea el primer proceso para organizar los elementos."
              action={<ButtonLink href="/admin/processes/new">Nuevo proceso</ButtonLink>}
            />
          }
          columns={[
            { key: "name", header: "Nombre", cell: (p) => p.name },
            { key: "code", header: "Código", cell: (p) => <code className="text-xs">{p.code}</code> },
            { key: "description", header: "Descripción", hideOnMobile: true, cell: (p) => p.description ?? "—" },
            { key: "elements", header: "Elementos", cell: (p) => <Badge>{p._count.elements}</Badge> },
            { key: "users", header: "Usuarios", cell: (p) => <Badge tone="primary">{p._count.users}</Badge> },
            { key: "active", header: "Estado", cell: (p) => <ActiveBadge active={p.active} /> },
          ]}
        />
        <Pagination
          page={result.page}
          pageCount={result.pageCount}
          total={result.total}
          basePath="/admin/processes"
          searchParams={{ q: query.q, status: query.status }}
        />
      </Card>
    </>
  );
}

import { Building2, Plus } from "lucide-react";
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
import { listSites } from "@/server/services/sites.service";

export const metadata = { title: "Sedes y áreas" };

export default async function SitesPage({ searchParams }: PageProps<"/admin/sites">) {
  await requirePagePermission("sites.manage");
  const query = listQuerySchema.parse(await searchParams);
  const result = await listSites(query);

  return (
    <>
      <PageHeader
        title="Sedes y áreas"
        description="Ubicaciones físicas donde se encuentran los elementos."
        actions={
          <ButtonLink href="/admin/sites/new">
            <Plus className="h-4 w-4" aria-hidden /> Nueva sede
          </ButtonLink>
        }
      />
      <Card>
        <ListFilters q={query.q} status={query.status} placeholder="Buscar por nombre, código o ciudad" />
        <DataList
          caption="Sedes"
          rows={result.items}
          rowKey={(s) => s.id}
          rowHref={(s) => `/admin/sites/${s.id}`}
          empty={
            <EmptyState
              icon={Building2}
              title="No hay sedes"
              action={<ButtonLink href="/admin/sites/new">Nueva sede</ButtonLink>}
            />
          }
          columns={[
            { key: "name", header: "Nombre", cell: (s) => s.name },
            { key: "code", header: "Código", cell: (s) => <code className="text-xs">{s.code}</code> },
            { key: "city", header: "Ciudad", cell: (s) => s.city ?? "—" },
            { key: "areas", header: "Áreas", cell: (s) => <Badge>{s._count.areas}</Badge> },
            { key: "elements", header: "Elementos", cell: (s) => <Badge tone="primary">{s._count.elements}</Badge> },
            { key: "active", header: "Estado", cell: (s) => <ActiveBadge active={s.active} /> },
          ]}
        />
        <Pagination
          page={result.page}
          pageCount={result.pageCount}
          total={result.total}
          basePath="/admin/sites"
          searchParams={{ q: query.q, status: query.status }}
        />
      </Card>
    </>
  );
}

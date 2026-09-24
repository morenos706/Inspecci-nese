import { ListChecks, Plus } from "lucide-react";
import { ActiveBadge, Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { DataList } from "@/components/ui/data-list";
import { EmptyState } from "@/components/ui/empty-state";
import { ListFilters } from "@/components/ui/list-filters";
import { PageHeader } from "@/components/ui/page-header";
import { Pagination } from "@/components/ui/pagination";
import { FREQUENCY_LABELS } from "@/lib/scheduling";
import { listQuerySchema } from "@/lib/validation/admin";
import { requirePagePermission } from "@/server/auth/current-user";
import { listElementTypes } from "@/server/services/element-types.service";

export const metadata = { title: "Tipos de elemento" };

export default async function ElementTypesPage({ searchParams }: PageProps<"/admin/element-types">) {
  await requirePagePermission("element_types.manage");
  const query = listQuerySchema.parse(await searchParams);
  const result = await listElementTypes(query);

  return (
    <>
      <PageHeader
        title="Tipos de elemento y preguntas"
        description="Cada tipo define su lista de inspección. Crea tipos nuevos sin modificar el sistema."
        actions={
          <ButtonLink href="/admin/element-types/new">
            <Plus className="h-4 w-4" aria-hidden /> Nuevo tipo
          </ButtonLink>
        }
      />
      <Card>
        <ListFilters q={query.q} status={query.status} placeholder="Buscar por nombre o código" />
        <DataList
          caption="Tipos de elemento"
          rows={result.items}
          rowKey={(t) => t.id}
          rowHref={(t) => `/admin/element-types/${t.id}`}
          empty={
            <EmptyState
              icon={ListChecks}
              title="No hay tipos de elemento"
              action={<ButtonLink href="/admin/element-types/new">Nuevo tipo</ButtonLink>}
            />
          }
          columns={[
            { key: "name", header: "Tipo", cell: (t) => t.name },
            { key: "code", header: "Código", cell: (t) => <code className="text-xs">{t.code}</code> },
            {
              key: "frequency",
              header: "Frecuencia",
              cell: (t) =>
                t.defaultFrequency === "CUSTOM"
                  ? `Cada ${t.defaultFrequencyDays} días`
                  : FREQUENCY_LABELS[t.defaultFrequency],
            },
            {
              key: "questions",
              header: "Preguntas activas",
              cell: (t) => <Badge tone={t.questionCount ? "primary" : "warning"}>{t.questionCount}</Badge>,
            },
            { key: "elements", header: "Elementos", cell: (t) => <Badge>{t._count.elements}</Badge> },
            { key: "active", header: "Estado", cell: (t) => <ActiveBadge active={t.active} /> },
          ]}
        />
        <Pagination
          page={result.page}
          pageCount={result.pageCount}
          total={result.total}
          basePath="/admin/element-types"
          searchParams={{ q: query.q, status: query.status }}
        />
      </Card>
    </>
  );
}

import { Boxes, Plus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { DataList } from "@/components/ui/data-list";
import { EmptyState } from "@/components/ui/empty-state";
import { FilterBar } from "@/components/ui/filter-bar";
import { PageHeader } from "@/components/ui/page-header";
import { Pagination } from "@/components/ui/pagination";
import { ScheduleBadge } from "@/components/ui/schedule-badge";
import { ELEMENT_STATUS_LABELS, ELEMENT_STATUS_TONES, ELEMENT_STATUSES } from "@/lib/labels";
import { SCHEDULE_STATUS_LABELS } from "@/lib/scheduling";
import { formatDate } from "@/lib/utils";
import { elementListQuerySchema } from "@/lib/validation/config";
import { getReadScope, hasPermission, requirePagePermission } from "@/server/auth/current-user";
import { listElements } from "@/server/services/elements.service";
import { listElementTypeOptions } from "@/server/services/element-types.service";
import { listProcessOptions } from "@/server/services/processes.service";
import { listSiteOptions } from "@/server/services/sites.service";

export const metadata = { title: "Inventario" };

export default async function InventoryPage({ searchParams }: PageProps<"/inventory">) {
  const user = await requirePagePermission("elements.read.all", "elements.read.process");
  const query = elementListQuerySchema.parse(await searchParams);
  const [result, types, allProcesses, sites] = await Promise.all([
    listElements(query, user),
    listElementTypeOptions(),
    listProcessOptions(),
    listSiteOptions(),
  ]);
  // Un usuario con alcance por proceso solo puede filtrar por sus procesos.
  const processes =
    getReadScope(user, "elements") === "all" ? allProcesses : allProcesses.filter((p) => user.processIds.includes(p.id));
  const canManage = hasPermission(user, "elements.manage");

  return (
    <>
      <PageHeader
        title="Inventario de elementos"
        description="Equipos y elementos de emergencia, su ubicación y programación de inspección."
        actions={
          canManage && (
            <ButtonLink href="/inventory/new">
              <Plus className="h-4 w-4" aria-hidden /> Nuevo elemento
            </ButtonLink>
          )
        }
      />
      <Card>
        <FilterBar
          q={query.q}
          placeholder="Buscar por código, nombre o ubicación"
          resetHref="/inventory"
          selects={[
            { name: "type", label: "Tipo", value: query.type, options: types.map((t) => ({ value: t.id, label: t.name })) },
            { name: "process", label: "Proceso", value: query.process, options: processes.map((p) => ({ value: p.id, label: p.name })) },
            { name: "site", label: "Sede", value: query.site, options: sites.map((s) => ({ value: s.id, label: s.name })) },
            {
              name: "status",
              label: "Estado",
              value: query.status,
              options: ELEMENT_STATUSES.map((s) => ({ value: s, label: ELEMENT_STATUS_LABELS[s] })),
            },
            {
              name: "schedule",
              label: "Programación",
              value: query.schedule,
              options: (["OVERDUE", "DUE_SOON", "ON_TIME"] as const).map((s) => ({ value: s, label: SCHEDULE_STATUS_LABELS[s] })),
            },
          ]}
        />
        <DataList
          caption="Elementos"
          rows={result.items}
          rowKey={(e) => e.id}
          rowHref={(e) => `/inventory/${e.id}`}
          empty={
            <EmptyState
              icon={Boxes}
              title="No hay elementos"
              description="No se encontraron elementos con los filtros actuales."
              action={canManage && <ButtonLink href="/inventory/new">Nuevo elemento</ButtonLink>}
            />
          }
          columns={[
            {
              key: "code",
              header: "Código",
              cell: (e) => (
                <span>
                  {e.code}
                  <span className="block text-xs font-normal text-subtle">{e.elementType.name}</span>
                </span>
              ),
            },
            { key: "name", header: "Nombre", hideOnMobile: true, cell: (e) => e.name },
            {
              key: "location",
              header: "Ubicación",
              cell: (e) => (
                <span>
                  {e.site.name}
                  {e.zone && ` · ${e.zone.name}`}
                  {e.location && <span className="block text-xs text-subtle">{e.location}</span>}
                </span>
              ),
            },
            { key: "process", header: "Proceso", hideOnMobile: true, cell: (e) => e.process.name },
            { key: "responsible", header: "Responsable", hideOnMobile: true, cell: (e) => e.responsible?.name ?? "—" },
            { key: "next", header: "Próxima", cell: (e) => (e.status === "ACTIVE" ? formatDate(e.nextInspectionAt) : "—") },
            {
              key: "schedule",
              header: "Programación",
              cell: (e) => (
                <ScheduleBadge
                  next={e.nextInspectionAt}
                  frequency={e.frequency}
                  frequencyDays={e.frequencyDays}
                  elementStatus={e.status}
                />
              ),
            },
            {
              key: "status",
              header: "Estado",
              hideOnMobile: true,
              cell: (e) => <Badge tone={ELEMENT_STATUS_TONES[e.status]}>{ELEMENT_STATUS_LABELS[e.status]}</Badge>,
            },
          ]}
        />
        <Pagination
          page={result.page}
          pageCount={result.pageCount}
          total={result.total}
          basePath="/inventory"
          searchParams={{
            q: query.q,
            type: query.type,
            process: query.process,
            site: query.site,
            status: query.status,
            schedule: query.schedule,
          }}
        />
      </Card>
    </>
  );
}

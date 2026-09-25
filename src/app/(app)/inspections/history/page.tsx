import { ClipboardList } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { DataList } from "@/components/ui/data-list";
import { EmptyState } from "@/components/ui/empty-state";
import { FilterBar } from "@/components/ui/filter-bar";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/page-header";
import { Pagination } from "@/components/ui/pagination";
import { INSPECTION_RESULT_LABELS, INSPECTION_REVIEW_LABELS, INSPECTION_REVIEW_TONES, INSPECTION_STATUS_LABELS } from "@/lib/labels";
import { formatDateTime, formatNumber } from "@/lib/utils";
import { getReadScope, requirePagePermission } from "@/server/auth/current-user";
import { inspectionListQuerySchema, listInspections } from "@/server/services/inspections.service";
import { listProcessOptions } from "@/server/services/processes.service";
import { listSiteOptions } from "@/server/services/sites.service";

export const metadata = { title: "Historial de inspecciones" };

export default async function InspectionHistoryPage({ searchParams }: PageProps<"/inspections/history">) {
  const user = await requirePagePermission("inspections.read.all", "inspections.read.process", "inspections.read.own");
  const query = inspectionListQuerySchema.parse(await searchParams);
  const [result, sites, processes] = await Promise.all([listInspections(query, user), listSiteOptions(), listProcessOptions()]);
  const scope = getReadScope(user, "inspections");
  const scopeText = { all: "Todas las inspecciones", process: "Inspecciones de tus procesos", own: "Inspecciones que realizaste", assigned: "" }[scope!];

  return (
    <>
      <PageHeader title="Historial de inspecciones" description={scopeText} />
      <Card>
        <FilterBar
          q={query.q}
          placeholder="Buscar por código de elemento o brigadista"
          resetHref="/inspections/history"
          selects={[
            { name: "site", label: "Sede", value: query.site, options: sites.map((s) => ({ value: s.id, label: s.name })) },
            {
              name: "process",
              label: "Proceso",
              value: query.process,
              options: (scope === "process" ? processes.filter((p) => user.processIds.includes(p.id)) : processes).map((p) => ({
                value: p.id,
                label: p.name,
              })),
            },
            {
              name: "result",
              label: "Resultado",
              value: query.result,
              options: [
                { value: "COMPLIANT", label: "Cumple" },
                { value: "NON_COMPLIANT", label: "No cumple" },
              ],
            },
            {
              name: "review",
              label: "Revisión",
              value: query.review,
              options: (["PENDING_REVIEW", "REVIEWED", "ARCHIVED"] as const).map((r) => ({ value: r, label: INSPECTION_REVIEW_LABELS[r] })),
            },
            {
              name: "status",
              label: "Estado",
              value: query.status,
              options: (["COMPLETED", "IN_PROGRESS", "CANCELLED"] as const).map((s) => ({ value: s, label: INSPECTION_STATUS_LABELS[s] })),
            },
          ]}
        />
        <form method="get" className="flex flex-wrap items-end gap-2 border-b border-border px-4 pb-4">
          {query.q && <input type="hidden" name="q" value={query.q} />}
          {query.site && <input type="hidden" name="site" value={query.site} />}
          {query.process && <input type="hidden" name="process" value={query.process} />}
          {query.result && <input type="hidden" name="result" value={query.result} />}
          {query.status && <input type="hidden" name="status" value={query.status} />}
          {query.review && <input type="hidden" name="review" value={query.review} />}
          <label className="text-sm">
            <span className="mb-1 block text-subtle">Desde</span>
            <Input type="date" name="from" defaultValue={query.from} className="h-10" />
          </label>
          <label className="text-sm">
            <span className="mb-1 block text-subtle">Hasta</span>
            <Input type="date" name="to" defaultValue={query.to} className="h-10" />
          </label>
          <button type="submit" className="h-10 rounded-lg border border-border-strong bg-surface px-3 text-sm font-medium">
            Aplicar fechas
          </button>
        </form>
        <DataList
          caption="Inspecciones"
          rows={result.items}
          rowKey={(i) => i.id}
          rowHref={(i) => `/inspections/${i.id}`}
          empty={<EmptyState icon={ClipboardList} title="No hay inspecciones" description="Ajusta los filtros." />}
          columns={[
            {
              key: "element",
              header: "Elemento",
              cell: (i) => (
                <span>
                  {i.element.code}
                  <span className="block text-xs font-normal text-subtle">
                    {formatNumber(i.number)} · {i.element.elementType.name}
                  </span>
                </span>
              ),
            },
            { key: "zone", header: "Sede / zona", cell: (i) => `${i.site.name}${i.element.zone ? ` · ${i.element.zone.name}` : ""}` },
            { key: "inspector", header: "Brigadista", cell: (i) => i.inspector.name },
            { key: "date", header: "Fecha", cell: (i) => formatDateTime(i.completedAt ?? i.startedAt) },
            {
              key: "result",
              header: "Resultado",
              cell: (i) =>
                i.result ? (
                  <Badge tone={i.result === "COMPLIANT" ? "success" : "danger"}>
                    {INSPECTION_RESULT_LABELS[i.result]}
                    {i.compliancePct !== null && ` · ${Number(i.compliancePct).toFixed(0)}%`}
                  </Badge>
                ) : (
                  <Badge>{INSPECTION_STATUS_LABELS[i.status]}</Badge>
                ),
            },
            {
              key: "review",
              header: "Revisión",
              cell: (i) =>
                i.reviewStatus ? <Badge tone={INSPECTION_REVIEW_TONES[i.reviewStatus]}>{INSPECTION_REVIEW_LABELS[i.reviewStatus]}</Badge> : "—",
            },
          ]}
        />
        <Pagination
          page={result.page}
          pageCount={result.pageCount}
          total={result.total}
          basePath="/inspections/history"
          searchParams={{
            q: query.q,
            site: query.site,
            process: query.process,
            result: query.result,
            status: query.status,
            review: query.review,
            from: query.from,
            to: query.to,
          }}
        />
      </Card>
    </>
  );
}

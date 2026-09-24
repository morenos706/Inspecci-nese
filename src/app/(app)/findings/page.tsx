import { AlertTriangle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { DataList } from "@/components/ui/data-list";
import { EmptyState } from "@/components/ui/empty-state";
import { FilterBar } from "@/components/ui/filter-bar";
import { PageHeader } from "@/components/ui/page-header";
import { Pagination } from "@/components/ui/pagination";
import {
  FINDING_SOURCE_LABELS as SOURCE_LABELS,
  PRIORITIES,
  PRIORITY_LABELS,
  PRIORITY_TONES,
  WORKFLOW_STATUS_LABELS,
  WORKFLOW_STATUS_TONES,
} from "@/lib/labels";
import { formatDate, formatNumber } from "@/lib/utils";
import { getReadScope, requirePagePermission } from "@/server/auth/current-user";
import { findingListQuerySchema, listFindings } from "@/server/services/findings.service";
import { listProcessOptions } from "@/server/services/processes.service";
import { listSiteOptions } from "@/server/services/sites.service";

export const metadata = { title: "Hallazgos" };

export default async function FindingsPage({ searchParams }: PageProps<"/findings">) {
  const user = await requirePagePermission("findings.read.all", "findings.read.process", "findings.read.assigned");
  const query = findingListQuerySchema.parse(await searchParams);
  const [result, processes, sites] = await Promise.all([listFindings(query, user), listProcessOptions(), listSiteOptions()]);
  const scope = getReadScope(user, "findings");

  return (
    <>
      <PageHeader
        title="Hallazgos"
        description={scope === "assigned" ? "Hallazgos que registraste o que tienes asignados." : "No conformidades detectadas y su estado de gestión."}
      />
      <Card>
        <FilterBar
          q={query.q}
          placeholder="Buscar por descripción o código de elemento"
          resetHref="/findings"
          selects={[
            {
              name: "status",
              label: "Estado",
              value: query.status === "open" ? undefined : query.status,
              options: [
                { value: "all", label: "Todos (incluye cerrados)" },
                ...(["PENDING", "IN_PROGRESS", "SOLVED", "VERIFIED", "CLOSED"] as const).map((s) => ({ value: s, label: WORKFLOW_STATUS_LABELS[s] })),
              ],
            },
            { name: "priority", label: "Prioridad", value: query.priority, options: PRIORITIES.map((p) => ({ value: p, label: PRIORITY_LABELS[p] })) },
            {
              name: "source",
              label: "Origen",
              value: query.source,
              options: (Object.keys(SOURCE_LABELS) as (keyof typeof SOURCE_LABELS)[]).map((s) => ({ value: s, label: SOURCE_LABELS[s] })),
            },
            {
              name: "process",
              label: "Proceso",
              value: query.process,
              options: (scope === "process" ? processes.filter((p) => user.processIds.includes(p.id)) : processes).map((p) => ({ value: p.id, label: p.name })),
            },
            { name: "site", label: "Sede", value: query.site, options: sites.map((s) => ({ value: s.id, label: s.name })) },
          ]}
        />
        <DataList
          caption="Hallazgos"
          rows={result.items}
          rowKey={(f) => f.id}
          rowHref={(f) => `/findings/${f.id}`}
          empty={<EmptyState icon={AlertTriangle} title="No hay hallazgos" description="No se encontraron hallazgos con estos filtros." />}
          columns={[
            {
              key: "finding",
              header: "Hallazgo",
              cell: (f) => (
                <span>
                  {formatNumber(f.number)} · {f.element.code}
                  <span className="block text-sm font-normal text-muted">{f.description}</span>
                </span>
              ),
            },
            {
              key: "priority",
              header: "Prioridad",
              cell: (f) => (
                <span className="flex flex-wrap gap-1">
                  <Badge tone={PRIORITY_TONES[f.priority]}>{PRIORITY_LABELS[f.priority]}</Badge>
                  {f.source === "EXPIRY" && <Badge tone="danger">Vencimiento</Badge>}
                </span>
              ),
            },
            { key: "process", header: "Proceso", hideOnMobile: true, cell: (f) => f.process.name },
            { key: "responsible", header: "Responsable", cell: (f) => f.responsible?.name ?? "—" },
            { key: "due", header: "Fecha límite", cell: (f) => formatDate(f.dueDate) },
            { key: "status", header: "Estado", cell: (f) => <Badge tone={WORKFLOW_STATUS_TONES[f.status]}>{WORKFLOW_STATUS_LABELS[f.status]}</Badge> },
          ]}
        />
        <Pagination
          page={result.page}
          pageCount={result.pageCount}
          total={result.total}
          basePath="/findings"
          searchParams={{ q: query.q, status: query.status, priority: query.priority, source: query.source, process: query.process, site: query.site }}
        />
      </Card>
    </>
  );
}

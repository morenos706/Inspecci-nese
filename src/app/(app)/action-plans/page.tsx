import Link from "next/link";
import { ListTodo } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { DataList } from "@/components/ui/data-list";
import { EmptyState } from "@/components/ui/empty-state";
import { FilterBar } from "@/components/ui/filter-bar";
import { PageHeader } from "@/components/ui/page-header";
import { Pagination } from "@/components/ui/pagination";
import { PRIORITIES, PRIORITY_LABELS, PRIORITY_TONES, WORKFLOW_STATUS_LABELS, WORKFLOW_STATUS_TONES } from "@/lib/labels";
import { cn, formatDate, formatNumber } from "@/lib/utils";
import { isPlanOverdue } from "@/lib/workflow";
import { getReadScope, requirePagePermission } from "@/server/auth/current-user";
import { actionPlanListQuerySchema, listActionPlans } from "@/server/services/action-plans.service";

export const metadata = { title: "Planes de acción" };

export default async function ActionPlansPage({ searchParams }: PageProps<"/action-plans">) {
  const user = await requirePagePermission("actions.read.all", "actions.read.process", "actions.read.assigned");
  const canSeeOthers = getReadScope(user, "actions") !== "assigned";
  const query = actionPlanListQuerySchema.parse(await searchParams);
  if (!canSeeOthers) query.view = "mine";
  const result = await listActionPlans(query, user);

  const tab = (view: "mine" | "all", label: string) => (
    <Link
      href={`/action-plans?view=${view}`}
      aria-current={query.view === view ? "page" : undefined}
      className={cn(
        "flex-1 rounded-lg px-3 py-2 text-center text-sm font-medium sm:flex-none",
        query.view === view ? "bg-surface text-foreground shadow-sm" : "text-subtle hover:text-foreground",
      )}
    >
      {label}
    </Link>
  );

  return (
    <>
      <PageHeader title="Planes de acción" description="Acciones para solucionar los hallazgos, con responsable y fecha límite." />
      {canSeeOthers && (
        <div className="mb-4 flex gap-1 rounded-xl bg-surface-muted p-1 sm:inline-flex">
          {tab("mine", "Asignados a mí")}
          {tab("all", "Todos")}
        </div>
      )}
      <Card>
        <FilterBar
          q={query.q}
          placeholder="Buscar por acción, elemento o hallazgo"
          resetHref={`/action-plans?view=${query.view}`}
          hidden={{ view: query.view }}
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
            { name: "overdue", label: "Vencidos", value: query.overdue, options: [{ value: "1", label: "Solo vencidos" }] },
          ]}
        />
        <DataList
          caption="Planes de acción"
          rows={result.items}
          rowKey={(p) => p.id}
          rowHref={(p) => `/action-plans/${p.id}`}
          empty={<EmptyState icon={ListTodo} title="No hay planes de acción" description="No tienes planes con estos filtros." />}
          columns={[
            {
              key: "plan",
              header: "Plan",
              cell: (p) => (
                <span>
                  {formatNumber(p.number)} · {p.finding.element.code}
                  <span className="block text-sm font-normal text-muted">{p.action}</span>
                </span>
              ),
            },
            {
              key: "priority",
              header: "Prioridad",
              cell: (p) => (
                <span className="flex flex-wrap gap-1">
                  <Badge tone={PRIORITY_TONES[p.finding.priority]}>{PRIORITY_LABELS[p.finding.priority]}</Badge>
                  {p.finding.source === "EXPIRY" && <Badge tone="danger">Vencimiento</Badge>}
                </span>
              ),
            },
            { key: "responsible", header: "Responsable", cell: (p) => p.responsible.name },
            {
              key: "due",
              header: "Fecha límite",
              cell: (p) =>
                isPlanOverdue(p.status, p.dueDate, result.today) ? (
                  <Badge tone="danger">Vencido · {formatDate(p.dueDate)}</Badge>
                ) : (
                  formatDate(p.dueDate)
                ),
            },
            { key: "status", header: "Estado", cell: (p) => <Badge tone={WORKFLOW_STATUS_TONES[p.status]}>{WORKFLOW_STATUS_LABELS[p.status]}</Badge> },
          ]}
        />
        <Pagination
          page={result.page}
          pageCount={result.pageCount}
          total={result.total}
          basePath="/action-plans"
          searchParams={{ q: query.q, view: query.view, status: query.status, priority: query.priority, overdue: query.overdue }}
        />
      </Card>
    </>
  );
}

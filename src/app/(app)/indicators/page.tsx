import Link from "next/link";
import { AlertOctagon, ClipboardCheck, Flame, Gauge, Timer, TriangleAlert } from "lucide-react";
import { BarList } from "@/components/charts/bar-list";
import { fmt } from "@/lib/chart-format";
import { ColumnChart } from "@/components/charts/column-chart";
import { IndicatorFilters } from "@/components/charts/indicator-filters";
import { LineChart } from "@/components/charts/line-chart";
import { Meter } from "@/components/charts/meter";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { StatCard } from "@/components/ui/stat-card";
import { monthLabel } from "@/lib/indicators";
import { PRIORITY_LABELS, WORKFLOW_STATUS_LABELS } from "@/lib/labels";
import { formatDate } from "@/lib/utils";
import { requirePagePermission } from "@/server/auth/current-user";
import { getIndicatorFilterOptions, getIndicators, indicatorFiltersSchema } from "@/server/services/indicators.service";

export const metadata = { title: "Indicadores" };

function BreakdownTable({
  title,
  rows,
}: {
  title: string;
  rows: {
    id: string;
    name: string;
    inspections: number;
    avgCompliance: number | null;
    compliantShare: number | null;
    openFindings: number;
    overdueElements: number;
  }[];
}) {
  return (
    <Card>
      <CardHeader title={title} description="Cumplimiento promedio de las inspecciones realizadas en el periodo." />
      {rows.length === 0 ? (
        <CardBody className="text-sm text-subtle">Sin datos en el periodo.</CardBody>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <caption className="sr-only">{title}</caption>
            <thead className="border-b border-border bg-surface-muted text-xs uppercase tracking-wide text-subtle">
              <tr>
                <th scope="col" className="px-4 py-2 font-medium">
                  Nombre
                </th>
                <th scope="col" className="px-4 py-2 font-medium">
                  Cumplimiento
                </th>
                <th scope="col" className="px-4 py-2 text-right font-medium">
                  Inspecciones
                </th>
                <th scope="col" className="px-4 py-2 text-right font-medium">
                  Sin novedad
                </th>
                <th scope="col" className="px-4 py-2 text-right font-medium">
                  Hallazgos abiertos
                </th>
                <th scope="col" className="px-4 py-2 text-right font-medium">
                  Insp. vencidas
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border tabular-nums">
              {rows.map((r) => (
                <tr key={r.id}>
                  <th scope="row" className="px-4 py-2 font-medium">
                    {r.name}
                  </th>
                  <td className="px-4 py-2">
                    <Meter value={r.avgCompliance} label={`Cumplimiento ${r.name}`} />
                  </td>
                  <td className="px-4 py-2 text-right">{r.inspections}</td>
                  <td className="px-4 py-2 text-right">{fmt(r.compliantShare, "%")}</td>
                  <td className="px-4 py-2 text-right">{r.openFindings}</td>
                  <td className="px-4 py-2 text-right">{r.overdueElements}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

export default async function IndicatorsPage({ searchParams }: PageProps<"/indicators">) {
  const user = await requirePagePermission("dashboard.view");
  const filters = indicatorFiltersSchema.parse(await searchParams);
  const [data, options] = await Promise.all([getIndicators(filters, user), getIndicatorFilterOptions(user)]);
  const { program } = data;
  const labels = data.trend.map((t) => monthLabel(t.month));

  return (
    <>
      <PageHeader
        title="Dashboard gerencial"
        description={`Periodo ${formatDate(`${data.period.from}T12:00:00Z`)} – ${formatDate(`${data.period.to}T12:00:00Z`)}. Los estados de programación (pendientes, vencidas) son al día de hoy.`}
      />
      <IndicatorFilters
        today={data.period.today}
        options={options}
        values={{ ...filters, from: data.period.from, to: data.period.to }}
      />

      {/* Cifra principal + desglose */}
      <section aria-label="Cumplimiento del programa" className="mb-6 grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-1">
          <CardBody>
            <p className="text-sm font-medium text-subtle">Cumplimiento del programa de inspecciones</p>
            <p className="mt-1 text-5xl font-semibold tracking-tight">{fmt(program.compliance, "%")}</p>
            <dl className="mt-3 grid grid-cols-3 gap-2 text-sm">
              <div>
                <dt className="text-subtle">Realizadas</dt>
                <dd className="text-lg font-semibold">{program.done}</dd>
              </div>
              <div>
                <dt className="text-subtle">Pendientes</dt>
                <dd className="text-lg font-semibold">
                  <Link href="/inventory?schedule=DUE_SOON" className="hover:underline">
                    {program.pending}
                  </Link>
                </dd>
              </div>
              <div>
                <dt className="text-subtle">Vencidas</dt>
                <dd className="text-lg font-semibold">
                  <Link href="/inventory?schedule=OVERDUE" className="hover:underline">
                    {program.overdue}
                  </Link>
                </dd>
              </div>
            </dl>
            <p className="mt-3 text-xs text-subtle">
              Realizadas ÷ (realizadas + pendientes + vencidas). {program.activeElements} elementos activos.
            </p>
          </CardBody>
        </Card>
        <div className="grid grid-cols-2 gap-3 lg:col-span-2 lg:grid-cols-3">
          <StatCard label="Cumplimiento promedio" value={fmt(data.inspections.avgCompliance, "%")} icon={Gauge} hint="de las inspecciones" />
          <StatCard label="Inspecciones sin novedad" value={fmt(data.inspections.compliantShare, "%")} icon={ClipboardCheck} tone="success" />
          <StatCard label="Hallazgos abiertos" value={data.findings.open} icon={TriangleAlert} tone="warning" href="/findings" hint={`${data.findings.total} en el periodo`} />
          <StatCard label="Hallazgos críticos abiertos" value={data.findings.criticalOpen} icon={AlertOctagon} tone="danger" href="/findings?priority=CRITICAL" />
          <StatCard label="Planes vencidos" value={data.plans.overdue} icon={Timer} tone="danger" href="/action-plans?view=all&overdue=1" hint={`${data.plans.total} planes en el periodo`} />
          <StatCard label="Vencimientos expirados" value={program.expired} icon={Flame} tone="danger" href="/inventory?expiry=EXPIRED" hint="recargas, caducidades" />
        </div>
      </section>

      {/* Tendencia mensual: una métrica por gráfico (nunca doble eje) */}
      <section aria-label="Tendencia mensual" className="mb-6 grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title="Inspecciones realizadas por mes" />
          <CardBody>
            <ColumnChart
              caption="Inspecciones realizadas por mes"
              seriesLabel="inspecciones"
              data={data.trend.map((t, i) => ({ key: t.month, label: labels[i]!, value: t.inspections }))}
            />
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Cumplimiento promedio por mes" />
          <CardBody>
            <LineChart
              caption="Cumplimiento promedio por mes (%)"
              labels={labels}
              unit="%"
              fixedMax={100}
              series={[{ key: "pct", label: "Cumplimiento", values: data.trend.map((t) => t.avgCompliance) }]}
            />
          </CardBody>
        </Card>
        <Card className="lg:col-span-2">
          <CardHeader title="Hallazgos registrados y cerrados por mes" />
          <CardBody>
            <LineChart
              caption="Hallazgos registrados y cerrados por mes"
              labels={labels}
              series={[
                { key: "created", label: "Registrados", values: data.trend.map((t) => t.findingsCreated) },
                { key: "closed", label: "Cerrados", values: data.trend.map((t) => t.findingsClosed) },
              ]}
            />
          </CardBody>
        </Card>
      </section>

      <section aria-label="Hallazgos y planes" className="mb-6 grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title="Hallazgos por prioridad" description="Registrados en el periodo." />
          <CardBody>
            <BarList
              caption="Hallazgos por prioridad"
              items={data.findings.byPriority.map((p) => ({
                key: p.key,
                label: PRIORITY_LABELS[p.key],
                value: p.value,
                href: `/findings?priority=${p.key}&status=all`,
              }))}
            />
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Planes de acción por estado" description="Creados en el periodo." />
          <CardBody>
            <BarList
              caption="Planes de acción por estado"
              items={data.plans.byStatus.map((s) => ({
                key: s.key,
                label: WORKFLOW_STATUS_LABELS[s.key],
                value: s.value,
                href: `/action-plans?view=all&status=${s.key}`,
              }))}
            />
          </CardBody>
        </Card>
      </section>

      <section aria-label="Cumplimiento por proceso y sede" className="grid gap-4">
        <BreakdownTable title="Cumplimiento por proceso" rows={data.byProcess} />
        <BreakdownTable title="Cumplimiento por sede" rows={data.bySite} />
      </section>
    </>
  );
}

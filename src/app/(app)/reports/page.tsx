import { ClipboardList, FileSpreadsheet, FileText, Gauge, ListTodo, Boxes, TriangleAlert, type LucideIcon } from "lucide-react";
import { Alert } from "@/components/ui/alert";
import { Card, CardBody } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { IndicatorFilters } from "@/components/charts/indicator-filters";
import { hasPermission, requirePagePermission } from "@/server/auth/current-user";
import { getIndicatorFilterOptions, indicatorFiltersSchema, resolvePeriod } from "@/server/services/indicators.service";
import type { ReportKind } from "@/server/services/reports.service";

export const metadata = { title: "Reportes" };

const REPORTS: { kind: ReportKind; title: string; description: string; icon: LucideIcon }[] = [
  { kind: "inspections", title: "Inspecciones", description: "Inspecciones realizadas con resultado, % de cumplimiento, brigadista y hallazgos.", icon: ClipboardList },
  { kind: "findings", title: "Hallazgos", description: "Hallazgos con prioridad, responsable, fecha límite, estado y cierre.", icon: TriangleAlert },
  { kind: "action-plans", title: "Planes de acción", description: "Planes con responsable, fechas, estado, vencidos y verificación.", icon: ListTodo },
  { kind: "inventory", title: "Inventario y programación", description: "Elementos con zona, próxima inspección, estado de programación y vencimientos (no usa el periodo).", icon: Boxes },
  { kind: "compliance", title: "Cumplimiento", description: "Indicadores generales, cumplimiento por proceso y por sede, y tendencia mensual.", icon: Gauge },
];

export default async function ReportsPage({ searchParams }: PageProps<"/reports">) {
  const user = await requirePagePermission("reports.view", "reports.export");
  const filters = indicatorFiltersSchema.parse(await searchParams);
  const canExport = hasPermission(user, "reports.export");
  const options = await getIndicatorFilterOptions(user).catch(() => ({ processes: [], sites: [], types: [], users: [] }));
  const { from, to, today } = resolvePeriod(filters);
  const qs = (format: "pdf" | "xlsx") => {
    const p = new URLSearchParams({ format, from, to });
    for (const k of ["process", "site", "type", "responsible", "status"] as const) if (filters[k]) p.set(k, filters[k]!);
    return p.toString();
  };

  return (
    <>
      <PageHeader
        title="Reportes"
        description="Elige los filtros y descarga cada reporte en PDF (para imprimir o enviar) o en Excel (para analizar)."
      />
      {!canExport && (
        <Alert tone="warning" className="mb-4" title="No tienes permiso para descargar reportes">
          Pide al administrador que agregue el permiso «Exportar reportes (PDF / Excel)» a tu rol.
        </Alert>
      )}
      <IndicatorFilters basePath="/reports" today={today} options={options} values={{ ...filters, from, to }} />
      <p className="-mt-3 mb-4 text-xs text-subtle">
        El filtro «Estado» aplica a hallazgos y planes de acción. Cada reporte respeta tu alcance (por ejemplo, un responsable de
        proceso solo ve sus procesos). Máximo 5.000 filas por reporte.
      </p>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {REPORTS.map((r) => (
          <Card key={r.kind}>
            <CardBody className="flex h-full flex-col">
              <div className="flex items-center gap-3">
                <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary-soft text-primary">
                  <r.icon className="h-5 w-5" aria-hidden />
                </span>
                <h2 className="text-base font-semibold">{r.title}</h2>
              </div>
              <p className="mt-2 flex-1 text-sm text-subtle">{r.description}</p>
              {canExport && (
                <div className="mt-4 grid grid-cols-2 gap-2">
                  <a
                    href={`/api/reports/${r.kind}?${qs("pdf")}`}
                    className="flex h-11 items-center justify-center gap-2 rounded-lg border border-border-strong bg-surface text-sm font-medium hover:bg-surface-muted"
                  >
                    <FileText className="h-4 w-4 text-danger" aria-hidden /> PDF
                  </a>
                  <a
                    href={`/api/reports/${r.kind}?${qs("xlsx")}`}
                    className="flex h-11 items-center justify-center gap-2 rounded-lg border border-border-strong bg-surface text-sm font-medium hover:bg-surface-muted"
                  >
                    <FileSpreadsheet className="h-4 w-4 text-success" aria-hidden /> Excel
                  </a>
                </div>
              )}
            </CardBody>
          </Card>
        ))}
      </div>
    </>
  );
}

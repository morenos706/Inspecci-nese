import Link from "next/link";
import { redirect } from "next/navigation";
import { ChevronRight, History, MapPinned, PlayCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Select } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/page-header";
import { formatDateTime, formatNumber } from "@/lib/utils";
import { hasPermission, requirePagePermission } from "@/server/auth/current-user";
import { listInspectionZones, listMyInProgress, NO_ZONE } from "@/server/services/inspections.service";
import { listSiteOptions } from "@/server/services/sites.service";

export const metadata = { title: "Mis inspecciones" };

export default async function MyInspectionsPage({ searchParams }: PageProps<"/inspections">) {
  const user = await requirePagePermission(
    "inspections.perform",
    "inspections.read.all",
    "inspections.read.process",
    "inspections.read.own",
  );
  // Quien solo consulta va directo al historial.
  if (!hasPermission(user, "inspections.perform")) redirect("/inspections/history");

  const { site } = await searchParams;
  const siteId = typeof site === "string" && site.length <= 64 ? site : undefined;
  const [inProgress, zones, sites] = await Promise.all([
    listMyInProgress(user),
    listInspectionZones(user, siteId),
    listSiteOptions(),
  ]);

  return (
    <>
      <PageHeader
        title="Mis inspecciones"
        description="Elige una zona y recorre sus elementos. Cualquier brigadista puede inspeccionar cualquier zona."
        actions={
          <ButtonLink href="/inspections/history" variant="outline">
            <History className="h-4 w-4" aria-hidden /> Historial
          </ButtonLink>
        }
      />

      {inProgress.length > 0 && (
        <Card className="mb-6 border-primary/30">
          <CardHeader title="En curso" description="Inspecciones que iniciaste y no has finalizado." />
          <ul className="divide-y divide-border">
            {inProgress.map((i) => (
              <li key={i.id}>
                <Link href={`/inspections/${i.id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-surface-muted sm:px-6">
                  <PlayCircle className="h-6 w-6 shrink-0 text-primary" aria-hidden />
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold">
                      {i.element.code} <span className="font-normal text-subtle">· {i.element.elementType.name}</span>
                    </p>
                    <p className="text-sm text-subtle">
                      {formatNumber(i.number)} · {i.element.zone?.name ?? "Sin zona"} · {i.answeredCount}/{i.totalQuestions}{" "}
                      respondidas · desde {formatDateTime(i.startedAt)}
                    </p>
                  </div>
                  <ChevronRight className="h-5 w-5 text-subtle" aria-hidden />
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-subtle">Zonas</h2>
        {sites.length > 1 && (
          <form method="get" className="flex gap-2">
            <Select name="site" defaultValue={siteId ?? ""} aria-label="Sede" className="h-10 w-48">
              <option value="">Todas las sedes</option>
              {sites.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </Select>
            <button type="submit" className="h-10 rounded-lg border border-border-strong bg-surface px-3 text-sm font-medium">
              Ver
            </button>
          </form>
        )}
      </div>

      {zones.length === 0 ? (
        <Card>
          <EmptyState icon={MapPinned} title="No hay zonas con elementos" description="El administrador debe crear zonas y asignarles elementos." />
        </Card>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {zones.map((z) => {
            const href = z.zoneId
              ? `/inspections/zones/${z.zoneId}`
              : `/inspections/zones/${NO_ZONE}?site=${z.site.id}`;
            const pending = z.overdue + z.dueSoon;
            return (
              <li key={z.key}>
                <Link
                  href={href}
                  className="flex h-full flex-col rounded-xl border border-border bg-surface p-4 shadow-sm transition-colors hover:border-primary active:bg-surface-muted"
                >
                  <p className="text-xs font-medium uppercase tracking-wide text-subtle">{z.site.name}</p>
                  <p className="mt-0.5 text-lg font-semibold">{z.name}</p>
                  <p className="mt-1 text-sm text-subtle">{z.total} elemento(s) activo(s)</p>
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {z.overdue > 0 && <Badge tone="danger">{z.overdue} vencida(s)</Badge>}
                    {z.dueSoon > 0 && <Badge tone="warning">{z.dueSoon} próxima(s) a vencer</Badge>}
                    {pending === 0 && z.total > 0 && <Badge tone="success">Al día</Badge>}
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}

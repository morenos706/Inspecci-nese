import Link from "next/link";
import { notFound } from "next/navigation";
import { Boxes, MapPin } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { ScheduleBadge } from "@/components/ui/schedule-badge";
import { ExpiryBadge } from "@/components/ui/expiry-badge";
import { env } from "@/lib/env";
import { StartInspectionButton } from "@/components/inspections/start-inspection-button";
import { scheduleStatus } from "@/lib/scheduling";
import { formatDate, todayISO } from "@/lib/utils";
import { requirePagePermission } from "@/server/auth/current-user";
import { orNotFound } from "@/server/page-helpers";
import { getZoneWorklist, NO_ZONE } from "@/server/services/inspections.service";

export const metadata = { title: "Zona" };

export default async function ZoneWorklistPage({ params, searchParams }: PageProps<"/inspections/zones/[key]">) {
  const user = await requirePagePermission("inspections.perform");
  const { key } = await params;
  const { site } = await searchParams;
  const noZone = key === NO_ZONE;
  if (noZone && typeof site !== "string") notFound();
  const { zone, elements } = await orNotFound(getZoneWorklist(user, noZone ? null : key, (site as string) ?? ""));
  const now = new Date();
  const today = todayISO(now, env.APP_TIMEZONE);
  const pending = elements.filter(
    (e) => scheduleStatus(e.nextInspectionAt, e.frequency, now, e.frequencyDays) !== "ON_TIME",
  ).length;

  return (
    <>
      <PageHeader
        title={zone.name}
        description={`${zone.site!.name} · ${elements.length} elemento(s) · ${pending} vencido(s) o próximo(s) a vencer`}
        back={{ href: "/inspections", label: "Mis inspecciones" }}
      />
      {zone.description && <p className="-mt-3 mb-4 text-sm text-subtle">{zone.description}</p>}

      {elements.length === 0 ? (
        <Card>
          <EmptyState icon={Boxes} title="Esta zona no tiene elementos activos" />
        </Card>
      ) : (
        <ul className="space-y-3">
          {elements.map((e) => (
            <li key={e.id} className="rounded-xl border border-border bg-surface p-4 shadow-sm">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <Link href={`/inventory/${e.id}`} className="text-lg font-semibold hover:underline">
                    {e.code}
                  </Link>
                  <p className="text-sm text-muted">
                    {e.elementType.name} · {e.name}
                  </p>
                  {e.location && (
                    <p className="mt-1 flex items-start gap-1 text-sm text-subtle">
                      <MapPin className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                      {e.location}
                    </p>
                  )}
                </div>
                <ScheduleBadge next={e.nextInspectionAt} frequency={e.frequency} frequencyDays={e.frequencyDays} />
              </div>
              <p className="mt-2 text-sm text-subtle">
                Última: {formatDate(e.lastInspectionAt)} · Próxima: <strong className="text-foreground">{formatDate(e.nextInspectionAt)}</strong>
              </p>
              <div className="mt-2">
                <ExpiryBadge expiresAt={e.expiresAt} label={e.expiryLabel} today={today} />
              </div>
              {e.othersInProgress.length > 0 && (
                <Badge tone="info" className="mt-2">
                  En curso por {e.othersInProgress.join(", ")}
                </Badge>
              )}
              <div className="mt-3">
                {e.myInProgressId ? (
                  <ButtonLink href={`/inspections/${e.myInProgressId}`} size="lg" className="w-full sm:w-auto">
                    Continuar inspección
                  </ButtonLink>
                ) : (
                  <StartInspectionButton elementId={e.id} size="lg" className="w-full sm:w-auto" />
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

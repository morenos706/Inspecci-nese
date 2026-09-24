import Link from "next/link";
import { notFound } from "next/navigation";
import { AlertTriangle, MapPin, QrCode } from "lucide-react";
import { ButtonLink } from "@/components/ui/button";
import { Card, CardBody } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { ExpiryBadge } from "@/components/ui/expiry-badge";
import { ScheduleBadge } from "@/components/ui/schedule-badge";
import { StartInspectionButton } from "@/components/inspections/start-inspection-button";
import { env } from "@/lib/env";
import { ELEMENT_STATUS_LABELS } from "@/lib/labels";
import { formatDate, todayISO } from "@/lib/utils";
import { getReadScope, requirePageUser } from "@/server/auth/current-user";
import { findElementByQr } from "@/server/services/qr.service";

export const metadata = { title: "Elemento escaneado" };

/**
 * Destino del código QR pegado en el elemento: identifica el elemento por un
 * token opaco y muestra lo esencial con el acceso directo a inspeccionar.
 */
export default async function QrLandingPage({ params }: PageProps<"/q/[token]">) {
  const user = await requirePageUser();
  const { token } = await params;
  const element = await findElementByQr(token, user);
  if (!element) {
    if (!/^[A-Za-z0-9_-]{10,64}$/.test(token)) notFound();
    return (
      <Card>
        <EmptyState
          icon={QrCode}
          title="Código QR no reconocido"
          description="La etiqueta puede estar desactualizada (se generó un QR nuevo) o no tienes acceso a este elemento."
          action={<ButtonLink href="/scan">Escanear otro</ButtonLink>}
        />
      </Card>
    );
  }
  const canPerform = user.permissions.has("inspections.perform");
  const canRead = getReadScope(user, "elements") !== null;
  const inProgress = element.inspections[0];

  return (
    <div className="mx-auto max-w-lg space-y-4">
      <Card>
        <CardBody>
          <p className="text-xs font-semibold uppercase tracking-wide text-brand">{element.elementType.name}</p>
          <h1 className="mt-1 text-3xl font-bold">{element.code}</h1>
          <p className="text-muted">{element.name}</p>
          <p className="mt-2 flex items-start gap-1.5 text-sm text-subtle">
            <MapPin className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            {element.site.name}
            {element.zone && ` · ${element.zone.name}`}
            {element.location && ` · ${element.location}`}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <ScheduleBadge next={element.nextInspectionAt} frequency={element.frequency} frequencyDays={element.frequencyDays} elementStatus={element.status} />
            <ExpiryBadge expiresAt={element.expiresAt} label={element.expiryLabel} today={todayISO(new Date(), env.APP_TIMEZONE)} showValid />
          </div>
          <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
            <div>
              <dt className="text-subtle">Última inspección</dt>
              <dd className="font-medium">{formatDate(element.lastInspectionAt)}</dd>
            </div>
            <div>
              <dt className="text-subtle">Próxima</dt>
              <dd className="font-medium">{element.status === "ACTIVE" ? formatDate(element.nextInspectionAt) : "—"}</dd>
            </div>
            <div>
              <dt className="text-subtle">Responsable</dt>
              <dd className="font-medium">{element.responsible?.name ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-subtle">Estado</dt>
              <dd className="font-medium">{ELEMENT_STATUS_LABELS[element.status]}</dd>
            </div>
          </dl>
          {element._count.findings > 0 && (
            <p className="mt-3 flex items-center gap-1.5 text-sm font-medium text-danger">
              <AlertTriangle className="h-4 w-4" aria-hidden /> {element._count.findings} hallazgo(s) abierto(s)
            </p>
          )}
        </CardBody>
      </Card>

      {canPerform && element.status === "ACTIVE" && (
        inProgress ? (
          <ButtonLink href={`/inspections/${inProgress.id}`} size="lg" className="w-full">
            Continuar inspección
          </ButtonLink>
        ) : (
          <StartInspectionButton elementId={element.id} label="Realizar inspección" size="lg" className="w-full" />
        )
      )}
      {canPerform && element.status !== "ACTIVE" && (
        <p className="text-center text-sm text-subtle">El elemento no está activo: no se puede inspeccionar.</p>
      )}
      {canRead && (
        <p className="text-center text-sm">
          <Link href={`/inventory/${element.id}`} className="text-primary hover:underline">
            Ver ficha completa e historial
          </Link>
        </p>
      )}
    </div>
  );
}

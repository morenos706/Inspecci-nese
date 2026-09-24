import { AlertTriangle, ClipboardList, Pencil } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { DataList } from "@/components/ui/data-list";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { ScheduleBadge } from "@/components/ui/schedule-badge";
import { StartInspectionButton } from "@/components/inspections/start-inspection-button";
import {
  ELEMENT_STATUS_LABELS,
  ELEMENT_STATUS_TONES,
  INSPECTION_RESULT_LABELS,
  PRIORITY_LABELS,
  PRIORITY_TONES,
  WORKFLOW_STATUS_LABELS,
  WORKFLOW_STATUS_TONES,
} from "@/lib/labels";
import { FREQUENCY_LABELS } from "@/lib/scheduling";
import { formatDate, formatDateTime, formatNumber } from "@/lib/utils";
import { hasPermission, requirePagePermission } from "@/server/auth/current-user";
import { orNotFound } from "@/server/page-helpers";
import { getElement } from "@/server/services/elements.service";

export const metadata = { title: "Elemento" };

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-subtle">{label}</dt>
      <dd className="mt-0.5 font-medium">{children}</dd>
    </div>
  );
}

export default async function ElementPage({ params }: PageProps<"/inventory/[id]">) {
  const user = await requirePagePermission("elements.read.all", "elements.read.process");
  const { id } = await params;
  const element = await orNotFound(getElement(id, user));
  const frequency =
    element.frequency === "CUSTOM" ? `Cada ${element.frequencyDays} días` : FREQUENCY_LABELS[element.frequency];

  return (
    <>
      <PageHeader
        title={
          <span className="flex flex-wrap items-center gap-2">
            {element.code}
            <Badge tone={ELEMENT_STATUS_TONES[element.status]}>{ELEMENT_STATUS_LABELS[element.status]}</Badge>
          </span>
        }
        description={`${element.elementType.name} · ${element.name}`}
        back={{ href: "/inventory", label: "Inventario" }}
        actions={
          <>
            {hasPermission(user, "inspections.perform") && element.status === "ACTIVE" && (
              <StartInspectionButton elementId={element.id} label="Realizar inspección" size="lg" />
            )}
            {hasPermission(user, "elements.manage") && (
              <ButtonLink href={`/inventory/${element.id}/edit`} variant="outline" size="lg">
                <Pencil className="h-4 w-4" aria-hidden /> Editar
              </ButtonLink>
            )}
          </>
        }
      />

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader title="Ficha del elemento" />
          <CardBody>
            <dl className="grid gap-4 sm:grid-cols-2">
              <Field label="Sede / zona">
                {element.site.name}
                {element.zone && ` · ${element.zone.name}`}
              </Field>
              <Field label="Ubicación">{element.location ?? "—"}</Field>
              <Field label="Proceso">{element.process.name}</Field>
              <Field label="Responsable">{element.responsible?.name ?? "—"}</Field>
              {element.description && (
                <div className="sm:col-span-2">
                  <Field label="Descripción">
                    <span className="whitespace-pre-line font-normal">{element.description}</span>
                  </Field>
                </div>
              )}
              <Field label="Creado">{formatDateTime(element.createdAt)}</Field>
              <Field label="Actualizado">{formatDateTime(element.updatedAt)}</Field>
            </dl>
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Programación" />
          <CardBody>
            <dl className="grid gap-4">
              <Field label="Estado">
                <ScheduleBadge
                  next={element.nextInspectionAt}
                  frequency={element.frequency}
                  frequencyDays={element.frequencyDays}
                  elementStatus={element.status}
                />
              </Field>
              <Field label="Frecuencia">{frequency}</Field>
              <Field label="Última inspección">{formatDate(element.lastInspectionAt)}</Field>
              <Field label="Próxima inspección">
                {element.status === "ACTIVE" ? formatDate(element.nextInspectionAt) : "No aplica (elemento no activo)"}
              </Field>
              <Field label="Inspecciones realizadas">{element._count.inspections}</Field>
            </dl>
          </CardBody>
        </Card>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title="Hallazgos abiertos" description="Pendientes de cierre para este elemento." />
          <DataList
            caption="Hallazgos abiertos"
            rows={element.findings}
            rowKey={(f) => f.id}
            empty={<EmptyState icon={AlertTriangle} title="Sin hallazgos abiertos" />}
            columns={[
              {
                key: "finding",
                header: "Hallazgo",
                cell: (f) => (
                  <span>
                    {formatNumber(f.number)}
                    <span className="block text-sm font-normal text-muted">{f.description}</span>
                  </span>
                ),
              },
              { key: "priority", header: "Prioridad", cell: (f) => <Badge tone={PRIORITY_TONES[f.priority]}>{PRIORITY_LABELS[f.priority]}</Badge> },
              { key: "status", header: "Estado", cell: (f) => <Badge tone={WORKFLOW_STATUS_TONES[f.status]}>{WORKFLOW_STATUS_LABELS[f.status]}</Badge> },
              { key: "due", header: "Fecha límite", cell: (f) => formatDate(f.dueDate) },
            ]}
          />
        </Card>

        <Card>
          <CardHeader title="Historial de inspecciones" description="Últimas 10 inspecciones finalizadas." />
          <DataList
            caption="Historial de inspecciones"
            rows={element.inspections}
            rowKey={(i) => i.id}
            rowHref={(i) => `/inspections/${i.id}`}
            empty={<EmptyState icon={ClipboardList} title="Sin inspecciones registradas" />}
            columns={[
              { key: "number", header: "Inspección", cell: (i) => formatNumber(i.number) },
              { key: "date", header: "Fecha", cell: (i) => formatDate(i.completedAt) },
              { key: "inspector", header: "Inspector", cell: (i) => i.inspector.name },
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
                    "—"
                  ),
              },
            ]}
          />
        </Card>
      </div>
    </>
  );
}

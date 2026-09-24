import Link from "next/link";
import { MapPin } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { DataList } from "@/components/ui/data-list";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { PhotoUploader } from "@/components/inspections/photo-uploader";
import { PlanEditForm } from "@/components/action-plans/plan-edit-form";
import { StatusStepper } from "@/components/action-plans/status-stepper";
import { env } from "@/lib/env";
import { formatAnswerValue } from "@/lib/inspection-rules";
import {
  FINDING_SOURCE_LABELS,
  PRIORITY_LABELS,
  PRIORITY_TONES,
  WORKFLOW_STATUS_LABELS,
  WORKFLOW_STATUS_TONES,
} from "@/lib/labels";
import { addDaysISO, formatDate, formatDateTime, formatNumber, todayISO } from "@/lib/utils";
import { isPlanOverdue } from "@/lib/workflow";
import { requirePagePermission } from "@/server/auth/current-user";
import { orNotFound } from "@/server/page-helpers";
import { managesProcess } from "@/server/services/action-plans.service";
import { getFinding } from "@/server/services/findings.service";
import { listUserOptions } from "@/server/services/users.service";

export const metadata = { title: "Hallazgo" };

export default async function FindingPage({ params }: PageProps<"/findings/[id]">) {
  const user = await requirePagePermission("findings.read.all", "findings.read.process", "findings.read.assigned");
  const { id } = await params;
  const finding = await orNotFound(getFinding(id, user));
  const today = todayISO(new Date(), env.APP_TIMEZONE);
  const canAddPlan = finding.status !== "CLOSED" && managesProcess(user, finding.processId);
  const users = canAddPlan ? await listUserOptions() : [];

  return (
    <>
      <PageHeader
        title={
          <span className="flex flex-wrap items-center gap-2">
            Hallazgo {formatNumber(finding.number)}
            <Badge tone={PRIORITY_TONES[finding.priority]}>{PRIORITY_LABELS[finding.priority]}</Badge>
            <Badge tone={WORKFLOW_STATUS_TONES[finding.status]}>{WORKFLOW_STATUS_LABELS[finding.status]}</Badge>
          </span>
        }
        description={`${finding.element.code} · ${finding.element.elementType.name} · Origen: ${FINDING_SOURCE_LABELS[finding.source]}`}
        back={{ href: "/findings", label: "Hallazgos" }}
      />

      <Card className="mb-6">
        <CardBody>
          <StatusStepper status={finding.status} />
          <p className="mt-2 text-xs text-subtle">El estado del hallazgo avanza automáticamente con el de sus planes de acción.</p>
        </CardBody>
      </Card>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader title="Detalle" />
          <CardBody className="space-y-4 text-sm">
            <p className="text-base">{finding.description}</p>
            {finding.question && (
              <p>
                <span className="text-subtle">Pregunta:</span> {finding.question.text}
                {finding.answer && (
                  <>
                    {" "}
                    · <span className="text-subtle">Respuesta:</span>{" "}
                    <strong className="text-danger">{formatAnswerValue({ responseType: finding.answer.responseType }, finding.answer.value)}</strong>
                  </>
                )}
              </p>
            )}
            {finding.requiredAction && (
              <p>
                <span className="text-subtle">Acción requerida:</span> {finding.requiredAction}
              </p>
            )}
            <p className="flex items-start gap-1 text-subtle">
              <MapPin className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
              <span>
                <Link href={`/inventory/${finding.element.id}`} className="font-medium text-primary hover:underline">
                  {finding.element.code}
                </Link>{" "}
                · {finding.site.name}
                {finding.element.zone && ` · ${finding.element.zone.name}`}
                {finding.element.location && ` · ${finding.element.location}`} · Proceso {finding.process.name}
              </span>
            </p>
            {finding.evidences.length > 0 && (
              <PhotoUploader target={{ kind: "finding", findingId: finding.id }} photos={finding.evidences} label="Fotos del hallazgo" readOnly />
            )}
          </CardBody>
        </Card>
        <Card>
          <CardBody className="space-y-2 text-sm">
            <p>
              <span className="text-subtle">Registrado:</span> {formatDateTime(finding.createdAt)} · {finding.createdBy?.name ?? "Sistema"}
            </p>
            {finding.inspection && (
              <p>
                <span className="text-subtle">Inspección:</span>{" "}
                <Link href={`/inspections/${finding.inspection.id}`} className="text-primary hover:underline">
                  {formatNumber(finding.inspection.number)}
                </Link>
              </p>
            )}
            <p>
              <span className="text-subtle">Responsable:</span> {finding.responsible?.name ?? "—"}
            </p>
            <p>
              <span className="text-subtle">Fecha límite:</span> {formatDate(finding.dueDate)}
            </p>
            {finding.closedAt && (
              <p>
                <span className="text-subtle">Cerrado:</span> {formatDateTime(finding.closedAt)} · {finding.closedBy?.name}
              </p>
            )}
          </CardBody>
        </Card>
      </div>

      <Card className="mt-6">
        <CardHeader title="Planes de acción" />
        <DataList
          caption="Planes de acción del hallazgo"
          rows={finding.actionPlans}
          rowKey={(p) => p.id}
          rowHref={(p) => `/action-plans/${p.id}`}
          empty={<EmptyState title="Sin planes de acción" />}
          columns={[
            {
              key: "plan",
              header: "Plan",
              cell: (p) => (
                <span>
                  {formatNumber(p.number)}
                  <span className="block text-sm font-normal text-muted">{p.action}</span>
                </span>
              ),
            },
            { key: "responsible", header: "Responsable", cell: (p) => p.responsible.name },
            {
              key: "due",
              header: "Fecha límite",
              cell: (p) => (isPlanOverdue(p.status, p.dueDate, today) ? <Badge tone="danger">Vencido · {formatDate(p.dueDate)}</Badge> : formatDate(p.dueDate)),
            },
            { key: "evidences", header: "Evidencias", cell: (p) => p._count.evidences },
            { key: "status", header: "Estado", cell: (p) => <Badge tone={WORKFLOW_STATUS_TONES[p.status]}>{WORKFLOW_STATUS_LABELS[p.status]}</Badge> },
          ]}
        />
        {canAddPlan && (
          <CardBody className="border-t border-border bg-surface-muted/60">
            <h3 className="mb-3 text-sm font-semibold">Agregar plan de acción</h3>
            <PlanEditForm
              mode="create"
              findingId={finding.id}
              users={users}
              today={today}
              defaults={{ action: "", responsibleId: finding.element.responsibleId ?? "", dueDate: addDaysISO(today, 7) }}
            />
          </CardBody>
        )}
      </Card>
    </>
  );
}

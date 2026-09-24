import Link from "next/link";
import { AlertOctagon, MapPin } from "lucide-react";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { ExpiryBadge } from "@/components/ui/expiry-badge";
import { PageHeader } from "@/components/ui/page-header";
import { PhotoUploader } from "@/components/inspections/photo-uploader";
import { PlanEditForm } from "@/components/action-plans/plan-edit-form";
import { StatusStepper } from "@/components/action-plans/status-stepper";
import { WorkflowPanel } from "@/components/action-plans/workflow-panel";
import { env } from "@/lib/env";
import { PRIORITY_LABELS, PRIORITY_TONES, WORKFLOW_STATUS_LABELS, WORKFLOW_STATUS_TONES } from "@/lib/labels";
import { formatDate, formatDateTime, formatNumber, todayISO } from "@/lib/utils";
import { availableActions, canPerform, isPlanOverdue } from "@/lib/workflow";
import { requirePagePermission } from "@/server/auth/current-user";
import { orNotFound } from "@/server/page-helpers";
import { getActionPlan, managesProcess, workflowActor } from "@/server/services/action-plans.service";
import { listUserOptions } from "@/server/services/users.service";

export const metadata = { title: "Plan de acción" };

function waitingMessage(status: string, isSolverWithVerify: string | null) {
  if (isSolverWithVerify) return isSolverWithVerify;
  switch (status) {
    case "PENDING":
    case "IN_PROGRESS":
      return "El responsable del plan es quien reporta el avance y la solución.";
    case "SOLVED":
      return "Solución reportada. Pendiente de verificación por un usuario autorizado.";
    case "VERIFIED":
      return "Solución verificada. Pendiente de cierre por un usuario autorizado.";
    default:
      return "El plan está cerrado.";
  }
}

export default async function ActionPlanPage({ params }: PageProps<"/action-plans/[id]">) {
  const user = await requirePagePermission("actions.read.all", "actions.read.process", "actions.read.assigned");
  const { id } = await params;
  const plan = await orNotFound(getActionPlan(id, user));
  const today = todayISO(new Date(), env.APP_TIMEZONE);
  const actor = workflowActor(user, plan.finding.processId);
  const actions = availableActions(plan, actor);
  const verifyCheck = user.permissions.has("actions.verify") ? canPerform("verify", plan, actor) : null;
  const solverNote = verifyCheck && !verifyCheck.allowed && plan.status === "SOLVED" ? verifyCheck.reason : null;
  const isManager = managesProcess(user, plan.finding.processId);
  const canEditEvidence =
    (plan.responsibleId === user.id || isManager) &&
    user.permissions.has("evidences.upload") &&
    (plan.status === "PENDING" || plan.status === "IN_PROGRESS");
  const overdue = isPlanOverdue(plan.status, plan.dueDate, today);
  const element = plan.finding.element;
  const users = isManager && plan.status !== "CLOSED" && plan.status !== "VERIFIED" ? await listUserOptions() : [];

  return (
    <>
      <PageHeader
        title={
          <span className="flex flex-wrap items-center gap-2">
            Plan {formatNumber(plan.number)}
            <Badge tone={WORKFLOW_STATUS_TONES[plan.status]}>{WORKFLOW_STATUS_LABELS[plan.status]}</Badge>
            <Badge tone={PRIORITY_TONES[plan.finding.priority]}>{PRIORITY_LABELS[plan.finding.priority]}</Badge>
            {overdue && <Badge tone="danger">Vencido</Badge>}
          </span>
        }
        description={`${element.code} · ${element.elementType.name}`}
        back={{ href: "/action-plans", label: "Planes de acción" }}
      />

      <Card className="mb-6">
        <CardBody>
          <StatusStepper status={plan.status} />
        </CardBody>
      </Card>

      {plan.finding.source === "EXPIRY" && (
        <Alert tone="danger" className="mb-6" title="Plan generado automáticamente por vencimiento">
          Al reportar la solución deberás registrar la nueva fecha de vencimiento del elemento.
        </Alert>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardHeader title="Qué hay que hacer" />
            <CardBody className="space-y-4 text-sm">
              <p className="text-base font-medium">{plan.action}</p>
              <dl className="grid gap-3 sm:grid-cols-2">
                <div>
                  <dt className="text-subtle">Responsable</dt>
                  <dd className="font-medium">{plan.responsible.name}</dd>
                </div>
                <div>
                  <dt className="text-subtle">Fecha límite</dt>
                  <dd className={overdue ? "font-semibold text-danger" : "font-medium"}>{formatDate(plan.dueDate)}</dd>
                </div>
              </dl>
              <div className="rounded-lg bg-surface-muted p-3">
                <p className="flex items-center gap-1.5 font-semibold">
                  <AlertOctagon className="h-4 w-4 text-danger" aria-hidden />
                  <Link href={`/findings/${plan.finding.id}`} className="hover:underline">
                    Hallazgo {formatNumber(plan.finding.number)}
                  </Link>
                </p>
                <p className="mt-1">{plan.finding.description}</p>
                <p className="mt-2 flex items-start gap-1 text-subtle">
                  <MapPin className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                  <span>
                    <Link href={`/inventory/${element.id}`} className="font-medium text-primary hover:underline">
                      {element.code}
                    </Link>{" "}
                    · {element.site.name}
                    {element.zone && ` · ${element.zone.name}`}
                    {element.location && ` · ${element.location}`}
                  </span>
                </p>
                {plan.isExpiry && (
                  <div className="mt-2">
                    <ExpiryBadge expiresAt={element.expiresAt} label={element.expiryLabel} today={today} showValid />
                  </div>
                )}
                {plan.finding.inspection && (
                  <p className="mt-1 text-subtle">
                    Detectado en la{" "}
                    <Link href={`/inspections/${plan.finding.inspection.id}`} className="text-primary hover:underline">
                      inspección {formatNumber(plan.finding.inspection.number)}
                    </Link>
                  </p>
                )}
              </div>
              {plan.finding.evidences.length > 0 && (
                <PhotoUploader target={{ kind: "finding", findingId: plan.finding.id }} photos={plan.finding.evidences} label="Fotos del hallazgo" readOnly />
              )}
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Evidencias de la gestión" description="Fotos o PDF (facturas, actas, certificados de recarga…)." />
            <CardBody>
              {plan.evidences.length === 0 && !canEditEvidence ? (
                <p className="text-sm text-subtle">Sin evidencias.</p>
              ) : (
                <PhotoUploader
                  target={{ kind: "actionPlan", actionPlanId: plan.id }}
                  photos={plan.evidences}
                  label={canEditEvidence ? "Adjuntar evidencia" : "Evidencias"}
                  allowDocuments
                  readOnly={!canEditEvidence}
                />
              )}
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Historial" />
            <ol className="divide-y divide-border">
              {plan.events.map((e) => (
                <li key={e.id} className="px-4 py-3 text-sm sm:px-6">
                  <p className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{e.user?.name ?? "Sistema"}</span>
                    {e.toStatus && (
                      <Badge tone={WORKFLOW_STATUS_TONES[e.toStatus]}>
                        {e.fromStatus ? `${WORKFLOW_STATUS_LABELS[e.fromStatus]} → ` : ""}
                        {WORKFLOW_STATUS_LABELS[e.toStatus]}
                      </Badge>
                    )}
                    <span className="text-xs text-subtle">{formatDateTime(e.createdAt)}</span>
                  </p>
                  {e.comment && <p className="mt-1 whitespace-pre-line text-muted">{e.comment}</p>}
                </li>
              ))}
            </ol>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader title="Gestión" />
            <CardBody>
              <WorkflowPanel
                planId={plan.id}
                actions={actions}
                blockedReason={waitingMessage(plan.status, solverNote)}
                isExpiry={plan.isExpiry}
                expiryLabel={element.expiryLabel ?? "Vencimiento"}
                hasEvidence={plan.evidences.length > 0}
                canComment={plan.status !== "CLOSED" && (plan.responsibleId === user.id || isManager || user.permissions.has("actions.verify"))}
                today={today}
              />
            </CardBody>
          </Card>

          <Card>
            <CardBody className="space-y-2 text-sm">
              <p>
                <span className="text-subtle">Creado:</span> {formatDateTime(plan.createdAt)} · {plan.createdBy?.name ?? "Sistema"}
              </p>
              {plan.solvedAt && (
                <p>
                  <span className="text-subtle">Solucionado:</span> {formatDateTime(plan.solvedAt)} · {plan.solvedBy?.name}
                </p>
              )}
              {plan.verifiedAt && (
                <p>
                  <span className="text-subtle">Verificado:</span> {formatDateTime(plan.verifiedAt)} · {plan.verifiedBy?.name}
                </p>
              )}
              {plan.closedAt && (
                <p>
                  <span className="text-subtle">Cerrado:</span> {formatDateTime(plan.closedAt)} · {plan.closedBy?.name}
                </p>
              )}
            </CardBody>
          </Card>

          {users.length > 0 && (
            <Card>
              <CardHeader title="Reasignar o editar" />
              <CardBody>
                <PlanEditForm
                  mode="edit"
                  planId={plan.id}
                  users={users}
                  today={today}
                  defaults={{ action: plan.action, responsibleId: plan.responsibleId, dueDate: plan.dueDate.toISOString().slice(0, 10) }}
                />
              </CardBody>
            </Card>
          )}
        </div>
      </div>
    </>
  );
}

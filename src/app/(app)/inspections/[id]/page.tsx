import Link from "next/link";
import { AlertTriangle, CheckCircle2, FileText, XCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { InspectionRunner } from "@/components/inspections/inspection-runner";
import { formatAnswerValue, type AnswerValue } from "@/lib/inspection-rules";
import {
  INSPECTION_RESULT_LABELS,
  INSPECTION_STATUS_LABELS,
  PRIORITY_LABELS,
  PRIORITY_TONES,
  WORKFLOW_STATUS_LABELS,
  WORKFLOW_STATUS_TONES,
} from "@/lib/labels";
import { cn, formatDate, formatDateTime, formatNumber, todayISO } from "@/lib/utils";
import { env } from "@/lib/env";
import { requirePageUser } from "@/server/auth/current-user";
import { orNotFound } from "@/server/page-helpers";
import { getInspectionDetail, getInspectionForRunner } from "@/server/services/inspections.service";
import { listUserOptions } from "@/server/services/users.service";

export const metadata = { title: "Inspección" };

function EvidenceStrip({ evidences }: { evidences: { id: string; fileName: string }[] }) {
  if (!evidences.length) return null;
  return (
    <div className="mt-2 flex flex-wrap gap-2">
      {evidences.map((e) => (
        <a key={e.id} href={`/api/evidences/${e.id}`} target="_blank" rel="noopener" className="block h-20 w-20 overflow-hidden rounded-lg border border-border">
          {/* eslint-disable-next-line @next/next/no-img-element -- archivo privado servido con control de acceso */}
          <img src={`/api/evidences/${e.id}`} alt={e.fileName} className="h-full w-full object-cover" loading="lazy" />
        </a>
      ))}
    </div>
  );
}

export default async function InspectionPage({ params }: PageProps<"/inspections/[id]">) {
  const user = await requirePageUser();
  const { id } = await params;

  // 1) Inspección propia en curso → formulario de ejecución
  if (user.permissions.has("inspections.perform")) {
    const run = await getInspectionForRunner(id, user);
    if (run) {
      const users = await listUserOptions();
      const answers = Object.fromEntries(
        run.answers.map((a) => [
          a.questionId,
          {
            id: a.id,
            value: (a.value ?? null) as AnswerValue,
            isCompliant: a.isCompliant,
            comment: a.comment,
            evidences: a.evidences,
            findings: a.findings,
          },
        ]),
      );
      return (
        <InspectionRunner
          inspection={{
            id: run.id,
            number: run.number,
            notes: run.notes,
            element: {
              code: run.element.code,
              name: run.element.name,
              location: run.element.location,
              responsibleId: run.element.responsibleId,
              typeName: run.element.elementType.name,
              zoneName: run.element.zone?.name ?? null,
              siteName: run.element.site.name,
            },
          }}
          questions={run.questions}
          answers={answers}
          users={users}
          today={todayISO(new Date(), env.APP_TIMEZONE)}
        />
      );
    }
  }

  // 2) Consulta según alcance
  const inspection = await orNotFound(getInspectionDetail(id, user));
  const compliant = inspection.result === "COMPLIANT";
  const findingsByAnswer = new Map(inspection.findings.filter((f) => f.answerId).map((f) => [f.answerId!, f]));

  return (
    <>
      <PageHeader
        title={`Inspección ${formatNumber(inspection.number)}`}
        description={`${inspection.element.code} · ${inspection.element.elementType.name} · ${inspection.site.name}${inspection.element.zone ? ` · ${inspection.element.zone.name}` : ""}`}
        back={{ href: "/inspections", label: "Inspecciones" }}
        actions={
          inspection.status === "COMPLETED" && (
            <a
              href={`/api/reports/inspection/${inspection.id}`}
              className="inline-flex h-11 items-center gap-2 rounded-lg border border-border-strong bg-surface px-4 text-sm font-medium hover:bg-surface-muted"
            >
              <FileText className="h-4 w-4 text-danger" aria-hidden /> Informe PDF
            </a>
          )
        }
      />

      {inspection.status === "COMPLETED" ? (
        <Card className={cn("mb-6 border-2", compliant ? "border-green-300" : "border-red-300")}>
          <CardBody className="flex flex-col gap-4 sm:flex-row sm:items-center">
            <div className="flex min-w-0 flex-1 items-start gap-4">
              {compliant ? (
                <CheckCircle2 className="h-12 w-12 shrink-0 text-success" aria-hidden />
              ) : (
                <XCircle className="h-12 w-12 shrink-0 text-danger" aria-hidden />
              )}
              <div className="min-w-0 flex-1">
                <p className={cn("text-2xl font-bold", compliant ? "text-success" : "text-danger")}>
                  {INSPECTION_RESULT_LABELS[inspection.result!]}
                  {inspection.compliancePct !== null && ` · ${Number(inspection.compliancePct).toFixed(0)}%`}
                </p>
                <p className="text-sm text-muted">
                  {inspection.compliantCount} cumplen · {inspection.nonCompliantCount} no cumplen · {inspection.findings.length} hallazgo(s)
                </p>
                <p className="text-sm text-subtle">
                  {inspection.inspector.name} · {formatDateTime(inspection.completedAt)} · Próxima inspección del elemento:{" "}
                  {formatDate(inspection.element.nextInspectionAt)}
                </p>
              </div>
            </div>
            {inspection.element.zone && inspection.inspectorId === user.id && (
              <ButtonLink href={`/inspections/zones/${inspection.element.zone.id}`} variant="outline" className="w-full sm:w-auto">
                Volver a la zona
              </ButtonLink>
            )}
          </CardBody>
        </Card>
      ) : (
        <Badge tone={inspection.status === "CANCELLED" ? "neutral" : "info"} className="mb-4">
          {INSPECTION_STATUS_LABELS[inspection.status]} · {inspection.inspector.name} · {formatDateTime(inspection.startedAt)}
        </Badge>
      )}

      <Card className="mb-6">
        <CardHeader title="Respuestas" />
        <ol className="divide-y divide-border">
          {inspection.answers.map((a, i) => {
            const finding = findingsByAnswer.get(a.id);
            const q = { responseType: a.responseType, options: a.question.options, complianceRule: a.question.complianceRule };
            return (
              <li key={a.id} className="px-4 py-3 sm:px-6">
                <div className="flex items-start justify-between gap-3">
                  <p className="text-sm">
                    <span className="text-subtle">{i + 1}.</span> {a.questionText}
                  </p>
                  <span
                    className={cn(
                      "shrink-0 text-sm font-semibold",
                      a.isCompliant === false ? "text-danger" : a.isCompliant ? "text-success" : "text-foreground",
                    )}
                  >
                    {a.responseType === "PHOTO" ? `${a.evidences.length} foto(s)` : formatAnswerValue(q, a.value)}
                  </span>
                </div>
                {a.comment && <p className="mt-1 text-sm text-muted">Observación: {a.comment}</p>}
                <EvidenceStrip evidences={a.evidences} />
                {finding && (
                  <p className="mt-2 flex items-center gap-1.5 text-sm text-danger">
                    <AlertTriangle className="h-4 w-4" aria-hidden /> Hallazgo {formatNumber(finding.number)}
                  </p>
                )}
              </li>
            );
          })}
        </ol>
        {inspection.notes && (
          <CardBody className="border-t border-border text-sm">
            <p className="font-medium">Observaciones generales</p>
            <p className="mt-1 whitespace-pre-line text-muted">{inspection.notes}</p>
          </CardBody>
        )}
      </Card>

      {inspection.findings.length > 0 && (
        <Card>
          <CardHeader title="Hallazgos" />
          <ul className="divide-y divide-border">
            {inspection.findings.map((f) => (
              <li key={f.id} className="px-4 py-3 sm:px-6">
                <div className="flex flex-wrap items-center gap-2">
                  <Link href={`/findings/${f.id}`} className="font-semibold text-primary hover:underline">
                    {formatNumber(f.number)}
                  </Link>
                  <Badge tone={PRIORITY_TONES[f.priority]}>{PRIORITY_LABELS[f.priority]}</Badge>
                  <Badge tone={WORKFLOW_STATUS_TONES[f.status]}>{WORKFLOW_STATUS_LABELS[f.status]}</Badge>
                </div>
                <p className="mt-1 text-sm">{f.description}</p>
                {f.requiredAction && <p className="text-sm text-muted">Acción: {f.requiredAction}</p>}
                <p className="text-xs text-subtle">
                  Responsable: {f.responsible?.name ?? "—"} · Límite: {formatDate(f.dueDate)}
                </p>
                <EvidenceStrip evidences={f.evidences} />
              </li>
            ))}
          </ul>
        </Card>
      )}

      <p className="mt-6 text-center text-sm">
        <Link href={`/inventory/${inspection.element.id}`} className="text-primary hover:underline">
          Ver ficha del elemento {inspection.element.code}
        </Link>
      </p>
    </>
  );
}

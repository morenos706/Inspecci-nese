import Link from "next/link";
import { ClipboardCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { Pagination } from "@/components/ui/pagination";
import { PRIORITY_LABELS, PRIORITY_TONES } from "@/lib/labels";
import { formatDateTime, formatNumber } from "@/lib/utils";
import { requirePagePermission } from "@/server/auth/current-user";
import { listPendingReview, reviewQuerySchema } from "@/server/services/action-plans.service";
import type { Priority } from "@/generated/prisma/enums";

export const metadata = { title: "Revisión de inspecciones" };

const ORDER: Priority[] = ["CRITICAL", "HIGH", "MEDIUM", "LOW"];

export default async function ReviewPage({ searchParams }: PageProps<"/review">) {
  const user = await requirePagePermission("actions.manage");
  const query = reviewQuerySchema.parse(await searchParams);
  const result = await listPendingReview(query, user);

  return (
    <>
      <PageHeader
        title="Revisión de inspecciones"
        description="Inspecciones con hallazgos. Abre cada una y asigna la acción de mejora, el responsable y la fecha límite. Las que cumplen al 100 % se archivan solas."
      />
      <Card>
        {result.items.length === 0 ? (
          <EmptyState icon={ClipboardCheck} title="No hay inspecciones por revisar" description="Cuando un brigadista finalice una inspección con hallazgos, aparecerá aquí." />
        ) : (
          <ul className="divide-y divide-border">
            {result.items.map((i) => {
              const counts = ORDER.map((p) => [p, i.findings.filter((f) => f.priority === p).length] as const).filter(([, n]) => n > 0);
              return (
                <li key={i.id}>
                  <Link href={`/inspections/${i.id}`} className="flex flex-col gap-2 px-4 py-4 hover:bg-surface-muted sm:flex-row sm:items-center sm:px-6">
                    <span className="min-w-0 flex-1">
                      <span className="block font-semibold text-foreground">
                        {i.element.code} · {i.element.name}
                      </span>
                      <span className="block text-sm text-muted">
                        Inspección {formatNumber(i.number)} · {i.site.name}
                        {i.element.zone ? ` · ${i.element.zone.name}` : ""} · {i.process.name}
                      </span>
                      <span className="block text-xs text-subtle">
                        {i.inspector.name} · {formatDateTime(i.completedAt)}
                        {i.compliancePct !== null && ` · ${Number(i.compliancePct).toFixed(0)} % de cumplimiento`}
                      </span>
                    </span>
                    <span className="flex flex-wrap gap-1">
                      {counts.map(([p, n]) => (
                        <Badge key={p} tone={PRIORITY_TONES[p]}>
                          {n} {PRIORITY_LABELS[p].toLowerCase()}
                        </Badge>
                      ))}
                      {counts.length === 0 && <Badge tone="warning">Por cerrar</Badge>}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
        {result.total > 0 && (
          <Pagination page={result.page} pageCount={result.pageCount} total={result.total} basePath="/review" searchParams={{}} />
        )}
      </Card>
    </>
  );
}

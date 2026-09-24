import { Check } from "lucide-react";
import type { WorkflowStatus } from "@/generated/prisma/enums";
import { WORKFLOW_STATUS_LABELS } from "@/lib/labels";
import { cn } from "@/lib/utils";

const STEPS: WorkflowStatus[] = ["PENDING", "IN_PROGRESS", "SOLVED", "VERIFIED", "CLOSED"];

/** Pendiente → En proceso → Solucionado → Verificado → Cerrado */
export function StatusStepper({ status }: { status: WorkflowStatus }) {
  const current = STEPS.indexOf(status);
  return (
    <ol className="flex items-center gap-1 overflow-x-auto" aria-label={`Estado: ${WORKFLOW_STATUS_LABELS[status]}`}>
      {STEPS.map((step, i) => {
        const done = i < current || status === "CLOSED";
        const active = i === current;
        return (
          <li key={step} className="flex min-w-0 flex-1 items-center gap-1">
            <span
              className={cn(
                "flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold",
                done && "bg-success text-white",
                active && !done && "bg-primary text-white ring-4 ring-primary-soft",
                !done && !active && "bg-surface-muted text-subtle",
              )}
              aria-current={active ? "step" : undefined}
            >
              {done ? <Check className="h-4 w-4" aria-hidden /> : i + 1}
            </span>
            <span className={cn("hidden truncate text-xs sm:block", active ? "font-semibold" : "text-subtle")}>
              {WORKFLOW_STATUS_LABELS[step]}
            </span>
            {i < STEPS.length - 1 && <span className="h-0.5 min-w-2 flex-1 bg-border" aria-hidden />}
          </li>
        );
      })}
    </ol>
  );
}

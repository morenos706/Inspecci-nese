import type { ElementStatus, InspectionFrequency } from "@/generated/prisma/enums";
import { SCHEDULE_STATUS_LABELS, scheduleStatus } from "@/lib/scheduling";
import { Badge, type BadgeTone } from "@/components/ui/badge";

const TONES = { ON_TIME: "success", DUE_SOON: "warning", OVERDUE: "danger", UNSCHEDULED: "neutral" } as const satisfies Record<
  string,
  BadgeTone
>;
const DOTS = { ON_TIME: "bg-success", DUE_SOON: "bg-amber-500", OVERDUE: "bg-danger", UNSCHEDULED: "bg-slate-400" };

/** 🟢 Al día · 🟡 Próxima a vencer · 🔴 Vencida (solo elementos activos). */
export function ScheduleBadge({
  next,
  frequency,
  frequencyDays,
  elementStatus = "ACTIVE",
}: {
  next: Date | null;
  frequency: InspectionFrequency;
  frequencyDays?: number | null;
  elementStatus?: ElementStatus;
}) {
  if (elementStatus !== "ACTIVE") return <span className="text-subtle">—</span>;
  const status = scheduleStatus(next, frequency, new Date(), frequencyDays);
  return (
    <Badge tone={TONES[status]}>
      <span className={`h-1.5 w-1.5 rounded-full ${DOTS[status]}`} aria-hidden />
      {SCHEDULE_STATUS_LABELS[status]}
    </Badge>
  );
}

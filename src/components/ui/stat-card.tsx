import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

const tones = {
  primary: "bg-primary-soft text-primary",
  success: "bg-success-soft text-success",
  warning: "bg-warning-soft text-warning",
  danger: "bg-danger-soft text-danger",
  neutral: "bg-slate-100 text-slate-700",
} as const;

export function StatCard({
  label,
  value,
  icon: Icon,
  tone = "primary",
  href,
  hint,
}: {
  label: string;
  value: number | string;
  icon: LucideIcon;
  tone?: keyof typeof tones;
  href?: string;
  hint?: string;
}) {
  const body = (
    <div className="flex items-center gap-4 rounded-xl border border-border bg-surface p-4 shadow-sm transition-colors hover:border-border-strong">
      <span className={cn("flex h-11 w-11 shrink-0 items-center justify-center rounded-lg", tones[tone])}>
        <Icon className="h-5 w-5" aria-hidden />
      </span>
      <div className="min-w-0">
        <p className="text-2xl font-semibold leading-tight tabular-nums">{value}</p>
        <p className="text-sm leading-snug text-subtle">{label}</p>
        {hint && <p className="text-xs leading-snug text-subtle">{hint}</p>}
      </div>
    </div>
  );
  return href ? (
    <Link href={href} className="block rounded-xl">
      {body}
    </Link>
  ) : (
    body
  );
}

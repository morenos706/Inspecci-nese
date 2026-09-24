import { AlertOctagon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { expiryStatus } from "@/lib/expiry";
import { formatDate } from "@/lib/utils";

/** 🔴 Vencido (alerta crítica) · 🟡 Por vencer (30 días) · Vigente. */
export function ExpiryBadge({
  expiresAt,
  label,
  today,
  showValid = false,
}: {
  expiresAt: Date | null;
  label: string | null;
  today: string;
  showValid?: boolean;
}) {
  const status = expiryStatus(expiresAt, today);
  const concept = label ?? "Vencimiento";
  if (status === "NONE" || (status === "VALID" && !showValid)) return null;
  if (status === "EXPIRED") {
    return (
      <Badge tone="danger" className="font-semibold">
        <AlertOctagon className="h-3.5 w-3.5" aria-hidden />
        Vencido: {concept} · {formatDate(expiresAt)}
      </Badge>
    );
  }
  return (
    <Badge tone={status === "EXPIRING" ? "warning" : "success"}>
      {status === "EXPIRING" ? "Por vencer" : "Vigente"}: {concept} · {formatDate(expiresAt)}
    </Badge>
  );
}

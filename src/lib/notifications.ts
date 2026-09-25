/**
 * Reglas puras de notificaciones (sin base de datos): tiempos de recordatorio,
 * reintentos de correo y presentación. Probadas en tests/unit.
 */

/** Días de anticipación para recordar que un plan de acción está por vencer. */
export const PLAN_DUE_SOON_DAYS = 3;

/** Hora local a partir de la cual se envía el resumen diario de inspecciones. */
export const DIGEST_HOUR = 6;

/** Intentos de envío de un correo antes de marcarlo como fallido. */
export const EMAIL_MAX_ATTEMPTS = 5;

/** Correos pendientes con más antigüedad ya no se envían (llegarían tarde). */
export const EMAIL_MAX_AGE_HOURS = 72;

/** Espera antes del intento `attempts + 1`: 0, 2, 4, 8, 16 minutos. */
export function retryDelayMinutes(attempts: number): number {
  return attempts <= 0 ? 0 : 2 ** attempts;
}

/** ¿Una entrega con `attempts` intentos, el último en `lastTry`, puede reintentarse ya? */
export function canRetry(attempts: number, lastTry: Date, now: Date): boolean {
  if (attempts >= EMAIL_MAX_ATTEMPTS) return false;
  return now.getTime() - lastTry.getTime() >= retryDelayMinutes(attempts) * 60_000;
}

export type NotificationTone = "danger" | "warning" | "primary" | "success" | "neutral";

/** Tono visual por tipo (prefijo antes del punto o tipo completo). */
export function notificationTone(type: string, title = ""): NotificationTone {
  if (/cr[ií]tic/i.test(title)) return "danger";
  switch (type) {
    case "action_plan.overdue":
    case "finding.critical":
    case "inspections.overdue":
      return "danger";
    case "action_plan.due_soon":
    case "element.expiry_soon":
    case "action_plan.rejected":
    case "inspection.review":
      return "warning";
    case "action_plan.verified":
    case "action_plan.closed":
    case "inspection.reviewed":
      return "success";
    case "action_plan.assigned":
    case "action_plan.solved":
    case "inspections.digest":
      return "primary";
    default:
      return "neutral";
  }
}

/** Solo rutas internas relativas: evita redirecciones abiertas desde un enlace guardado. */
export function safeInternalLink(link: string | null | undefined): string {
  if (!link || !link.startsWith("/") || link.startsWith("//") || link.includes("\\")) return "/notifications";
  return link;
}

/** Texto relativo corto: "hace 5 min", "hace 3 h", "hace 2 d". */
export function timeAgo(date: Date, now: Date = new Date()): string {
  const minutes = Math.max(0, Math.floor((now.getTime() - date.getTime()) / 60_000));
  if (minutes < 1) return "ahora";
  if (minutes < 60) return `hace ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `hace ${hours} h`;
  const days = Math.floor(hours / 24);
  return days < 30 ? `hace ${days} d` : `hace ${Math.floor(days / 30)} mes${days >= 60 ? "es" : ""}`;
}

/**
 * Lógica ÚNICA de programación de inspecciones. Toda pantalla, servicio,
 * job de recordatorios o reporte debe usar estas funciones para evitar
 * cálculos inconsistentes de "próxima inspección" y estados de vencimiento.
 *
 * Código puro (sin BD) → fácil de probar y reutilizable en cliente/servidor.
 */

export const FREQUENCIES = [
  "DAILY",
  "WEEKLY",
  "BIWEEKLY",
  "MONTHLY",
  "BIMONTHLY",
  "QUARTERLY",
  "SEMIANNUAL",
  "ANNUAL",
  "CUSTOM",
] as const;

export type Frequency = (typeof FREQUENCIES)[number];

export const FREQUENCY_LABELS: Record<Frequency, string> = {
  DAILY: "Diaria",
  WEEKLY: "Semanal",
  BIWEEKLY: "Quincenal",
  MONTHLY: "Mensual",
  BIMONTHLY: "Bimestral",
  QUARTERLY: "Trimestral",
  SEMIANNUAL: "Semestral",
  ANNUAL: "Anual",
  CUSTOM: "Personalizada",
};

const DAY_MS = 86_400_000;

type Interval = { days: number } | { months: number };

function intervalFor(frequency: Frequency, customDays?: number | null): Interval {
  switch (frequency) {
    case "DAILY":
      return { days: 1 };
    case "WEEKLY":
      return { days: 7 };
    case "BIWEEKLY":
      return { days: 15 };
    case "MONTHLY":
      return { months: 1 };
    case "BIMONTHLY":
      return { months: 2 };
    case "QUARTERLY":
      return { months: 3 };
    case "SEMIANNUAL":
      return { months: 6 };
    case "ANNUAL":
      return { months: 12 };
    case "CUSTOM":
      if (!customDays || customDays < 1) throw new Error("La frecuencia personalizada requiere un número de días ≥ 1");
      return { days: customDays };
  }
}

/** Suma meses conservando el día; si el mes destino es más corto, usa su último día (31/01 + 1 mes = 28/02). */
function addMonths(date: Date, months: number): Date {
  const result = new Date(date.getTime());
  const day = result.getUTCDate();
  result.setUTCDate(1);
  result.setUTCMonth(result.getUTCMonth() + months);
  const lastDay = new Date(Date.UTC(result.getUTCFullYear(), result.getUTCMonth() + 1, 0)).getUTCDate();
  result.setUTCDate(Math.min(day, lastDay));
  return result;
}

/** Próxima inspección = última inspección + frecuencia. */
export function computeNextInspection(lastInspection: Date, frequency: Frequency, customDays?: number | null): Date {
  const interval = intervalFor(frequency, customDays);
  return "days" in interval
    ? new Date(lastInspection.getTime() + interval.days * DAY_MS)
    : addMonths(lastInspection, interval.months);
}

/** Días de anticipación con los que una inspección pasa a "próxima a vencer". */
export function dueSoonWindowDays(frequency: Frequency, customDays?: number | null): number {
  switch (frequency) {
    case "DAILY":
      return 0;
    case "WEEKLY":
      return 1;
    case "BIWEEKLY":
      return 3;
    case "CUSTOM":
      return Math.max(0, Math.min(7, Math.floor((customDays ?? 0) / 4)));
    default:
      return 7;
  }
}

export type ScheduleStatus = "ON_TIME" | "DUE_SOON" | "OVERDUE" | "UNSCHEDULED";

export const SCHEDULE_STATUS_LABELS: Record<ScheduleStatus, string> = {
  ON_TIME: "Al día",
  DUE_SOON: "Próxima a vencer",
  OVERDUE: "Vencida",
  UNSCHEDULED: "Sin programar",
};

/**
 * Estado de programación:
 *  🟢 ON_TIME   → falta más que la ventana de aviso
 *  🟡 DUE_SOON  → vence dentro de la ventana de aviso (o hoy)
 *  🔴 OVERDUE   → la fecha ya pasó
 */
export function scheduleStatus(
  nextInspection: Date | null | undefined,
  frequency: Frequency,
  now: Date = new Date(),
  customDays?: number | null,
): ScheduleStatus {
  if (!nextInspection) return "UNSCHEDULED";
  const diffMs = nextInspection.getTime() - now.getTime();
  if (diffMs < 0) return "OVERDUE";
  const windowMs = Math.max(dueSoonWindowDays(frequency, customDays), 1) * DAY_MS;
  return diffMs <= windowMs ? "DUE_SOON" : "ON_TIME";
}

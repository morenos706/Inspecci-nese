/**
 * Fórmulas de indicadores (código puro, probado). Documentadas aquí para que
 * dashboard, reportes y exportaciones calculen exactamente lo mismo.
 */
import { todayISO } from "@/lib/utils";

/**
 * Cumplimiento del programa de inspecciones:
 *   realizadas / (realizadas + pendientes + vencidas)
 * Ej.: 180 realizadas, 15 pendientes, 5 vencidas → 90 %.
 * Pendientes = elementos activos "próximos a vencer"; vencidas = elementos
 * activos con la inspección vencida (estado actual).
 */
export function programCompliance(done: number, pending: number, overdue: number): number | null {
  const total = done + pending + overdue;
  return total === 0 ? null : Math.round((done / total) * 1000) / 10;
}

/** Porcentaje con un decimal (null si no hay base). */
export function pct(part: number, total: number): number | null {
  return total === 0 ? null : Math.round((part / total) * 1000) / 10;
}

export function average(values: number[]): number | null {
  if (values.length === 0) return null;
  return Math.round((values.reduce((a, b) => a + b, 0) / values.length) * 10) / 10;
}

/** "YYYY-MM" del instante en la zona horaria de la app. */
export function monthKey(date: Date, timeZone?: string): string {
  return todayISO(date, timeZone).slice(0, 7);
}

/** Meses "YYYY-MM" entre dos fechas "YYYY-MM-DD" (inclusive), máximo `limit` (los más recientes). */
export function monthsBetween(fromISO: string, toISO: string, limit = 24): string[] {
  const months: string[] = [];
  let [y, m] = fromISO.slice(0, 7).split("-").map(Number) as [number, number];
  const end = toISO.slice(0, 7);
  while (`${y}-${String(m).padStart(2, "0")}` <= end) {
    months.push(`${y}-${String(m).padStart(2, "0")}`);
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
  }
  return months.slice(-limit);
}

const MONTHS_ES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

/** "2026-09" → "sep 26" */
export function monthLabel(key: string): string {
  const [y, m] = key.split("-");
  return `${MONTHS_ES[Number(m) - 1]} ${y!.slice(2)}`;
}

export function countBy<T>(rows: T[], key: (row: T) => string | null | undefined): Map<string, number> {
  const out = new Map<string, number>();
  for (const row of rows) {
    const k = key(row);
    if (k == null) continue;
    out.set(k, (out.get(k) ?? 0) + 1);
  }
  return out;
}

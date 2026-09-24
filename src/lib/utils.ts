import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export const APP_TIMEZONE = process.env.NEXT_PUBLIC_APP_TIMEZONE ?? "America/Bogota";
const LOCALE = "es-CO";

export function formatDate(value: Date | string | null | undefined): string {
  if (!value) return "—";
  return new Intl.DateTimeFormat(LOCALE, {
    timeZone: APP_TIMEZONE,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date(value));
}

export function formatDateTime(value: Date | string | null | undefined): string {
  if (!value) return "—";
  return new Intl.DateTimeFormat(LOCALE, {
    timeZone: APP_TIMEZONE,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

/** #000125 */
export function formatNumber(n: number, digits = 6): string {
  return `#${String(n).padStart(digits, "0")}`;
}

export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join("");
}

/** Fecha local de hoy "YYYY-MM-DD" en la zona horaria de la aplicación. */
export function todayISO(now: Date = new Date(), timeZone: string = APP_TIMEZONE): string {
  // en-CA produce formato YYYY-MM-DD
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

/** Suma días a una fecha "YYYY-MM-DD" y devuelve "YYYY-MM-DD". */
export function addDaysISO(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Minutos de desfase de una zona horaria respecto a UTC en un instante dado. */
function timezoneOffsetMinutes(date: Date, timeZone: string): number {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    })
      .formatToParts(date)
      .map((p) => [p.type, p.value]),
  );
  const asUtc = Date.UTC(+parts.year!, +parts.month! - 1, +parts.day!, +parts.hour!, +parts.minute!, +parts.second!);
  return Math.round((asUtc - date.getTime()) / 60_000);
}

/** Inicio (00:00) o fin (23:59:59.999) del día local "YYYY-MM-DD" en la zona horaria de la app, como instante UTC. */
export function zonedDayBoundary(isoDate: string, edge: "start" | "end", timeZone: string = APP_TIMEZONE): Date {
  const naive = new Date(`${isoDate}T${edge === "start" ? "00:00:00.000" : "23:59:59.999"}Z`);
  return new Date(naive.getTime() - timezoneOffsetMinutes(naive, timeZone) * 60_000);
}

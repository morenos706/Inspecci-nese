/**
 * Vencimientos de elementos (recarga de extintores, caducidad de insumos…).
 * Lógica ÚNICA para pantallas, filtros SQL, dashboard y alertas.
 *
 * Las fechas de vencimiento se guardan como día calendario a las 12:00 UTC
 * (`expiryDateFromISO`), así la comparación por día es estable en cualquier
 * zona horaria de América.
 */
import { addDaysISO } from "@/lib/utils";

/** Días de anticipación para "por vencer". */
export const EXPIRY_WARNING_DAYS = 30;

export type ExpiryStatus = "EXPIRED" | "EXPIRING" | "VALID" | "NONE";

export const EXPIRY_STATUS_LABELS: Record<Exclude<ExpiryStatus, "NONE">, string> = {
  EXPIRED: "Vencido",
  EXPIRING: "Por vencer",
  VALID: "Vigente",
};

export function expiryDateFromISO(iso: string): Date {
  return new Date(`${iso}T12:00:00.000Z`);
}

export function expiryISO(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** `today` = fecha local "YYYY-MM-DD" (todayISO con la zona horaria de la app). */
export function expiryStatus(expiresAt: Date | null | undefined, today: string): ExpiryStatus {
  if (!expiresAt) return "NONE";
  const day = expiryISO(expiresAt);
  if (day < today) return "EXPIRED";
  if (day <= addDaysISO(today, EXPIRY_WARNING_DAYS)) return "EXPIRING";
  return "VALID";
}

/** Rangos equivalentes a expiryStatus para consultas (expiresAt guardado a las 12:00 UTC). */
export function expiryRange(status: "EXPIRED" | "EXPIRING", today: string): { lt?: Date; gte?: Date; lte?: Date } {
  const todayNoon = expiryDateFromISO(today);
  return status === "EXPIRED"
    ? { lt: todayNoon }
    : { gte: todayNoon, lte: expiryDateFromISO(addDaysISO(today, EXPIRY_WARNING_DAYS)) };
}

/**
 * Concepto corto del vencimiento a partir del texto de la pregunta:
 * "Fecha de vencimiento de la recarga" → "Recarga".
 */
export function expiryLabelFromQuestion(text: string): string {
  const core = text
    .replace(/[¿?]/g, "")
    .trim()
    .replace(/^(fecha\s+de\s+)?(vencimiento|caducidad|expiraci[oó]n)(\s+(del|de)\b)?(\s+(las|los|la|el)\b)?\s*/i, "")
    .trim();
  const label = core || "Vencimiento";
  return (label.charAt(0).toUpperCase() + label.slice(1)).slice(0, 80);
}

import "server-only";
import { generateExpiryFindings } from "@/server/services/expiry-automation.service";
import { dispatchPendingEmails } from "@/server/services/notifications.service";
import { generateReminders } from "@/server/services/reminders.service";

/**
 * Tareas programadas del sistema. Son idempotentes: se pueden ejecutar desde
 * el programador interno, desde un cron externo o manualmente sin duplicar.
 */
export async function runScheduledJobs() {
  const started = Date.now();
  const expiry = await generateExpiryFindings();
  const reminders = await generateReminders();
  const emails = await dispatchPendingEmails();
  return { expiry, reminders, emails, ms: Date.now() - started };
}

/** Envío frecuente de correos pendientes (cada minuto en el programador interno). */
export async function runEmailDispatch() {
  return dispatchPendingEmails();
}

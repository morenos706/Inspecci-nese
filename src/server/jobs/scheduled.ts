import "server-only";
import { generateExpiryFindings } from "@/server/services/expiry-automation.service";

/**
 * Tareas programadas del sistema. Son idempotentes: se pueden ejecutar desde
 * el programador interno, desde un cron externo o manualmente sin duplicar.
 * La Fase 7 agrega aquí recordatorios y el envío de correos pendientes.
 */
export async function runScheduledJobs() {
  const started = Date.now();
  const expiry = await generateExpiryFindings();
  return { expiry, ms: Date.now() - started };
}

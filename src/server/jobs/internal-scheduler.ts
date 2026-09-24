import "server-only";
import { runEmailDispatch, runScheduledJobs } from "@/server/jobs/scheduled";

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const globalScheduler = globalThis as unknown as { __schedulerStarted?: boolean };

/**
 * Programador interno (instancia única):
 *  - cada hora: vencimientos, recordatorios y resumen diario;
 *  - cada minuto: envío de correos pendientes.
 * Con varias réplicas también es seguro (tareas idempotentes y envíos
 * reclamados atómicamente); en ese caso conviene desactivarlo
 * (INTERNAL_SCHEDULER=false) y usar un cron externo contra /api/cron/run.
 */
export function startInternalScheduler() {
  if (globalScheduler.__schedulerStarted) return;
  globalScheduler.__schedulerStarted = true;

  let running = false;
  const run = async () => {
    if (running) return;
    running = true;
    try {
      const result = await runScheduledJobs();
      if (result.expiry.created > 0) {
        console.info(`[scheduler] Vencimientos: ${result.expiry.created} hallazgo(s) crítico(s) creado(s)`);
      }
      const r = result.reminders;
      const total = r.planDueSoon + r.planOverdue + r.expirySoon + r.digests;
      if (total > 0) console.info(`[scheduler] Recordatorios enviados: ${total}`);
    } catch (error) {
      console.error("[scheduler] Error ejecutando tareas programadas:", error);
    } finally {
      running = false;
    }
  };

  let mailing = false;
  const mail = async () => {
    if (mailing || running) return;
    mailing = true;
    try {
      await runEmailDispatch();
    } catch (error) {
      console.error("[scheduler] Error enviando correos:", error);
    } finally {
      mailing = false;
    }
  };

  setTimeout(run, 15_000).unref?.();
  setInterval(run, HOUR).unref?.();
  setInterval(mail, MINUTE).unref?.();
}

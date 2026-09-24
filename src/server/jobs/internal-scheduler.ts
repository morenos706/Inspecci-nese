import "server-only";
import { runScheduledJobs } from "@/server/jobs/scheduled";

const HOUR = 60 * 60 * 1000;
const globalScheduler = globalThis as unknown as { __schedulerStarted?: boolean };

/**
 * Programador interno (instancia única): ejecuta las tareas al arrancar y
 * cada hora. Con varias réplicas también es seguro (tareas idempotentes);
 * en ese caso conviene desactivarlo (INTERNAL_SCHEDULER=false) y usar un cron
 * externo contra /api/cron/run.
 */
export function startInternalScheduler() {
  if (globalScheduler.__schedulerStarted) return;
  globalScheduler.__schedulerStarted = true;

  const run = async () => {
    try {
      const result = await runScheduledJobs();
      if (result.expiry.created > 0) {
        console.info(`[scheduler] Vencimientos: ${result.expiry.created} hallazgo(s) crítico(s) creado(s)`);
      }
    } catch (error) {
      console.error("[scheduler] Error ejecutando tareas programadas:", error);
    }
  };
  setTimeout(run, 15_000).unref?.();
  setInterval(run, HOUR).unref?.();
}

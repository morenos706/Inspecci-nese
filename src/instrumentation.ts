/**
 * Se ejecuta una vez al iniciar el servidor de Next.js. Arranca el
 * programador interno de tareas (vencimientos → hallazgos automáticos).
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (process.env.INTERNAL_SCHEDULER === "false") return;
  // Durante `next build` no se programan tareas.
  if (process.env.NEXT_PHASE === "phase-production-build") return;
  const { startInternalScheduler } = await import("@/server/jobs/internal-scheduler");
  startInternalScheduler();
}

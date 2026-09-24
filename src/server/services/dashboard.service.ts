import "server-only";
import { db } from "@/server/db";

/**
 * Resumen de la Fase 1 (datos maestros). En la Fase 5 este servicio crece con
 * los indicadores de inspecciones, hallazgos y planes de acción.
 */
export async function getFoundationSummary() {
  const [users, processes, sites, zones, roles] = await db.$transaction([
    db.user.count({ where: { deletedAt: null, active: true } }),
    db.process.count({ where: { deletedAt: null, active: true } }),
    db.site.count({ where: { deletedAt: null, active: true } }),
    db.zone.count({ where: { deletedAt: null, active: true } }),
    db.role.count({ where: { active: true } }),
  ]);
  return { users, processes, sites, zones, roles };
}

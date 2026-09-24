import "server-only";
import { db } from "@/server/db";
import type { Prisma } from "@/generated/prisma/client";

type Tx = Prisma.TransactionClient | typeof db;

/**
 * Responsable para un plan generado automáticamente:
 *  1. el responsable del elemento (si está activo);
 *  2. un usuario que gestiona planes (actions.manage) en el proceso del elemento;
 *  3. cualquier usuario activo que gestione planes (p.ej. administrador).
 */
export async function resolveResponsibleFor(
  element: { responsibleId: string | null; processId: string },
  tx: Tx = db,
): Promise<string | null> {
  if (element.responsibleId) {
    const ok = await tx.user.findFirst({
      where: { id: element.responsibleId, active: true, deletedAt: null },
      select: { id: true },
    });
    if (ok) return ok.id;
  }
  const manages: Prisma.UserWhereInput = {
    active: true,
    deletedAt: null,
    roles: { some: { role: { active: true, permissions: { some: { permission: { code: "actions.manage" } } } } } },
  };
  const inProcess = await tx.user.findFirst({
    where: { ...manages, processes: { some: { processId: element.processId } } },
    orderBy: { name: "asc" },
    select: { id: true },
  });
  if (inProcess) return inProcess.id;
  const anyManager = await tx.user.findFirst({ where: manages, orderBy: { name: "asc" }, select: { id: true } });
  return anyManager?.id ?? null;
}

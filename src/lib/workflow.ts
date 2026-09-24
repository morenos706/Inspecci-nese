/**
 * Flujo de planes de acción y hallazgos (código puro).
 *
 *   PENDIENTE → EN PROCESO → SOLUCIONADO → VERIFICADO → CERRADO
 *                    ↑______________| (verificación rechazada)
 *
 * Reglas:
 *  - Iniciar / solucionar: el responsable del plan (actions.update) o quien
 *    gestiona planes en su alcance (actions.manage).
 *  - Solucionar exige comentario y al menos una evidencia.
 *  - Verificar o rechazar: permiso actions.verify y NO haber solucionado el
 *    plan (segregación de funciones). Rechazar exige comentario.
 *  - Cerrar: permiso actions.close, solo planes verificados.
 *  - El hallazgo no se cambia a mano: su estado se deriva de sus planes.
 */
import type { WorkflowStatus } from "@/generated/prisma/enums";

export type WorkflowAction = "start" | "solve" | "verify" | "reject" | "close";

export const WORKFLOW_ACTIONS: Record<
  WorkflowAction,
  { from: readonly WorkflowStatus[]; to: WorkflowStatus; label: string; requiresComment: boolean }
> = {
  start: { from: ["PENDING"], to: "IN_PROGRESS", label: "Iniciar gestión", requiresComment: false },
  solve: { from: ["PENDING", "IN_PROGRESS"], to: "SOLVED", label: "Marcar como solucionado", requiresComment: true },
  verify: { from: ["SOLVED"], to: "VERIFIED", label: "Verificar solución", requiresComment: false },
  reject: { from: ["SOLVED"], to: "IN_PROGRESS", label: "Rechazar (devolver)", requiresComment: true },
  close: { from: ["VERIFIED"], to: "CLOSED", label: "Cerrar", requiresComment: false },
};

export interface WorkflowActor {
  userId: string;
  permissions: ReadonlySet<string>;
  /** El usuario gestiona planes dentro de su alcance (actions.manage + alcance). */
  managesInScope: boolean;
}

export interface WorkflowPlan {
  status: WorkflowStatus;
  responsibleId: string;
  solvedById: string | null;
}

export type Denial = { allowed: false; reason: string } | { allowed: true };

export function canPerform(action: WorkflowAction, plan: WorkflowPlan, actor: WorkflowActor): Denial {
  const def = WORKFLOW_ACTIONS[action];
  if (!def.from.includes(plan.status)) return { allowed: false, reason: "La acción no aplica al estado actual del plan." };
  const isResponsible = plan.responsibleId === actor.userId && actor.permissions.has("actions.update");

  switch (action) {
    case "start":
    case "solve":
      return isResponsible || actor.managesInScope
        ? { allowed: true }
        : { allowed: false, reason: "Solo el responsable del plan puede actualizarlo." };
    case "verify":
    case "reject":
      if (!actor.permissions.has("actions.verify")) return { allowed: false, reason: "No tienes permiso para verificar." };
      if (plan.solvedById === actor.userId) {
        return { allowed: false, reason: "Quien solucionó el plan no puede verificarlo." };
      }
      return { allowed: true };
    case "close":
      return actor.permissions.has("actions.close")
        ? { allowed: true }
        : { allowed: false, reason: "No tienes permiso para cerrar planes." };
  }
}

export function availableActions(plan: WorkflowPlan, actor: WorkflowActor): WorkflowAction[] {
  return (Object.keys(WORKFLOW_ACTIONS) as WorkflowAction[]).filter((a) => canPerform(a, plan, actor).allowed);
}

const ORDER: WorkflowStatus[] = ["PENDING", "IN_PROGRESS", "SOLVED", "VERIFIED", "CLOSED"];

/**
 * Estado del hallazgo según sus planes: avanza al estado "más atrasado" de
 * todos (se cierra solo cuando todos los planes están cerrados). Si algún plan
 * está en proceso (o hay mezcla), el hallazgo está en proceso.
 */
export function deriveFindingStatus(planStatuses: WorkflowStatus[]): WorkflowStatus {
  if (planStatuses.length === 0) return "PENDING";
  const min = Math.min(...planStatuses.map((s) => ORDER.indexOf(s)));
  const max = Math.max(...planStatuses.map((s) => ORDER.indexOf(s)));
  if (min === 0 && max > 0) return "IN_PROGRESS";
  return ORDER[min]!;
}

/** Plan vencido: pasó la fecha límite y no está solucionado. */
export function isPlanOverdue(status: WorkflowStatus, dueDate: Date, todayISO: string): boolean {
  return (status === "PENDING" || status === "IN_PROGRESS") && dueDate.toISOString().slice(0, 10) < todayISO;
}

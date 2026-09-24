"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { ActionState } from "@/lib/action-state";
import { zId } from "@/lib/validation/form";
import { parseForm, parseInput, runAction } from "@/server/actions/run-action";
import { requirePermission, requireUser } from "@/server/auth/current-user";
import { serviceContext } from "@/server/services/context";
import * as plans from "@/server/services/action-plans.service";
import * as evidences from "@/server/services/evidences.service";

const MESSAGES = {
  start: "Plan en proceso.",
  solve: "Plan marcado como solucionado. Queda pendiente de verificación.",
  verify: "Solución verificada.",
  reject: "Plan devuelto al responsable.",
  close: "Plan cerrado.",
} as const;

export async function transitionActionPlanAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return runAction(async () => {
    const ctx = await serviceContext(await requireUser());
    const input = parseForm(plans.transitionSchema, formData);
    const result = await plans.transitionActionPlan(input, ctx);
    revalidatePath(`/action-plans/${input.planId}`);
    revalidatePath("/action-plans");
    revalidatePath("/findings");
    const extra = result.findingStatus === "CLOSED" ? " El hallazgo quedó cerrado." : "";
    return { ok: true, message: `${MESSAGES[input.action]}${extra}` };
  });
}

export async function addPlanCommentAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return runAction(async () => {
    const ctx = await serviceContext(await requireUser());
    const { planId, comment } = parseForm(
      z.object({ planId: zId, comment: z.string().trim().min(2, "Escribe la observación").max(2000) }),
      formData,
    );
    await plans.addPlanComment(planId, comment, ctx);
    revalidatePath(`/action-plans/${planId}`);
    return { ok: true, message: "Observación agregada." };
  });
}

export async function updateActionPlanAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return runAction(async () => {
    const ctx = await serviceContext(await requirePermission("actions.manage"));
    const planId = parseInput(zId, formData.get("planId"));
    await plans.updateActionPlan(planId, parseForm(plans.planEditSchema, formData), ctx);
    revalidatePath(`/action-plans/${planId}`);
    return { ok: true, message: "Plan actualizado." };
  });
}

export async function createActionPlanAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return runAction(async () => {
    const ctx = await serviceContext(await requirePermission("actions.manage"));
    const findingId = parseInput(zId, formData.get("findingId"));
    const plan = await plans.createActionPlan(findingId, parseForm(plans.planEditSchema, formData), ctx);
    revalidatePath(`/findings/${findingId}`);
    return { ok: true, message: "Plan de acción creado y asignado.", redirectTo: `/action-plans/${plan.id}` };
  });
}

/** Quitar un archivo propio mientras la inspección o el plan siguen abiertos. */
export async function deleteEvidenceAction(evidenceId: string): Promise<ActionState> {
  return runAction(async () => {
    const ctx = await serviceContext(await requirePermission("evidences.upload"));
    await evidences.deleteEvidence(parseInput(zId, evidenceId), ctx);
    return { ok: true, message: "Archivo eliminado." };
  });
}

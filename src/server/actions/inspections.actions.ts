"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { ActionState } from "@/lib/action-state";
import { findingFromAnswerSchema } from "@/lib/validation/findings";
import { zId } from "@/lib/validation/form";
import { parseForm, parseInput, runAction } from "@/server/actions/run-action";
import { requirePermission } from "@/server/auth/current-user";
import { serviceContext } from "@/server/services/context";
import * as findings from "@/server/services/findings.service";
import * as inspections from "@/server/services/inspections.service";

export async function startInspectionAction(elementId: string): Promise<ActionState> {
  return runAction(async () => {
    const ctx = await serviceContext(await requirePermission("inspections.perform"));
    const inspection = await inspections.startInspection(parseInput(zId, elementId), ctx);
    return { ok: true, redirectTo: `/inspections/${inspection.id}` };
  });
}

export interface SaveAnswerResult extends ActionState {
  answerId?: string;
  isCompliant?: boolean | null;
}

/** Autoguardado de una respuesta (se llama al tocar una opción o al salir de un campo). */
export async function saveAnswerAction(input: z.infer<typeof inspections.saveAnswerSchema>): Promise<SaveAnswerResult> {
  let saved: Pick<SaveAnswerResult, "answerId" | "isCompliant"> = {};
  const state = await runAction(async () => {
    const ctx = await serviceContext(await requirePermission("inspections.perform"));
    saved = await inspections.saveAnswer(parseInput(inspections.saveAnswerSchema, input), ctx);
    return { ok: true };
  });
  return state.ok ? { ...state, ...saved } : state;
}

export async function createFindingAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return runAction(async () => {
    const ctx = await serviceContext(await requirePermission("findings.create"));
    const input = parseForm(findingFromAnswerSchema, formData);
    const finding = await findings.createFindingFromAnswer(input, ctx);
    revalidatePath(`/inspections/${input.inspectionId}`);
    return { ok: true, message: `Hallazgo #${String(finding.number).padStart(6, "0")} registrado.` };
  });
}

export async function deleteDraftFindingAction(findingId: string, inspectionId: string): Promise<ActionState> {
  return runAction(async () => {
    const ctx = await serviceContext(await requirePermission("findings.create"));
    await findings.deleteDraftFinding(parseInput(zId, findingId), ctx);
    revalidatePath(`/inspections/${inspectionId}`);
    return { ok: true, message: "Hallazgo eliminado." };
  });
}

export async function finalizeInspectionAction(inspectionId: string, notes: string): Promise<ActionState> {
  return runAction(async () => {
    const ctx = await serviceContext(await requirePermission("inspections.perform"));
    const id = parseInput(zId, inspectionId);
    const summary = await inspections.finalizeInspection(
      id,
      parseInput(z.string().trim().max(2000), notes ?? "") || null,
      ctx,
    );
    revalidatePath("/inspections");
    revalidatePath("/inventory");
    const pct = summary.compliancePct === null ? "" : ` · ${summary.compliancePct.toFixed(0)}% de cumplimiento`;
    return {
      ok: true,
      message: `Inspección finalizada: ${summary.result === "COMPLIANT" ? "CUMPLE" : "NO CUMPLE"}${pct}.`,
      redirectTo: `/inspections/${id}`,
    };
  });
}

export async function cancelInspectionAction(inspectionId: string): Promise<ActionState> {
  return runAction(async () => {
    const ctx = await serviceContext(await requirePermission("inspections.perform"));
    await inspections.cancelInspection(parseInput(zId, inspectionId), ctx);
    revalidatePath("/inspections");
    return { ok: true, message: "Inspección anulada.", redirectTo: "/inspections" };
  });
}

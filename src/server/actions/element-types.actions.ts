"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { ActionState } from "@/lib/action-state";
import { elementTypeSchema, QUESTION_FORM_ARRAYS, questionSchema } from "@/lib/validation/config";
import { zId } from "@/lib/validation/form";
import { parseForm, parseInput, runAction } from "@/server/actions/run-action";
import { requirePermission } from "@/server/auth/current-user";
import { serviceContext } from "@/server/services/context";
import * as typesService from "@/server/services/element-types.service";

const BASE = "/admin/element-types";

export async function saveElementTypeAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return runAction(async () => {
    const ctx = await serviceContext(await requirePermission("element_types.manage"));
    const input = parseForm(elementTypeSchema, formData);
    if (input.id) {
      await typesService.updateElementType({ ...input, id: input.id }, ctx);
      revalidatePath(BASE);
      return { ok: true, message: "Tipo de elemento actualizado." };
    }
    const type = await typesService.createElementType(input, ctx);
    revalidatePath(BASE);
    return {
      ok: true,
      message: "Tipo creado. Ahora agrega las preguntas de inspección.",
      redirectTo: `${BASE}/${type.id}`,
    };
  });
}

export async function saveQuestionAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return runAction(async () => {
    const ctx = await serviceContext(await requirePermission("element_types.manage"));
    const input = parseForm(questionSchema, formData, { arrays: QUESTION_FORM_ARRAYS });
    await typesService.saveQuestion(input, ctx);
    revalidatePath(`${BASE}/${input.elementTypeId}`);
    return { ok: true, message: input.id ? "Pregunta actualizada." : "Pregunta agregada." };
  });
}

export async function moveQuestionAction(questionId: string, direction: "up" | "down"): Promise<ActionState> {
  return runAction(async () => {
    const ctx = await serviceContext(await requirePermission("element_types.manage"));
    const typeId = await typesService.moveQuestion(
      parseInput(zId, questionId),
      parseInput(z.enum(["up", "down"]), direction),
      ctx,
    );
    revalidatePath(`${BASE}/${typeId}`);
    return { ok: true };
  });
}

export async function deleteQuestionAction(questionId: string): Promise<ActionState> {
  return runAction(async () => {
    const ctx = await serviceContext(await requirePermission("element_types.manage"));
    const typeId = await typesService.deleteQuestion(parseInput(zId, questionId), ctx);
    revalidatePath(`${BASE}/${typeId}`);
    return { ok: true, message: "Pregunta eliminada. Las inspecciones anteriores conservan su respuesta." };
  });
}

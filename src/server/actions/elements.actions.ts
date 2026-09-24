"use server";

import { revalidatePath } from "next/cache";
import type { ActionState } from "@/lib/action-state";
import { elementSchema } from "@/lib/validation/config";
import { parseForm, runAction } from "@/server/actions/run-action";
import { requirePermission } from "@/server/auth/current-user";
import { serviceContext } from "@/server/services/context";
import * as elementsService from "@/server/services/elements.service";

export async function saveElementAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return runAction(async () => {
    const ctx = await serviceContext(await requirePermission("elements.manage"));
    const input = parseForm(elementSchema, formData);
    if (input.id) {
      await elementsService.updateElement({ ...input, id: input.id }, ctx);
      revalidatePath("/inventory");
      return { ok: true, message: "Elemento actualizado.", redirectTo: `/inventory/${input.id}` };
    }
    const element = await elementsService.createElement(input, ctx);
    revalidatePath("/inventory");
    return { ok: true, message: `Elemento ${input.code} creado.`, redirectTo: `/inventory/${element.id}` };
  });
}

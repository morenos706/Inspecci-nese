"use server";

import { revalidatePath } from "next/cache";
import type { ActionState } from "@/lib/action-state";
import { processSchema } from "@/lib/validation/admin";
import { parseForm, runAction } from "@/server/actions/run-action";
import { requirePermission } from "@/server/auth/current-user";
import { serviceContext } from "@/server/services/context";
import * as processesService from "@/server/services/processes.service";

export async function saveProcessAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return runAction(async () => {
    const ctx = await serviceContext(await requirePermission("processes.manage"));
    const input = parseForm(processSchema, formData);
    if (input.id) {
      await processesService.updateProcess({ ...input, id: input.id }, ctx);
    } else {
      await processesService.createProcess(input, ctx);
    }
    revalidatePath("/admin/processes");
    return { ok: true, message: input.id ? "Proceso actualizado." : "Proceso creado.", redirectTo: "/admin/processes" };
  });
}

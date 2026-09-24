"use server";

import { revalidatePath } from "next/cache";
import type { ActionState } from "@/lib/action-state";
import { ROLE_FORM_ARRAYS, roleSchema } from "@/lib/validation/admin";
import { zId } from "@/lib/validation/form";
import { parseForm, parseInput, runAction } from "@/server/actions/run-action";
import { requirePermission } from "@/server/auth/current-user";
import { serviceContext } from "@/server/services/context";
import * as rolesService from "@/server/services/roles.service";

export async function saveRoleAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return runAction(async () => {
    const ctx = await serviceContext(await requirePermission("roles.manage"));
    const input = parseForm(roleSchema, formData, { arrays: ROLE_FORM_ARRAYS });
    if (input.id) {
      await rolesService.updateRole({ ...input, id: input.id }, ctx);
    } else {
      await rolesService.createRole(input, ctx);
    }
    revalidatePath("/admin/roles");
    return { ok: true, message: input.id ? "Rol actualizado." : "Rol creado.", redirectTo: "/admin/roles" };
  });
}

export async function deleteRoleAction(roleId: string): Promise<ActionState> {
  return runAction(async () => {
    const ctx = await serviceContext(await requirePermission("roles.manage"));
    await rolesService.deleteRole(parseInput(zId, roleId), ctx);
    revalidatePath("/admin/roles");
    return { ok: true, message: "Rol eliminado.", redirectTo: "/admin/roles" };
  });
}

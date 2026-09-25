"use server";

import { revalidatePath } from "next/cache";
import type { ActionState } from "@/lib/action-state";
import { USER_FORM_ARRAYS, userCreateSchema, userUpdateSchema } from "@/lib/validation/admin";
import { zId } from "@/lib/validation/form";
import { parseForm, parseInput, runAction } from "@/server/actions/run-action";
import { requirePermission } from "@/server/auth/current-user";
import { serviceContext } from "@/server/services/context";
import * as usersService from "@/server/services/users.service";

export async function saveUserAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return runAction(async () => {
    const ctx = await serviceContext(await requirePermission("users.manage"));
    if (formData.get("id")) {
      const input = parseForm(userUpdateSchema, formData, { arrays: USER_FORM_ARRAYS });
      await usersService.updateUser(input, ctx);
      revalidatePath("/admin/users");
      return { ok: true, message: "Usuario actualizado.", redirectTo: "/admin/users" };
    }
    const input = parseForm(userCreateSchema, formData, { arrays: USER_FORM_ARRAYS });
    await usersService.createUser(input, ctx);
    revalidatePath("/admin/users");
    return {
      ok: true,
      message: input.password ? "Usuario creado." : "Usuario creado. Se envió una invitación por correo.",
      redirectTo: "/admin/users",
    };
  });
}

export async function sendUserPasswordResetAction(userId: string): Promise<ActionState> {
  return runAction(async () => {
    const ctx = await serviceContext(await requirePermission("users.manage"));
    await usersService.sendPasswordResetByAdmin(parseInput(zId, userId), ctx);
    return { ok: true, message: "Se envió el enlace de restablecimiento al correo del usuario." };
  });
}

export async function unlockUserAction(userId: string): Promise<ActionState> {
  return runAction(async () => {
    const ctx = await serviceContext(await requirePermission("users.manage"));
    await usersService.unlockUser(parseInput(zId, userId), ctx);
    revalidatePath(`/admin/users/${userId}`);
    return { ok: true, message: "Usuario desbloqueado." };
  });
}

export async function deleteUserAction(userId: string): Promise<ActionState> {
  return runAction(async () => {
    const ctx = await serviceContext(await requirePermission("users.manage"));
    const mode = await usersService.deleteUser(parseInput(zId, userId), ctx);
    revalidatePath("/admin/users");
    return {
      ok: true,
      message:
        mode === "deleted"
          ? "Usuario eliminado."
          : "Usuario eliminado. Su nombre se conserva en el historial de inspecciones y hallazgos.",
      redirectTo: "/admin/users",
    };
  });
}

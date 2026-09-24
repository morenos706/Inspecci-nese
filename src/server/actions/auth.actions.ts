"use server";

import { redirect } from "next/navigation";
import type { ActionState } from "@/lib/action-state";
import { changePasswordSchema, forgotPasswordSchema, loginSchema, resetPasswordSchema } from "@/lib/validation/auth";
import { safeRedirectPath } from "@/lib/safe-redirect";
import { parseForm, runAction } from "@/server/actions/run-action";
import { getRequestMeta } from "@/server/request-context";
import { destroyCurrentSession } from "@/server/auth/session";
import { getCurrentUser, requireUser } from "@/server/auth/current-user";
import { audit } from "@/server/audit";
import * as authService from "@/server/services/auth.service";

export async function loginAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return runAction(async () => {
    const input = parseForm(loginSchema, formData);
    await authService.login(input, await getRequestMeta());
    return { ok: true, redirectTo: safeRedirectPath(input.next, "/") };
  });
}

export async function logoutAction(): Promise<void> {
  const user = await getCurrentUser();
  await destroyCurrentSession();
  if (user) {
    await audit({ userId: user.id, meta: await getRequestMeta() }, { action: "auth.logout", entityType: "User", entityId: user.id });
  }
  redirect("/login");
}

export async function forgotPasswordAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return runAction(async () => {
    const { email } = parseForm(forgotPasswordSchema, formData);
    await authService.requestPasswordReset(email, await getRequestMeta());
    return {
      ok: true,
      message: "Si el correo está registrado, recibirás un enlace para restablecer tu contraseña.",
    };
  });
}

export async function resetPasswordAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return runAction(async () => {
    const input = parseForm(resetPasswordSchema, formData);
    await authService.resetPassword(input, await getRequestMeta());
    return { ok: true, message: "Contraseña actualizada. Ya puedes iniciar sesión.", redirectTo: "/login" };
  });
}

export async function changePasswordAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return runAction(async () => {
    const user = await requireUser();
    const input = parseForm(changePasswordSchema, formData);
    await authService.changeOwnPassword(user.id, input, await getRequestMeta());
    return { ok: true, message: "Contraseña actualizada.", redirectTo: "/" };
  });
}

"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { ActionState } from "@/lib/action-state";
import { parseInput, runAction } from "@/server/actions/run-action";
import { requireUser } from "@/server/auth/current-user";
import { audit } from "@/server/audit";
import { auditCtx, serviceContext } from "@/server/services/context";
import { markNotificationsRead, setEmailPreference } from "@/server/services/notifications.service";

export async function markAllNotificationsReadAction(): Promise<ActionState> {
  return runAction(async () => {
    const user = await requireUser();
    const count = await markNotificationsRead(user.id);
    revalidatePath("/notifications");
    return { ok: true, message: count > 0 ? `${count} notificación(es) marcadas como leídas.` : "No tienes notificaciones sin leer." };
  });
}

export async function setEmailNotificationsAction(enabled: boolean): Promise<ActionState> {
  return runAction(async () => {
    const ctx = await serviceContext(await requireUser());
    const value = parseInput(z.boolean(), enabled);
    await setEmailPreference(ctx.user.id, value);
    await audit(auditCtx(ctx), {
      action: "user.email_notifications",
      entityType: "User",
      entityId: ctx.user.id,
      after: { emailNotifications: value },
    });
    revalidatePath("/profile");
    return { ok: true, message: value ? "Recibirás las notificaciones también por correo." : "Ya no recibirás notificaciones por correo." };
  });
}

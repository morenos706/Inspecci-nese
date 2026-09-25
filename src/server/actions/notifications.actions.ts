"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { ActionState } from "@/lib/action-state";
import { parseInput, runAction } from "@/server/actions/run-action";
import { requirePermission, requireUser } from "@/server/auth/current-user";
import { notificationEmail } from "@/emails/notification";
import { env } from "@/lib/env";
import { explainMailError } from "@/lib/mail-errors";
import { mailConfigSummary, sendTestMail } from "@/server/mail/mailer";
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

export async function sendTestEmailAction(): Promise<ActionState> {
  return runAction(async () => {
    const ctx = await serviceContext(await requirePermission("settings.manage"));
    const config = mailConfigSummary();
    const result = await sendTestMail(
      notificationEmail({
        to: ctx.user.email,
        name: ctx.user.name,
        title: "Correo de prueba del sistema de inspecciones",
        body: "Si recibiste este mensaje, las notificaciones por correo están funcionando.",
        type: "system.test",
        url: `${env.APP_URL}/notifications`,
      }),
    );
    await audit(auditCtx(ctx), {
      action: "mail.test",
      entityType: "System",
      after: { to: ctx.user.email, host: config.host, ok: result.ok, error: result.ok ? undefined : result.error.slice(0, 300) },
    });
    if (!result.ok) {
      return { ok: false, message: `${explainMailError(result.error, config.host)} Detalle técnico: ${result.error.slice(0, 300)}` };
    }
    return { ok: true, message: `Correo enviado a ${ctx.user.email}. Revisa la bandeja de entrada y la carpeta de Spam.` };
  });
}

"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { ActionState } from "@/lib/action-state";
import { parseInput, runAction } from "@/server/actions/run-action";
import { requirePermission, requireUser } from "@/server/auth/current-user";
import { EMAIL_TEMPLATE_KEYS, emailConfigSchema, SAMPLE_VARS, type EmailTemplateKey } from "@/lib/email-templates";
import { buildEmail, resetEmailConfig, saveEmailConfig } from "@/server/mail/templates";
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

export async function sendTestEmailAction(template: EmailTemplateKey = "notification"): Promise<ActionState> {
  return runAction(async () => {
    const ctx = await serviceContext(await requirePermission("settings.manage"));
    const key = parseInput(z.enum(EMAIL_TEMPLATE_KEYS), template);
    const config = mailConfigSummary();
    const vars: Record<string, string> =
      key === "notification"
        ? {
            titulo: "Correo de prueba del sistema de inspecciones",
            mensaje: "Si recibiste este mensaje, las notificaciones por correo están funcionando.",
            enlace: `${env.APP_URL}/notifications`,
          }
        : { ...SAMPLE_VARS[key], enlace: `${env.APP_URL}/login`, inicio: `${env.APP_URL}/login` };
    const message = await buildEmail(key, ctx.user.email, { ...vars, nombre: ctx.user.name, correo: ctx.user.email });
    const result = await sendTestMail({ ...message, subject: `[Prueba] ${message.subject}` });
    await audit(auditCtx(ctx), {
      action: "mail.test",
      entityType: "System",
      after: { to: ctx.user.email, template: key, host: config.host, ok: result.ok, error: result.ok ? undefined : result.error.slice(0, 300) },
    });
    if (!result.ok) {
      return { ok: false, message: `${explainMailError(result.error, config.host)} Detalle técnico: ${result.error.slice(0, 300)}` };
    }
    return { ok: true, message: `Correo de prueba enviado a ${ctx.user.email}. Revisa la bandeja de entrada y la carpeta de Spam.` };
  });
}

export async function saveEmailTemplatesAction(config: unknown): Promise<ActionState> {
  return runAction(async () => {
    const ctx = await serviceContext(await requirePermission("settings.manage"));
    const parsed = emailConfigSchema.safeParse(config);
    if (!parsed.success) {
      return { ok: false, message: parsed.error.issues[0]?.message ?? "Revisa los datos de las plantillas." };
    }
    await saveEmailConfig(parsed.data, ctx);
    revalidatePath("/admin/emails");
    return { ok: true, message: "Plantillas de correo guardadas. Los próximos correos usarán este diseño." };
  });
}

export async function resetEmailTemplatesAction(): Promise<ActionState> {
  return runAction(async () => {
    const ctx = await serviceContext(await requirePermission("settings.manage"));
    await resetEmailConfig(ctx);
    revalidatePath("/admin/emails");
    return { ok: true, message: "Se restauraron las plantillas predeterminadas." };
  });
}

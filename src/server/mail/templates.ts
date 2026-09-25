import "server-only";
import { db } from "@/server/db";
import { audit } from "@/server/audit";
import { auditCtx, type ServiceContext } from "@/server/services/context";
import {
  DEFAULT_EMAIL_CONFIG,
  emailConfigSchema,
  renderEmail,
  resolveEmailConfig,
  type EmailConfig,
  type EmailTemplateKey,
} from "@/lib/email-templates";
import type { MailMessage } from "@/server/mail/mailer";

const KEY = "email.templates";

/** Configuración de correos (diseño + plantillas) guardada por el administrador, o la predeterminada. */
export async function getEmailConfig(): Promise<EmailConfig> {
  const [stored, org] = await Promise.all([
    db.systemSetting.findUnique({ where: { key: KEY }, select: { value: true } }),
    db.systemSetting.findUnique({ where: { key: "organization.name" }, select: { value: true } }),
  ]);
  if (stored) return resolveEmailConfig(stored.value);
  const companyName = typeof org?.value === "string" && org.value.trim() ? org.value.trim() : DEFAULT_EMAIL_CONFIG.brand.companyName;
  return { ...DEFAULT_EMAIL_CONFIG, brand: { ...DEFAULT_EMAIL_CONFIG.brand, companyName } };
}

export async function saveEmailConfig(input: unknown, ctx: ServiceContext): Promise<EmailConfig> {
  const config = emailConfigSchema.parse(input);
  await db.$transaction(async (tx) => {
    await tx.systemSetting.upsert({
      where: { key: KEY },
      create: { key: KEY, value: config, description: "Diseño y plantillas de los correos", updatedById: ctx.user.id },
      update: { value: config, updatedById: ctx.user.id },
    });
    await audit(auditCtx(ctx), { action: "settings.email_templates", entityType: "SystemSetting", entityId: KEY, after: config }, tx);
  });
  return config;
}

export async function resetEmailConfig(ctx: ServiceContext) {
  await db.$transaction(async (tx) => {
    await tx.systemSetting.deleteMany({ where: { key: KEY } });
    await audit(auditCtx(ctx), { action: "settings.email_templates_reset", entityType: "SystemSetting", entityId: KEY }, tx);
  });
}

/** Correo listo para enviar con la plantilla configurada. */
export async function buildEmail(key: EmailTemplateKey, to: string, vars: Record<string, string>, config?: EmailConfig): Promise<MailMessage> {
  const rendered = renderEmail(config ?? (await getEmailConfig()), key, vars);
  return { to, ...rendered };
}

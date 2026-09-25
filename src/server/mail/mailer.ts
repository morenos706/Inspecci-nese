import "server-only";
import nodemailer, { type Transporter } from "nodemailer";
import { env } from "@/lib/env";

export interface MailMessage {
  to: string;
  subject: string;
  html: string;
  text: string;
}

/**
 * Abstracción de envío de correo. Hoy usa SMTP (Mailpit en local, cualquier
 * proveedor SMTP en producción: SES, SendGrid, Mailgun…). Si SMTP_HOST está
 * vacío, el correo se escribe en consola (útil en desarrollo y tests).
 */
let transporter: Transporter | null = null;

function getTransporter(): Transporter | null {
  if (!env.SMTP_HOST) return null;
  transporter ??= nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure: env.SMTP_SECURE,
    auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASSWORD.replace(/\s+/g, "") } : undefined,
    // Sin respuesta en 20 s se considera caído (evita esperas de minutos).
    connectionTimeout: 20_000,
    greetingTimeout: 20_000,
    socketTimeout: 30_000,
  });
  return transporter;
}

export async function sendMail(message: MailMessage): Promise<void> {
  const t = getTransporter();
  if (!t) {
    console.info(`[mail:console] Para: ${message.to}\nAsunto: ${message.subject}\n\n${message.text}\n`);
    return;
  }
  await t.sendMail({ from: env.MAIL_FROM, ...message });
}

/** Configuración visible (sin contraseña) para el diagnóstico en pantalla. */
export function mailConfigSummary() {
  return {
    configured: Boolean(env.SMTP_HOST),
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure: env.SMTP_SECURE,
    user: env.SMTP_USER,
    from: env.MAIL_FROM,
    hasPassword: Boolean(env.SMTP_PASSWORD),
  };
}

/** Envía un correo de prueba y devuelve el error real si falla (no lo oculta). */
export async function sendTestMail(message: MailMessage): Promise<{ ok: true } | { ok: false; error: string }> {
  const t = getTransporter();
  if (!t) return { ok: false, error: "SMTP_HOST está vacío en .env.production" };
  try {
    await t.verify();
    await t.sendMail({ from: env.MAIL_FROM, ...message });
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

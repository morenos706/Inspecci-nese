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
    auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASSWORD } : undefined,
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

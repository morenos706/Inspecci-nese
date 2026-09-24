import { emailLayout, escapeHtml } from "@/emails/layout";
import type { MailMessage } from "@/server/mail/mailer";

export function welcomeEmail(input: { to: string; name: string; loginUrl: string; resetUrl: string }): MailMessage {
  const subject = "Tu cuenta fue creada";
  const text = `Hola ${input.name},

Se creó tu cuenta en el sistema de Inspecciones de Emergencia con el correo ${input.to}.
Para definir tu contraseña, abre este enlace: ${input.resetUrl}
Luego podrás ingresar en: ${input.loginUrl}`;
  const html = emailLayout({
    title: subject,
    bodyHtml: `<p>Hola ${escapeHtml(input.name)},</p>
<p>Se creó tu cuenta en el sistema de Inspecciones de Emergencia con el correo <strong>${escapeHtml(input.to)}</strong>.</p>
<p>Para empezar, define tu contraseña con el siguiente botón.</p>`,
    action: { label: "Definir contraseña", url: input.resetUrl },
  });
  return { to: input.to, subject, text, html };
}

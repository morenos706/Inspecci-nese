import { emailLayout, escapeHtml } from "@/emails/layout";
import type { MailMessage } from "@/server/mail/mailer";

export function passwordResetEmail(input: { to: string; name: string; url: string; expiresInMinutes: number }): MailMessage {
  const subject = "Restablece tu contraseña";
  const text = `Hola ${input.name},

Recibimos una solicitud para restablecer tu contraseña. Abre este enlace para crear una nueva:
${input.url}

El enlace vence en ${input.expiresInMinutes} minutos y solo se puede usar una vez.
Si no solicitaste este cambio, ignora este correo: tu contraseña actual sigue siendo válida.`;
  const html = emailLayout({
    title: subject,
    bodyHtml: `<p>Hola ${escapeHtml(input.name)},</p>
<p>Recibimos una solicitud para restablecer tu contraseña. El enlace vence en <strong>${input.expiresInMinutes} minutos</strong> y solo se puede usar una vez.</p>
<p style="font-size:13px;color:#475569">Si no solicitaste este cambio, ignora este correo: tu contraseña actual sigue siendo válida.</p>`,
    action: { label: "Crear nueva contraseña", url: input.url },
  });
  return { to: input.to, subject, text, html };
}

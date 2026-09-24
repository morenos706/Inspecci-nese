import type { MailMessage } from "@/server/mail/mailer";
import { emailLayout, escapeHtml } from "@/emails/layout";

/** Correo genérico de una notificación del sistema (mismo contenido que la campana). */
export function notificationEmail(input: {
  to: string;
  name: string;
  title: string;
  body: string;
  type: string;
  url: string;
}): MailMessage {
  const critical = /cr[ií]tic/i.test(input.title) || input.type === "action_plan.overdue";
  const subject = input.title;
  const text = `Hola ${input.name},

${input.title}
${input.body}

Ver en el sistema: ${input.url}

Puedes desactivar estos correos en "Mi cuenta".`;
  const banner = critical
    ? `<p style="margin:0 0 16px;padding:10px 12px;border-radius:8px;background:#fef2f2;color:#b91c1c;font-weight:600">Requiere atención prioritaria</p>`
    : "";
  const html = emailLayout({
    title: input.title,
    bodyHtml: `${banner}<p>Hola ${escapeHtml(input.name)},</p>
<p style="white-space:pre-line">${escapeHtml(input.body)}</p>
<p style="font-size:12px;color:#64748b">Puedes desactivar estos correos en <em>Mi cuenta</em>.</p>`,
    action: { label: "Ver en el sistema", url: input.url },
  });
  return { to: input.to, subject, text, html };
}

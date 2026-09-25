import "server-only";
import type { EmailConfig } from "@/lib/email-templates";
import { buildEmail } from "@/server/mail/templates";

/** Correo de una notificación del sistema (plantilla editable en Administración → Correos). */
export function notificationEmail(
  input: { to: string; name: string; title: string; body: string; type: string; url: string },
  config?: EmailConfig,
) {
  return buildEmail("notification", input.to, { nombre: input.name, titulo: input.title, mensaje: input.body, enlace: input.url }, config);
}

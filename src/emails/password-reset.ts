import "server-only";
import { buildEmail } from "@/server/mail/templates";

/** Restablecimiento de contraseña (plantilla editable en Administración → Correos). */
export function passwordResetEmail(input: { to: string; name: string; url: string; expiresInMinutes: number }) {
  return buildEmail("password_reset", input.to, { nombre: input.name, enlace: input.url, minutos: String(input.expiresInMinutes) });
}

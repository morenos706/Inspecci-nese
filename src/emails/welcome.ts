import "server-only";
import { buildEmail } from "@/server/mail/templates";

/** Bienvenida a un usuario nuevo (plantilla editable en Administración → Correos). */
export function welcomeEmail(input: { to: string; name: string; loginUrl: string; resetUrl: string }) {
  return buildEmail("welcome", input.to, { nombre: input.name, correo: input.to, enlace: input.resetUrl, inicio: input.loginUrl });
}

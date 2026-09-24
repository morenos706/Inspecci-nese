/** Evita open redirects: solo rutas internas relativas ("/algo", no "//dominio" ni URLs absolutas). */
export function safeRedirectPath(value: string | null | undefined, fallback = "/"): string {
  if (!value || !value.startsWith("/") || value.startsWith("//") || value.startsWith("/\\")) return fallback;
  return value;
}

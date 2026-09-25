/**
 * Traduce errores de SMTP (nodemailer) a una explicación accionable en español.
 * Código puro: probado en tests/unit/mail-errors.test.ts.
 */
export function explainMailError(message: string, host = ""): string {
  const m = message.toLowerCase();
  const gmail = host.toLowerCase().includes("gmail");
  if (/invalid login|535|username and password not accepted|authentication (failed|unsuccessful)|badcredentials|eauth/.test(m)) {
    return gmail
      ? "Gmail rechazó el usuario o la contraseña. Usa una contraseña de aplicación de 16 letras (sin espacios) creada en myaccount.google.com/apppasswords, con la verificación en 2 pasos activa, y revisa que SMTP_USER sea esa misma cuenta de Gmail."
      : "El servidor de correo rechazó el usuario o la contraseña (SMTP_USER / SMTP_PASSWORD).";
  }
  if (/application-specific password required|534/.test(m)) {
    return "Gmail exige una contraseña de aplicación: créala en myaccount.google.com/apppasswords (requiere verificación en 2 pasos) y ponla en SMTP_PASSWORD sin espacios.";
  }
  if (/enotfound|getaddrinfo/.test(m)) return `No se encontró el servidor «${host}». Revisa SMTP_HOST (para Gmail: smtp.gmail.com).`;
  if (/etimedout|timeout|econnrefused|econnreset|ehostunreach/.test(m)) {
    return "No hay conexión con el servidor de correo: revisa SMTP_HOST y SMTP_PORT (Gmail: 587 con SMTP_SECURE=false, o 465 con SMTP_SECURE=true) y que el firewall permita la salida por ese puerto.";
  }
  if (/wrong version number|ssl3_get_record|tls|certificate/.test(m)) {
    return "Error de cifrado: con el puerto 587 usa SMTP_SECURE=false; con el puerto 465 usa SMTP_SECURE=true.";
  }
  if (/sender address rejected|not owned by user|553|550/.test(m)) {
    return "El servidor rechazó el remitente: MAIL_FROM debe usar la misma cuenta que SMTP_USER.";
  }
  if (/daily user sending limit|limit exceeded|4\.7\.0|454/.test(m)) {
    return "Se alcanzó el límite de envío del proveedor. Espera unas horas o usa un correo corporativo.";
  }
  return "El servidor de correo devolvió un error. Revisa la configuración SMTP_* en .env.production.";
}

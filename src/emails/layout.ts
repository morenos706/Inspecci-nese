/** Escapa texto para interpolarlo de forma segura en HTML (previene XSS en correos). */
export function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

/** Plantilla base de correo: HTML simple, compatible con clientes de correo. */
export function emailLayout(options: { title: string; bodyHtml: string; action?: { label: string; url: string } }) {
  const button = options.action
    ? `<p style="margin:24px 0"><a href="${escapeHtml(options.action.url)}" style="background:#1d4ed8;color:#ffffff;padding:12px 20px;border-radius:8px;text-decoration:none;font-weight:600;display:inline-block">${escapeHtml(options.action.label)}</a></p>`
    : "";
  return `<!doctype html>
<html lang="es"><body style="margin:0;background:#f1f5f9;font-family:Segoe UI,Arial,sans-serif;color:#0f172a">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:24px">
<table role="presentation" width="100%" style="max-width:560px;background:#ffffff;border-radius:12px;padding:32px">
<tr><td>
<p style="margin:0 0 16px;font-size:13px;font-weight:700;color:#b91c1c;letter-spacing:.04em;text-transform:uppercase">Inspecciones de Emergencia</p>
<h1 style="margin:0 0 16px;font-size:20px">${escapeHtml(options.title)}</h1>
${options.bodyHtml}
${button}
<p style="margin:24px 0 0;font-size:12px;color:#64748b">Este es un mensaje automático, por favor no respondas a este correo.</p>
</td></tr></table></td></tr></table></body></html>`;
}

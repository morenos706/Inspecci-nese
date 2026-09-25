/**
 * Plantillas de correo editables por el administrador (código puro: se usa en
 * el servidor para enviar y en el navegador para la vista previa).
 *
 * El administrador edita: diseño general (empresa, color, logo, pie) y, por
 * cada plantilla, el asunto, el cuerpo en HTML y el texto del botón. Las
 * variables {{nombre}}, {{titulo}}… se reemplazan al enviar (con escape HTML).
 */
import { z } from "zod";

export const EMAIL_TEMPLATE_KEYS = ["notification", "welcome", "password_reset"] as const;
export type EmailTemplateKey = (typeof EMAIL_TEMPLATE_KEYS)[number];

export const EMAIL_TEMPLATE_INFO: Record<EmailTemplateKey, { label: string; description: string; variables: string[] }> = {
  notification: {
    label: "Notificaciones",
    description: "Asignaciones, recordatorios, alertas críticas, revisiones y resumen diario. Se usa para todos los avisos del sistema.",
    variables: ["nombre", "titulo", "mensaje", "enlace", "empresa"],
  },
  welcome: {
    label: "Bienvenida (usuario nuevo)",
    description: "Se envía al crear un usuario (uno por uno o por carga masiva) para que defina su contraseña.",
    variables: ["nombre", "correo", "enlace", "inicio", "empresa"],
  },
  password_reset: {
    label: "Restablecer contraseña",
    description: "Se envía desde «¿Olvidaste tu contraseña?» o cuando el administrador restablece la clave de un usuario.",
    variables: ["nombre", "enlace", "minutos", "empresa"],
  },
};

export const VARIABLE_HELP: Record<string, string> = {
  nombre: "Nombre de la persona",
  correo: "Correo de la persona",
  titulo: "Título del aviso",
  mensaje: "Detalle del aviso",
  enlace: "Enlace del botón",
  inicio: "Página de inicio de sesión",
  minutos: "Minutos de validez del enlace",
  empresa: "Nombre de la empresa",
};

const hex = z.string().regex(/^#[0-9a-fA-F]{6}$/, "Color en formato #RRGGBB");
const templateSchema = z.object({
  subject: z.string().trim().min(3, "Escribe el asunto").max(200),
  bodyHtml: z.string().trim().min(10, "Escribe el contenido").max(20_000),
  buttonLabel: z.string().trim().min(2, "Escribe el texto del botón").max(60),
});

export const emailConfigSchema = z.object({
  brand: z.object({
    companyName: z.string().trim().min(2, "Escribe el nombre").max(120),
    primaryColor: hex,
    accentColor: hex,
    logoUrl: z
      .string()
      .trim()
      .max(500)
      .refine((v) => v === "" || /^https:\/\/[^\s"'<>]+$/.test(v), "El logo debe ser una dirección https:// pública")
      .default(""),
    footerHtml: z.string().trim().max(2000).default(""),
  }),
  templates: z.object({
    notification: templateSchema,
    welcome: templateSchema,
    password_reset: templateSchema,
  }),
});
export type EmailConfig = z.infer<typeof emailConfigSchema>;

export const DEFAULT_EMAIL_CONFIG: EmailConfig = {
  brand: {
    companyName: "Inspecciones de Emergencia",
    primaryColor: "#b91c1c",
    accentColor: "#1d4ed8",
    logoUrl: "",
    footerHtml: "Este es un mensaje automático, por favor no respondas a este correo.",
  },
  templates: {
    notification: {
      subject: "{{titulo}}",
      bodyHtml: "<p>Hola {{nombre}},</p>\n<p><strong>{{titulo}}</strong></p>\n<p>{{mensaje}}</p>",
      buttonLabel: "Ver en el sistema",
    },
    welcome: {
      subject: "Tu cuenta en {{empresa}} fue creada",
      bodyHtml:
        "<p>Hola {{nombre}},</p>\n<p>Se creó tu cuenta en el sistema de inspecciones de equipos de emergencia con el correo <strong>{{correo}}</strong>.</p>\n<p>Para empezar, define tu contraseña con el siguiente botón. El enlace vence en 72 horas.</p>",
      buttonLabel: "Definir contraseña",
    },
    password_reset: {
      subject: "Restablece tu contraseña",
      bodyHtml:
        "<p>Hola {{nombre}},</p>\n<p>Recibimos una solicitud para restablecer tu contraseña. El enlace vence en <strong>{{minutos}} minutos</strong> y solo se puede usar una vez.</p>\n<p style=\"font-size:13px;color:#475569\">Si no solicitaste este cambio, ignora este correo: tu contraseña actual sigue siendo válida.</p>",
      buttonLabel: "Crear nueva contraseña",
    },
  },
};

/** Configuración guardada + valores por defecto para lo que falte (tolerante a versiones anteriores). */
export function resolveEmailConfig(stored: unknown): EmailConfig {
  const s = (stored ?? {}) as Partial<EmailConfig>;
  const merged = {
    brand: { ...DEFAULT_EMAIL_CONFIG.brand, ...(s.brand ?? {}) },
    templates: Object.fromEntries(
      EMAIL_TEMPLATE_KEYS.map((k) => [k, { ...DEFAULT_EMAIL_CONFIG.templates[k], ...(s.templates?.[k] ?? {}) }]),
    ),
  };
  const parsed = emailConfigSchema.safeParse(merged);
  return parsed.success ? parsed.data : DEFAULT_EMAIL_CONFIG;
}

export function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

/**
 * Limpieza del HTML que escribe el administrador: quita scripts, estilos
 * externos, marcos, formularios, manejadores on* y enlaces javascript:.
 * (Los clientes de correo también filtran; esto evita sorpresas.)
 */
export function sanitizeEmailHtml(html: string): string {
  return html
    // bloques completos (con su contenido) y luego cualquier etiqueta suelta de esos tipos
    .replace(/<\s*(script|style|iframe|object|embed|textarea|select)\b[^>]*>[\s\S]*?<\s*\/\s*\1\s*>/gi, "")
    .replace(/<\s*\/?\s*(script|style|iframe|object|embed|form|input|button|textarea|select|link|meta|base)\b[^>]*>/gi, "")
    .replace(/\son[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "")
    .replace(/(href|src)\s*=\s*(["']?)\s*(javascript|vbscript|data):[^"'\s>]*\2/gi, '$1="#"');
}

/** Reemplaza {{variable}}; en HTML los valores van escapados, y el mensaje conserva los saltos de línea. */
export function fillPlaceholders(template: string, vars: Record<string, string>, mode: "html" | "text"): string {
  return template.replace(/\{\{\s*([a-z_]+)\s*\}\}/gi, (match, name: string) => {
    const value = vars[name.toLowerCase()];
    if (value === undefined) return match;
    return mode === "html" ? escapeHtml(value).replace(/\n/g, "<br>") : value;
  });
}

/** HTML → texto plano (versión alternativa del correo). */
export function htmlToText(html: string): string {
  return html
    .replace(/<\s*br\s*\/?>/gi, "\n")
    .replace(/<\s*\/\s*(p|div|h[1-6]|li|tr)\s*>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export interface RenderedEmail {
  subject: string;
  html: string;
  text: string;
}

/** Arma el correo completo: encabezado con marca, cuerpo, botón y pie. */
export function renderEmail(config: EmailConfig, key: EmailTemplateKey, vars: Record<string, string>): RenderedEmail {
  const { brand } = config;
  const tpl = config.templates[key];
  const allVars: Record<string, string> = { empresa: brand.companyName, ...vars };
  const subject = fillPlaceholders(tpl.subject, allVars, "text").replace(/[\r\n]+/g, " ").slice(0, 200);
  const body = sanitizeEmailHtml(fillPlaceholders(tpl.bodyHtml, allVars, "html"));
  const footer = sanitizeEmailHtml(fillPlaceholders(brand.footerHtml, allVars, "html"));
  const url = allVars.enlace ?? "";
  const safeUrl = /^https?:\/\//.test(url) ? escapeHtml(url) : "";
  const button = safeUrl
    ? `<p style="margin:24px 0"><a href="${safeUrl}" style="background:${brand.accentColor};color:#ffffff;padding:12px 20px;border-radius:8px;text-decoration:none;font-weight:600;display:inline-block">${escapeHtml(fillPlaceholders(tpl.buttonLabel, allVars, "text"))}</a></p>`
    : "";
  const logo = brand.logoUrl
    ? `<img src="${escapeHtml(brand.logoUrl)}" alt="${escapeHtml(brand.companyName)}" style="max-height:48px;max-width:200px;display:block;margin:0 0 12px">`
    : "";
  const html = `<!doctype html>
<html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${escapeHtml(subject)}</title></head>
<body style="margin:0;background:#f1f5f9;font-family:Segoe UI,Arial,sans-serif;color:#0f172a">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:24px">
<table role="presentation" width="100%" style="max-width:560px;background:#ffffff;border-radius:12px;overflow:hidden">
<tr><td style="height:6px;background:${brand.primaryColor}"></td></tr>
<tr><td style="padding:28px 32px 32px">
${logo}<p style="margin:0 0 16px;font-size:13px;font-weight:700;color:${brand.primaryColor};letter-spacing:.04em;text-transform:uppercase">${escapeHtml(brand.companyName)}</p>
<div style="font-size:15px;line-height:1.55">${body}</div>
${button}
${footer ? `<p style="margin:24px 0 0;font-size:12px;color:#64748b">${footer}</p>` : ""}
</td></tr></table></td></tr></table></body></html>`;
  const text = [htmlToText(body), url ? `\n${fillPlaceholders(tpl.buttonLabel, allVars, "text")}: ${url}` : "", footer ? `\n${htmlToText(footer)}` : ""]
    .join("\n")
    .trim();
  return { subject, html, text };
}

/** Datos de ejemplo para la vista previa y el correo de prueba. */
export const SAMPLE_VARS: Record<EmailTemplateKey, Record<string, string>> = {
  notification: {
    nombre: "María Gómez",
    titulo: "Se te asignó el plan #000021",
    mensaje: "PRO-EXT-012: Enviar el extintor a recarga y reemplazarlo temporalmente.\nFecha límite: 30/09/2026.",
    enlace: "https://inspecciones.miempresa.com/action-plans/ejemplo",
  },
  welcome: {
    nombre: "Carlos Ramírez",
    correo: "carlos.ramirez@miempresa.com",
    enlace: "https://inspecciones.miempresa.com/reset-password?token=ejemplo",
    inicio: "https://inspecciones.miempresa.com/login",
  },
  password_reset: {
    nombre: "Carlos Ramírez",
    enlace: "https://inspecciones.miempresa.com/reset-password?token=ejemplo",
    minutos: "60",
  },
};

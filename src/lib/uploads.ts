/**
 * Reglas de archivos (código puro). La validación de tipo se hace por
 * "magic bytes" del contenido real, no por la extensión ni por el MIME que
 * declara el navegador (ambos son manipulables).
 */

export const IMAGE_MIME_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
export const DOCUMENT_MIME_TYPES = ["application/pdf"] as const;
export type AllowedMime = (typeof IMAGE_MIME_TYPES)[number] | (typeof DOCUMENT_MIME_TYPES)[number];

export const EXTENSION_BY_MIME: Record<AllowedMime, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "application/pdf": "pdf",
};

/** Máximo de archivos por entidad (respuesta, hallazgo, plan). */
export const MAX_EVIDENCES_PER_TARGET = 10;

/** Detecta el tipo real del archivo a partir de sus primeros bytes. */
export function detectMimeType(bytes: Uint8Array): AllowedMime | null {
  const starts = (sig: number[], offset = 0) => sig.every((b, i) => bytes[offset + i] === b);
  if (starts([0xff, 0xd8, 0xff])) return "image/jpeg";
  if (starts([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "image/png";
  if (starts([0x52, 0x49, 0x46, 0x46]) && starts([0x57, 0x45, 0x42, 0x50], 8)) return "image/webp";
  if (starts([0x25, 0x50, 0x44, 0x46, 0x2d])) return "application/pdf"; // %PDF-
  return null;
}

export function isImage(mime: string): boolean {
  return (IMAGE_MIME_TYPES as readonly string[]).includes(mime);
}

/** Nombre de archivo seguro para mostrar/descargar (sin rutas ni caracteres de control). */
export function sanitizeFileName(name: string, fallback = "archivo"): string {
  const base = name.split(/[\\/]/).pop() ?? "";
  const clean = base
    .normalize("NFC")
    .replace(/[\u0000-\u001f\u007f"<>|:*?]/g, "")
    .trim()
    .slice(0, 120);
  return clean || fallback;
}

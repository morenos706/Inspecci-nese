import "server-only";

const TYPES = {
  pdf: "application/pdf",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
} as const;

/** Respuesta de descarga de archivo (sin caché: los datos cambian y son privados). */
export function fileResponse(bytes: Uint8Array, fileName: string, format: keyof typeof TYPES) {
  const date = new Date().toISOString().slice(0, 10);
  return new Response(new Uint8Array(bytes), {
    headers: {
      "Content-Type": TYPES[format],
      "Content-Disposition": `attachment; filename="${fileName}-${date}.${format}"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

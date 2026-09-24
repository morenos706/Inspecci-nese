import { requireUser } from "@/server/auth/current-user";
import { errorResponse } from "@/server/http";
import { getEvidenceFile } from "@/server/services/evidences.service";
import { isImage } from "@/lib/uploads";

export const dynamic = "force-dynamic";

/**
 * Descarga/visualización de una evidencia. El bucket es privado: la app
 * verifica permisos en cada solicitud y transmite el archivo.
 */
export async function GET(_request: Request, { params }: RouteContext<"/api/evidences/[id]">) {
  try {
    const user = await requireUser();
    const { id } = await params;
    const file = await getEvidenceFile(id, user);
    const disposition = isImage(file.mimeType) ? "inline" : "attachment";
    return new Response(file.body, {
      headers: {
        "Content-Type": file.mimeType,
        ...(file.contentLength ? { "Content-Length": String(file.contentLength) } : {}),
        "Content-Disposition": `${disposition}; filename*=UTF-8''${encodeURIComponent(file.fileName)}`,
        "Cache-Control": "private, max-age=300",
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy": "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'",
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}

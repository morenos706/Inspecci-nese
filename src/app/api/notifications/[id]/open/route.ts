import { requireUser } from "@/server/auth/current-user";
import { errorResponse } from "@/server/http";
import { openNotification } from "@/server/services/notifications.service";

export const dynamic = "force-dynamic";

/**
 * GET /api/notifications/{id}/open → marca como leída y redirige a su enlace.
 * Solo afecta notificaciones del propio usuario y solo redirige a rutas internas.
 */
export async function GET(_request: Request, { params }: RouteContext<"/api/notifications/[id]/open">) {
  try {
    const user = await requireUser();
    const { id } = await params;
    const link = await openNotification(user.id, id.slice(0, 64));
    // Redirección relativa: detrás de un proxy (Caddy) request.url trae el host interno.
    return new Response(null, { status: 303, headers: { Location: link, "Cache-Control": "no-store" } });
  } catch (error) {
    return errorResponse(error);
  }
}

import { NextResponse } from "next/server";
import { requireUser } from "@/server/auth/current-user";
import { errorResponse } from "@/server/http";
import { unreadSummary } from "@/server/services/notifications.service";

export const dynamic = "force-dynamic";

/** GET /api/notifications/summary → { unread, latest[] } del usuario en sesión (campana). */
export async function GET() {
  try {
    const user = await requireUser();
    const summary = await unreadSummary(user.id);
    return NextResponse.json(summary, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return errorResponse(error);
  }
}

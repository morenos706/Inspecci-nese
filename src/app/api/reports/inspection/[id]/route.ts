import { requireUser } from "@/server/auth/current-user";
import { errorResponse } from "@/server/http";
import { fileResponse } from "@/server/reports/respond";
import { buildInspectionPdf } from "@/server/services/reports.service";

export const dynamic = "force-dynamic";

/** Informe PDF de una inspección: lo descarga quien puede consultar esa inspección (según su alcance). */
export async function GET(_request: Request, { params }: RouteContext<"/api/reports/inspection/[id]">) {
  try {
    const user = await requireUser();
    const { id } = await params;
    const { bytes, fileName } = await buildInspectionPdf(id, user);
    return fileResponse(bytes, fileName, "pdf");
  } catch (error) {
    return errorResponse(error);
  }
}

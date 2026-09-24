import { requireUser } from "@/server/auth/current-user";
import { errorResponse } from "@/server/http";
import { renderTablePdf } from "@/server/reports/pdf";
import { fileResponse } from "@/server/reports/respond";
import { renderTableXlsx } from "@/server/reports/xlsx";
import { buildElementHistoryReport, reportMeta } from "@/server/services/reports.service";

export const dynamic = "force-dynamic";

/** Historial de un elemento (PDF o Excel), según el alcance del usuario. */
export async function GET(request: Request, { params }: RouteContext<"/api/reports/element/[id]">) {
  try {
    const user = await requireUser();
    const { id } = await params;
    const format = new URL(request.url).searchParams.get("format") === "xlsx" ? "xlsx" : "pdf";
    const [report, meta] = await Promise.all([buildElementHistoryReport(id, user), reportMeta(user)]);
    const bytes = format === "xlsx" ? await renderTableXlsx(report, meta) : await renderTablePdf(report, meta);
    return fileResponse(bytes, report.fileName, format);
  } catch (error) {
    return errorResponse(error);
  }
}

import { requirePermission } from "@/server/auth/current-user";
import { NotFoundError } from "@/server/errors";
import { errorResponse } from "@/server/http";
import { renderTablePdf } from "@/server/reports/pdf";
import { fileResponse } from "@/server/reports/respond";
import { renderTableXlsx } from "@/server/reports/xlsx";
import { indicatorFiltersSchema } from "@/server/services/indicators.service";
import { buildReport, REPORT_KINDS, reportMeta, type ReportKind } from "@/server/services/reports.service";

export const dynamic = "force-dynamic";

/** GET /api/reports/{inspections|findings|action-plans|inventory|compliance}?format=pdf|xlsx&from&to&process… */
export async function GET(request: Request, { params }: RouteContext<"/api/reports/[kind]">) {
  try {
    const user = await requirePermission("reports.export");
    const { kind } = await params;
    if (!REPORT_KINDS.includes(kind as ReportKind)) throw new NotFoundError("Reporte no disponible.");
    const url = new URL(request.url);
    const filters = indicatorFiltersSchema.parse(Object.fromEntries(url.searchParams));
    const format = url.searchParams.get("format") === "xlsx" ? "xlsx" : "pdf";
    const [report, meta] = await Promise.all([buildReport(kind as ReportKind, filters, user), reportMeta(user)]);
    const bytes = format === "xlsx" ? await renderTableXlsx(report, meta) : await renderTablePdf(report, meta);
    return fileResponse(bytes, report.fileName, format);
  } catch (error) {
    return errorResponse(error);
  }
}

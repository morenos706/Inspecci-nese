import { requirePermission } from "@/server/auth/current-user";
import { errorResponse } from "@/server/http";
import { buildImportTemplate } from "@/server/services/import.service";

export const dynamic = "force-dynamic";

/** Plantilla Excel de carga masiva (con los valores válidos actuales en listas desplegables). */
export async function GET() {
  try {
    await requirePermission("elements.manage");
    const file = await buildImportTemplate();
    return new Response(new Uint8Array(file), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": 'attachment; filename="plantilla-carga-masiva.xlsx"',
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}

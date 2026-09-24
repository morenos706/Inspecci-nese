import { requireUser } from "@/server/auth/current-user";
import { errorResponse } from "@/server/http";
import { fileResponse } from "@/server/reports/respond";
import { buildQrLabelsPdf, qrLabelsQuerySchema } from "@/server/services/qr.service";

export const dynamic = "force-dynamic";

/** PDF de etiquetas QR (?element=… | ?site=…&zone=…&type=…&process=…), según el alcance del usuario. */
export async function GET(request: Request) {
  try {
    const user = await requireUser();
    const query = qrLabelsQuerySchema.parse(Object.fromEntries(new URL(request.url).searchParams));
    const { bytes } = await buildQrLabelsPdf(query, user);
    return fileResponse(bytes, "etiquetas-qr", "pdf");
  } catch (error) {
    return errorResponse(error);
  }
}

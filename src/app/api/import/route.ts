import { after, NextResponse } from "next/server";
import { requirePermission } from "@/server/auth/current-user";
import { DomainError } from "@/server/errors";
import { assertSameOrigin, errorResponse } from "@/server/http";
import { serviceContext } from "@/server/services/context";
import { analyzeImport, applyImport, MAX_IMPORT_BYTES } from "@/server/services/import.service";
import { sendWelcomeEmails } from "@/server/services/import-users";

export const dynamic = "force-dynamic";

/**
 * Carga masiva (multipart: file + mode).
 *  - mode=preview: valida y devuelve el resultado por fila, sin guardar.
 *  - mode=apply:   vuelve a validar y guarda todo en una transacción (solo si no hay errores).
 */
export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const user = await requirePermission("elements.manage");
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) throw new DomainError("Adjunta el archivo Excel.");
    if (file.size > MAX_IMPORT_BYTES) throw new DomainError("El archivo supera 5 MB.");
    const buffer = await file.arrayBuffer();

    if (form.get("mode") === "apply") {
      const { summary, invitedUserIds } = await applyImport(buffer, await serviceContext(user));
      // Las invitaciones se envían después de responder (no bloquean la carga).
      if (invitedUserIds.length) after(() => sendWelcomeEmails(invitedUserIds));
      return NextResponse.json({ ok: true, summary, invited: invitedUserIds.length });
    }
    const { preview } = await analyzeImport(buffer, user.id);
    return NextResponse.json({ ok: true, preview });
  } catch (error) {
    return errorResponse(error);
  }
}

import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/server/auth/current-user";
import { DomainError } from "@/server/errors";
import { assertSameOrigin, errorResponse } from "@/server/http";
import { serviceContext } from "@/server/services/context";
import { uploadEvidence, type EvidenceTarget } from "@/server/services/evidences.service";

export const dynamic = "force-dynamic";

const targetSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("answer"), inspectionId: z.string().min(1).max(64), questionId: z.string().min(1).max(64) }),
  z.object({ kind: z.literal("finding"), findingId: z.string().min(1).max(64) }),
]);

/**
 * Subida de evidencias (multipart/form-data: file + kind + ids).
 * Las fotos se comprimen en el navegador antes de enviarse.
 */
export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const user = await requireUser();
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) throw new DomainError("Adjunta un archivo.");
    const parsed = targetSchema.safeParse(Object.fromEntries([...form.entries()].filter(([k]) => k !== "file")));
    if (!parsed.success) throw new DomainError("Destino del archivo inválido.");

    const evidence = await uploadEvidence(
      parsed.data as EvidenceTarget,
      { name: file.name, bytes: new Uint8Array(await file.arrayBuffer()) },
      await serviceContext(user),
    );
    return NextResponse.json({ ok: true, evidence: { id: evidence.id, fileName: evidence.fileName } }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}

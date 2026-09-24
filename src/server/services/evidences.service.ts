import "server-only";
import { createHash, randomUUID } from "node:crypto";
import { db } from "@/server/db";
import { audit } from "@/server/audit";
import { AuthorizationError, DomainError, NotFoundError } from "@/server/errors";
import { getReadScope, type CurrentUser } from "@/server/auth/current-user";
import { env } from "@/lib/env";
import {
  detectMimeType,
  EXTENSION_BY_MIME,
  isImage,
  MAX_EVIDENCES_PER_TARGET,
  sanitizeFileName,
} from "@/lib/uploads";
import { auditCtx, type ServiceContext } from "@/server/services/context";
import { ensureAnswer } from "@/server/services/inspections.service";
import { actionPlanScopeWhere, managesProcess } from "@/server/services/action-plans.service";
import { storage } from "@/server/storage";

export type EvidenceTarget =
  | { kind: "answer"; inspectionId: string; questionId: string }
  | { kind: "finding"; findingId: string }
  | { kind: "actionPlan"; actionPlanId: string };

/**
 * Sube una evidencia. Valida permiso, propiedad de la inspección en curso,
 * tamaño y tipo REAL del archivo (magic bytes). En inspecciones solo se
 * aceptan imágenes. El nombre del objeto lo genera el servidor.
 */
export async function uploadEvidence(
  target: EvidenceTarget,
  file: { name: string; bytes: Uint8Array },
  ctx: ServiceContext,
) {
  if (!ctx.user.permissions.has("evidences.upload")) throw new AuthorizationError();

  const maxBytes = env.UPLOAD_MAX_MB * 1024 * 1024;
  if (file.bytes.byteLength === 0) throw new DomainError("El archivo está vacío.");
  if (file.bytes.byteLength > maxBytes) throw new DomainError(`El archivo supera el máximo de ${env.UPLOAD_MAX_MB} MB.`);
  const mimeType = detectMimeType(file.bytes);
  // En inspecciones solo fotos; en planes de acción también PDF (actas, facturas de recarga…).
  const allowsPdf = target.kind === "actionPlan";
  if (!mimeType || (!isImage(mimeType) && !(allowsPdf && mimeType === "application/pdf"))) {
    throw new DomainError(allowsPdf ? "Solo se permiten fotografías (JPG, PNG, WEBP) o PDF." : "Solo se permiten fotografías JPG, PNG o WEBP.");
  }

  // Resolver y autorizar la entidad destino
  let link: { answerId?: string; findingId?: string; actionPlanId?: string; inspectionId?: string };
  if (target.kind === "actionPlan") {
    const plan = await db.actionPlan.findFirst({
      where: { AND: [{ id: target.actionPlanId }, actionPlanScopeWhere(ctx.user)] },
      select: { id: true, status: true, responsibleId: true, finding: { select: { processId: true } } },
    });
    if (!plan) throw new NotFoundError("El plan de acción no existe.");
    if (plan.responsibleId !== ctx.user.id && !managesProcess(ctx.user, plan.finding.processId)) {
      throw new AuthorizationError("Solo el responsable del plan puede adjuntar evidencias.");
    }
    if (plan.status !== "PENDING" && plan.status !== "IN_PROGRESS") {
      throw new DomainError("Solo se adjuntan evidencias a planes pendientes o en proceso.");
    }
    link = { actionPlanId: plan.id };
  } else if (target.kind === "answer") {
    const answer = await ensureAnswer(target.inspectionId, target.questionId, ctx.user);
    link = { answerId: answer.id, inspectionId: target.inspectionId };
  } else {
    const finding = await db.finding.findFirst({
      where: { id: target.findingId },
      select: { id: true, inspectionId: true, inspection: { select: { status: true, inspectorId: true } } },
    });
    if (!finding || !finding.inspection || !finding.inspectionId) throw new NotFoundError("El hallazgo no existe.");
    if (finding.inspection.inspectorId !== ctx.user.id || finding.inspection.status !== "IN_PROGRESS") {
      throw new AuthorizationError("Solo se pueden adjuntar fotos a hallazgos de tu inspección en curso.");
    }
    link = { findingId: finding.id, inspectionId: finding.inspectionId };
  }

  const existing = await db.evidence.count({
    where: {
      deletedAt: null,
      ...(link.answerId
        ? { answerId: link.answerId }
        : link.actionPlanId
          ? { actionPlanId: link.actionPlanId }
          : { findingId: link.findingId }),
    },
  });
  if (existing >= MAX_EVIDENCES_PER_TARGET) {
    throw new DomainError(`Máximo ${MAX_EVIDENCES_PER_TARGET} archivos por pregunta o hallazgo.`);
  }

  const now = new Date();
  const folder = link.actionPlanId ? "action-plans" : "inspections";
  const storageKey = `${folder}/${now.getUTCFullYear()}/${String(now.getUTCMonth() + 1).padStart(2, "0")}/${randomUUID()}.${EXTENSION_BY_MIME[mimeType]}`;
  await storage().put(storageKey, file.bytes, mimeType);

  try {
    return await db.$transaction(async (tx) => {
      const evidence = await tx.evidence.create({
        data: {
          kind: isImage(mimeType) ? "PHOTO" : "DOCUMENT",
          storageKey,
          fileName: sanitizeFileName(file.name, `evidencia.${EXTENSION_BY_MIME[mimeType]}`),
          mimeType,
          sizeBytes: file.bytes.byteLength,
          checksum: createHash("sha256").update(file.bytes).digest("hex"),
          uploadedById: ctx.user.id,
          answerId: link.answerId ?? null,
          findingId: link.findingId ?? null,
          actionPlanId: link.actionPlanId ?? null,
        },
        select: { id: true, fileName: true },
      });
      await audit(
        auditCtx(ctx),
        { action: "evidence.upload", entityType: "Evidence", entityId: evidence.id, after: { ...link, mimeType, size: file.bytes.byteLength } },
        tx,
      );
      return evidence;
    });
  } catch (error) {
    // Si falla la BD, no se deja el objeto huérfano en el bucket.
    await storage().delete(storageKey).catch(() => undefined);
    throw error;
  }
}

const evidenceAccessSelect = {
  id: true,
  storageKey: true,
  fileName: true,
  mimeType: true,
  uploadedById: true,
  deletedAt: true,
  answer: { select: { inspection: { select: { inspectorId: true, processId: true, status: true } } } },
  finding: {
    select: {
      processId: true,
      responsibleId: true,
      createdById: true,
      inspection: { select: { inspectorId: true, processId: true, status: true } },
    },
  },
  actionPlan: { select: { status: true, responsibleId: true, finding: { select: { processId: true } } } },
  element: { select: { processId: true } },
} as const;

type EvidenceAccess = NonNullable<Awaited<ReturnType<typeof loadEvidence>>>;

function loadEvidence(id: string) {
  return db.evidence.findFirst({ where: { id }, select: evidenceAccessSelect });
}

/** Regla de acceso: quien la subió, o quien puede leer la entidad relacionada según su alcance. */
function canView(user: CurrentUser, ev: EvidenceAccess): boolean {
  if (ev.uploadedById === user.id) return true;
  const inspection = ev.answer?.inspection ?? ev.finding?.inspection;
  if (inspection) {
    const scope = getReadScope(user, "inspections");
    if (scope === "all") return true;
    if (scope === "process" && user.processIds.includes(inspection.processId)) return true;
    if (scope === "own" && inspection.inspectorId === user.id) return true;
  }
  if (ev.finding) {
    const scope = getReadScope(user, "findings");
    if (scope === "all") return true;
    if (scope === "process" && user.processIds.includes(ev.finding.processId)) return true;
    if (scope === "assigned" && (ev.finding.responsibleId === user.id || ev.finding.createdById === user.id)) return true;
  }
  if (ev.actionPlan) {
    const scope = getReadScope(user, "actions");
    if (scope === "all") return true;
    if (scope === "process" && user.processIds.includes(ev.actionPlan.finding.processId)) return true;
    if (scope === "assigned" && ev.actionPlan.responsibleId === user.id) return true;
  }
  if (ev.element) {
    const scope = getReadScope(user, "elements");
    if (scope === "all") return true;
    if (scope === "process" && user.processIds.includes(ev.element.processId)) return true;
  }
  return false;
}

export async function getEvidenceFile(id: string, user: CurrentUser) {
  const ev = await loadEvidence(id);
  if (!ev || ev.deletedAt || !canView(user, ev)) throw new NotFoundError("El archivo no existe o no tienes acceso a él.");
  const object = await storage().get(ev.storageKey);
  if (!object) throw new NotFoundError("El archivo no se encuentra en el almacenamiento.");
  return { ...object, mimeType: ev.mimeType, fileName: ev.fileName };
}

/** Borrado lógico por quien la subió, solo mientras la inspección sigue en curso. */
export async function deleteEvidence(id: string, ctx: ServiceContext) {
  const ev = await loadEvidence(id);
  if (!ev || ev.deletedAt) throw new NotFoundError("El archivo no existe.");
  const inspection = ev.answer?.inspection ?? ev.finding?.inspection;
  const editable = ev.actionPlan
    ? ev.actionPlan.status === "PENDING" || ev.actionPlan.status === "IN_PROGRESS"
    : inspection?.status === "IN_PROGRESS";
  if (ev.uploadedById !== ctx.user.id || !editable) {
    throw new DomainError("Solo puedes quitar tus archivos mientras la inspección o el plan siguen abiertos.");
  }
  await db.$transaction(async (tx) => {
    await tx.evidence.update({ where: { id }, data: { deletedAt: new Date() } });
    await audit(auditCtx(ctx), { action: "evidence.delete", entityType: "Evidence", entityId: id }, tx);
  });
}

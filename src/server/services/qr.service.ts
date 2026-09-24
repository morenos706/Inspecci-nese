import "server-only";
import QRCode from "qrcode";
import { PDFDocument, rgb, StandardFonts } from "pdf-lib";
import { z } from "zod";
import { db } from "@/server/db";
import type { Prisma } from "@/generated/prisma/client";
import { audit } from "@/server/audit";
import { DomainError, NotFoundError } from "@/server/errors";
import { getReadScope, type CurrentUser } from "@/server/auth/current-user";
import { env } from "@/lib/env";
import { auditCtx, type ServiceContext } from "@/server/services/context";
import { elementScopeWhere, generateQrToken } from "@/server/services/elements.service";
import { reportMeta } from "@/server/services/reports.service";

/** URL que contiene el QR: solo un identificador opaco (no revela datos del elemento). */
export function qrUrl(qrToken: string) {
  return `${env.APP_URL.replace(/\/$/, "")}/q/${qrToken}`;
}

/** Elemento por su token de QR, si el usuario puede verlo o inspeccionarlo. */
export async function findElementByQr(token: string, user: CurrentUser) {
  if (!/^[A-Za-z0-9_-]{10,64}$/.test(token)) return null;
  const canPerform = user.permissions.has("inspections.perform");
  const scope = getReadScope(user, "elements");
  if (!canPerform && !scope) return null;
  return db.element.findFirst({
    where: {
      qrToken: token,
      deletedAt: null,
      // Los brigadistas pueden inspeccionar cualquier elemento; los demás, según su alcance.
      ...(canPerform || !scope ? {} : elementScopeWhere(user)),
    },
    select: {
      id: true,
      code: true,
      name: true,
      location: true,
      status: true,
      frequency: true,
      frequencyDays: true,
      lastInspectionAt: true,
      nextInspectionAt: true,
      expiresAt: true,
      expiryLabel: true,
      elementType: { select: { name: true } },
      site: { select: { name: true } },
      zone: { select: { name: true } },
      responsible: { select: { name: true } },
      _count: { select: { findings: { where: { status: { not: "CLOSED" } } } } },
      inspections: {
        where: { status: "IN_PROGRESS", inspectorId: user.id },
        select: { id: true },
        take: 1,
      },
    },
  });
}

export async function findElementByCode(code: string, user: CurrentUser) {
  const canPerform = user.permissions.has("inspections.perform");
  const scope = getReadScope(user, "elements");
  if (!canPerform && !scope) return null;
  return db.element.findFirst({
    where: {
      code: code.trim().toUpperCase(),
      deletedAt: null,
      ...(canPerform || !scope ? {} : elementScopeWhere(user)),
    },
    select: { qrToken: true },
  });
}

/** Genera un nuevo token (el QR impreso anterior deja de funcionar). */
export async function regenerateQr(elementId: string, ctx: ServiceContext) {
  const element = await db.element.findFirst({ where: { id: elementId, deletedAt: null }, select: { id: true, code: true } });
  if (!element) throw new NotFoundError("El elemento no existe.");
  await db.$transaction(async (tx) => {
    await tx.element.update({ where: { id: elementId }, data: { qrToken: generateQrToken() } });
    await audit(auditCtx(ctx), { action: "element.qr_regenerate", entityType: "Element", entityId: elementId, after: { code: element.code } }, tx);
  });
}

export const qrLabelsQuerySchema = z.object({
  element: z.string().max(64).optional().catch(undefined),
  site: z.string().max(64).optional().catch(undefined),
  zone: z.string().max(64).optional().catch(undefined),
  type: z.string().max(64).optional().catch(undefined),
  process: z.string().max(64).optional().catch(undefined),
});

const MAX_LABELS = 500;

/**
 * PDF de etiquetas QR para imprimir y pegar: A4, 2 × 4 etiquetas por hoja
 * (≈ 95 × 68 mm). El QR se dibuja como vector (nítido a cualquier tamaño).
 */
export async function buildQrLabelsPdf(query: z.infer<typeof qrLabelsQuerySchema>, user: CurrentUser) {
  const where: Prisma.ElementWhereInput = {
    AND: [
      { deletedAt: null, status: { not: "RETIRED" } },
      elementScopeWhere(user),
      query.element ? { id: query.element } : {},
      query.site ? { siteId: query.site } : {},
      query.zone ? { zoneId: query.zone } : {},
      query.type ? { elementTypeId: query.type } : {},
      query.process ? { processId: query.process } : {},
    ],
  };
  const elements = await db.element.findMany({
    where,
    orderBy: [{ site: { name: "asc" } }, { zone: { name: "asc" } }, { code: "asc" }],
    take: MAX_LABELS + 1,
    select: {
      code: true,
      name: true,
      qrToken: true,
      location: true,
      elementType: { select: { name: true } },
      site: { select: { name: true } },
      zone: { select: { name: true } },
    },
  });
  if (elements.length === 0) throw new DomainError("No hay elementos con esos filtros.");
  if (elements.length > MAX_LABELS) throw new DomainError(`Máximo ${MAX_LABELS} etiquetas por archivo: filtra por sede o zona.`);

  const { organization } = await reportMeta(user);
  const doc = await PDFDocument.create();
  doc.setTitle("Etiquetas QR");
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const safe = (t: string) => {
    let out = "";
    for (const ch of t) {
      try {
        font.encodeText(ch);
        out += ch;
      } catch {
        out += ch === "–" ? "-" : "?";
      }
    }
    return out;
  };
  const fit = (t: string, f: typeof font, size: number, max: number) => {
    let s = safe(t);
    while (s.length > 1 && f.widthOfTextAtSize(s, size) > max) s = s.slice(0, -2) + "…";
    return s;
  };

  const [W, H] = [595.28, 841.89];
  const cols = 2;
  const rows = 4;
  const margin = 24;
  const gap = 10;
  const lw = (W - margin * 2 - gap * (cols - 1)) / cols;
  const lh = (H - margin * 2 - gap * (rows - 1)) / rows;
  const brand = rgb(0.73, 0.11, 0.11);
  const muted = rgb(0.39, 0.45, 0.55);
  const ink = rgb(0.06, 0.09, 0.16);

  let page = doc.addPage([W, H]);
  elements.forEach((el, i) => {
    const slot = i % (cols * rows);
    if (i > 0 && slot === 0) page = doc.addPage([W, H]);
    const c = slot % cols;
    const r = Math.floor(slot / cols);
    const x = margin + c * (lw + gap);
    const y = H - margin - (r + 1) * lh - r * gap;

    // Borde de corte y franja de marca
    page.drawRectangle({ x, y, width: lw, height: lh, borderColor: rgb(0.8, 0.82, 0.86), borderWidth: 0.6 });
    page.drawRectangle({ x, y: y + lh - 16, width: lw, height: 16, color: brand });
    page.drawText(fit(organization.toUpperCase(), bold, 7.5, lw - 12), { x: x + 6, y: y + lh - 11.5, size: 7.5, font: bold, color: rgb(1, 1, 1) });

    // QR (matriz vectorial con zona de silencio)
    const qr = QRCode.create(qrUrl(el.qrToken), { errorCorrectionLevel: "M" });
    const n = qr.modules.size;
    const qrSize = Math.min(lh - 34, lw * 0.5);
    const cell = qrSize / (n + 2);
    const qx = x + 8;
    const qy = y + (lh - 16 - qrSize) / 2;
    for (let row = 0; row < n; row++) {
      for (let col = 0; col < n; col++) {
        if (qr.modules.get(row, col)) {
          page.drawRectangle({ x: qx + (col + 1) * cell, y: qy + qrSize - (row + 2) * cell, width: cell, height: cell, color: ink });
        }
      }
    }

    // Texto
    const tx = qx + qrSize + 8;
    const tw = x + lw - tx - 6;
    let ty = y + lh - 36;
    const line = (text: string, size: number, f = font, color = ink) => {
      page.drawText(fit(text, f, size, tw), { x: tx, y: ty, size, font: f, color });
      ty -= size + 4;
    };
    line(el.code, 20, bold);
    line(el.elementType.name, 9, bold, muted);
    line(el.name, 8.5);
    line(`${el.site.name}${el.zone ? ` · ${el.zone.name}` : ""}`, 8, font, muted);
    if (el.location) line(el.location, 8, font, muted);
    page.drawText(safe("Escanea para inspeccionar"), { x: tx, y: y + 8, size: 7.5, font: bold, color: brand });
  });

  return { bytes: await doc.save(), count: elements.length };
}

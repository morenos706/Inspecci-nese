import "server-only";
import { firstFreeCode, recodeElement } from "@/lib/element-code";
import { randomBytes } from "node:crypto";
import { z } from "zod";
import { db } from "@/server/db";
import type { Prisma } from "@/generated/prisma/client";
import { audit, diff } from "@/server/audit";
import { AuthorizationError, DomainError, NotFoundError, ValidationError } from "@/server/errors";
import { getReadScope, type CurrentUser } from "@/server/auth/current-user";
import { scheduleFields, type ScheduleStatus } from "@/lib/scheduling";
import { expiryRange } from "@/lib/expiry";
import { env } from "@/lib/env";
import { todayISO } from "@/lib/utils";
import type { elementSchema, ElementListQuery } from "@/lib/validation/config";
import { auditCtx, type ServiceContext } from "@/server/services/context";
import { paginated, paginationArgs } from "@/server/services/pagination";

type ElementInput = z.infer<typeof elementSchema>;

// ---------------------------------------------------------------------------
// Alcance y filtros
// ---------------------------------------------------------------------------

/**
 * Filtro de alcance según permisos: elements.read.all → todo;
 * elements.read.process → solo procesos del usuario. Se aplica en la consulta.
 */
export function elementScopeWhere(user: CurrentUser): Prisma.ElementWhereInput {
  const scope = getReadScope(user, "elements");
  if (scope === "all") return {};
  if (scope === "process") return { processId: { in: user.processIds } };
  throw new AuthorizationError();
}

/**
 * Traduce el estado de programación a condiciones SQL usando los campos
 * persistidos por scheduleFields() (misma regla que scheduleStatus()).
 * Solo aplica a elementos ACTIVOS.
 */
export function scheduleWhere(status: Exclude<ScheduleStatus, "UNSCHEDULED">, now = new Date()): Prisma.ElementWhereInput {
  switch (status) {
    case "OVERDUE":
      return { status: "ACTIVE", nextInspectionAt: { lt: now } };
    case "DUE_SOON":
      return { status: "ACTIVE", nextInspectionAt: { gte: now }, dueSoonAt: { lte: now } };
    case "ON_TIME":
      return { status: "ACTIVE", dueSoonAt: { gt: now } };
  }
}

/** Elementos activos vencidos / por vencer (misma regla que expiryStatus()). */
export function expiryWhere(status: "EXPIRED" | "EXPIRING", today = todayISO(new Date(), env.APP_TIMEZONE)): Prisma.ElementWhereInput {
  return { status: "ACTIVE", expiresAt: expiryRange(status, today) };
}

const listSelect = {
  id: true,
  code: true,
  name: true,
  location: true,
  status: true,
  expiresAt: true,
  expiryLabel: true,
  frequency: true,
  frequencyDays: true,
  lastInspectionAt: true,
  nextInspectionAt: true,
  elementType: { select: { id: true, name: true } },
  process: { select: { id: true, name: true } },
  site: { select: { id: true, name: true } },
  zone: { select: { id: true, name: true } },
  responsible: { select: { id: true, name: true } },
} satisfies Prisma.ElementSelect;

export async function listElements(query: ElementListQuery, user: CurrentUser) {
  const where: Prisma.ElementWhereInput = {
    AND: [
      { deletedAt: null },
      elementScopeWhere(user),
      query.type ? { elementTypeId: query.type } : {},
      query.process ? { processId: query.process } : {},
      query.site ? { siteId: query.site } : {},
      query.status ? { status: query.status } : {},
      query.schedule ? scheduleWhere(query.schedule) : {},
      query.expiry ? expiryWhere(query.expiry) : {},
      query.q
        ? {
            OR: [
              { code: { contains: query.q, mode: "insensitive" } },
              { name: { contains: query.q, mode: "insensitive" } },
              { location: { contains: query.q, mode: "insensitive" } },
            ],
          }
        : {},
    ],
  };
  const [items, total] = await db.$transaction([
    db.element.findMany({
      where,
      select: listSelect,
      // Primero lo más urgente: próxima inspección ascendente (sin fecha al final).
      orderBy: [{ nextInspectionAt: { sort: "asc", nulls: "last" } }, { code: "asc" }],
      ...paginationArgs(query.page),
    }),
    db.element.count({ where }),
  ]);
  return paginated(items, total, query.page);
}

/** Conteos por estado de programación (dashboard), respetando el alcance del usuario. */
export async function scheduleSummary(user: CurrentUser) {
  const base: Prisma.ElementWhereInput = { deletedAt: null, ...elementScopeWhere(user) };
  const now = new Date();
  const [active, overdue, dueSoon, onTime, expired, expiring] = await db.$transaction([
    db.element.count({ where: { ...base, status: "ACTIVE" } }),
    db.element.count({ where: { AND: [base, scheduleWhere("OVERDUE", now)] } }),
    db.element.count({ where: { AND: [base, scheduleWhere("DUE_SOON", now)] } }),
    db.element.count({ where: { AND: [base, scheduleWhere("ON_TIME", now)] } }),
    db.element.count({ where: { AND: [base, expiryWhere("EXPIRED")] } }),
    db.element.count({ where: { AND: [base, expiryWhere("EXPIRING")] } }),
  ]);
  return { active, overdue, dueSoon, onTime, expired, expiring };
}

export async function getElement(id: string, user: CurrentUser) {
  const element = await db.element.findFirst({
    where: { id, deletedAt: null, ...elementScopeWhere(user) },
    select: {
      ...listSelect,
      description: true,
      qrToken: true,
      createdAt: true,
      updatedAt: true,
      zoneId: true,
      processId: true,
      siteId: true,
      elementTypeId: true,
      responsibleId: true,
      inspections: {
        where: { status: "COMPLETED" },
        orderBy: { completedAt: "desc" },
        take: 10,
        select: {
          id: true,
          number: true,
          completedAt: true,
          result: true,
          compliancePct: true,
          nonCompliantCount: true,
          inspector: { select: { name: true } },
        },
      },
      findings: {
        where: { status: { not: "CLOSED" } },
        orderBy: [{ priority: "desc" }, { createdAt: "desc" }],
        select: {
          id: true,
          number: true,
          description: true,
          priority: true,
          status: true,
          dueDate: true,
          responsible: { select: { name: true } },
        },
      },
      _count: { select: { inspections: { where: { status: "COMPLETED" } } } },
    },
  });
  if (!element) throw new NotFoundError("El elemento no existe o no tienes acceso a él.");
  return element;
}

// ---------------------------------------------------------------------------
// Escritura
// ---------------------------------------------------------------------------

/** Identificador opaco del QR: 128 bits aleatorios, no deriva del ID ni del código. */
export function generateQrToken() {
  return randomBytes(16).toString("base64url");
}

async function assertReferences(input: ElementInput, typeMustBeActive: boolean) {
  const [type, process, site, zone, responsible] = await Promise.all([
    db.elementType.findFirst({
      where: { id: input.elementTypeId, deletedAt: null, ...(typeMustBeActive ? { active: true } : {}) },
      select: { id: true },
    }),
    db.process.findFirst({ where: { id: input.processId, deletedAt: null, active: true }, select: { id: true } }),
    db.site.findFirst({ where: { id: input.siteId, deletedAt: null, active: true }, select: { id: true } }),
    input.zoneId
      ? db.zone.findFirst({ where: { id: input.zoneId, siteId: input.siteId, deletedAt: null }, select: { id: true } })
      : Promise.resolve({ id: null }),
    input.responsibleId
      ? db.user.findFirst({ where: { id: input.responsibleId, active: true, deletedAt: null }, select: { id: true } })
      : Promise.resolve({ id: null }),
  ]);
  const errors: Record<string, string[]> = {};
  if (!type) errors.elementTypeId = ["Tipo inválido o inactivo"];
  if (!process) errors.processId = ["Proceso inválido o inactivo"];
  if (!site) errors.siteId = ["Sede inválida o inactiva"];
  if (!zone) errors.zoneId = ["La zona no pertenece a la sede seleccionada"];
  if (!responsible) errors.responsibleId = ["Responsable inválido o inactivo"];
  if (Object.keys(errors).length) {
    throw new ValidationError(errors);
  }
}

export async function createElement(input: ElementInput, ctx: ServiceContext) {
  await assertReferences(input, true);
  const schedule = scheduleFields({
    lastInspectionAt: input.lastInspectionAt ?? null,
    frequency: input.frequency,
    frequencyDays: input.frequencyDays,
    firstInspectionAt: input.firstInspectionAt ?? null,
  });
  return db.$transaction(async (tx) => {
    const element = await tx.element.create({
      data: {
        code: input.code,
        qrToken: generateQrToken(),
        elementTypeId: input.elementTypeId,
        name: input.name,
        description: input.description ?? null,
        processId: input.processId,
        siteId: input.siteId,
        zoneId: input.zoneId ?? null,
        location: input.location ?? null,
        responsibleId: input.responsibleId ?? null,
        frequency: input.frequency,
        frequencyDays: input.frequencyDays,
        lastInspectionAt: input.lastInspectionAt ?? null,
        expiresAt: input.expiresAt ?? null,
        expiryLabel: input.expiresAt ? (input.expiryLabel ?? "Vencimiento") : null,
        status: input.status,
        ...schedule,
      },
      select: { id: true },
    });
    await audit(
      auditCtx(ctx),
      { action: "element.create", entityType: "Element", entityId: element.id, after: { ...input, ...schedule } },
      tx,
    );
    return element;
  });
}

/**
 * Si el elemento cambia de sede o zona y el código no se editó a mano, el
 * código se actualiza (PRO-EXT-023 → COM-EXT-023). El QR sigue siendo válido
 * (usa un token propio), pero la etiqueta impresa muestra el código viejo.
 */
async function recodeOnMove(input: ElementInput & { id: string }, before: { code: string; siteId: string; zoneId: string | null }) {
  if (input.code !== before.code) return input.code; // lo cambió el usuario: se respeta
  const siteChanged = input.siteId !== before.siteId;
  const zoneChanged = (input.zoneId ?? null) !== before.zoneId;
  if (!siteChanged && !zoneChanged) return input.code;
  const ids = [before.siteId, input.siteId];
  const zoneIds = [before.zoneId, input.zoneId].filter((z): z is string => Boolean(z));
  const [sites, zones] = await Promise.all([
    db.site.findMany({ where: { id: { in: ids } }, select: { id: true, code: true } }),
    db.zone.findMany({ where: { id: { in: zoneIds } }, select: { id: true, code: true } }),
  ]);
  const code = (list: { id: string; code: string }[], id: string | null | undefined) => list.find((x) => x.id === id)?.code ?? null;
  const proposed = recodeElement(input.code, {
    fromSite: siteChanged ? code(sites, before.siteId) : null,
    toSite: siteChanged ? code(sites, input.siteId) : null,
    fromZone: zoneChanged ? code(zones, before.zoneId) : null,
    toZone: zoneChanged ? code(zones, input.zoneId) : null,
  });
  if (proposed === input.code) return input.code;
  const taken = new Set(
    (await db.element.findMany({ where: { code: { startsWith: proposed }, id: { not: input.id } }, select: { code: true } })).map((e) => e.code),
  );
  return firstFreeCode(proposed, (c) => taken.has(c)).slice(0, 40);
}

export async function updateElement(input: ElementInput & { id: string }, ctx: ServiceContext): Promise<{ code: string; recoded: boolean }> {
  const current = await db.element.findFirst({
    where: { id: input.id, deletedAt: null },
    select: {
      code: true,
      elementTypeId: true,
      name: true,
      description: true,
      processId: true,
      siteId: true,
      zoneId: true,
      location: true,
      responsibleId: true,
      frequency: true,
      frequencyDays: true,
      lastInspectionAt: true,
      nextInspectionAt: true,
      expiresAt: true,
      expiryLabel: true,
      status: true,
      _count: { select: { inspections: true } },
    },
  });
  if (!current) throw new NotFoundError("El elemento no existe.");
  const { _count, ...before } = current;
  const hasInspections = _count.inspections > 0;

  if (hasInspections && input.elementTypeId !== before.elementTypeId) {
    throw new DomainError("El elemento ya tiene inspecciones; no se puede cambiar su tipo.");
  }
  // Solo el tipo actual puede estar inactivo (no se bloquea editar otros datos).
  await assertReferences(input, input.elementTypeId !== before.elementTypeId);

  // Con historial, la última inspección la determinan las inspecciones reales.
  const lastInspectionAt = hasInspections ? before.lastInspectionAt : (input.lastInspectionAt ?? null);
  const scheduleChanged =
    before.frequency !== input.frequency ||
    before.frequencyDays !== input.frequencyDays ||
    before.lastInspectionAt?.getTime() !== lastInspectionAt?.getTime() ||
    (!lastInspectionAt && input.firstInspectionAt !== undefined);

  const newCode = await recodeOnMove(input, before);
  const after = {
    code: newCode,
    elementTypeId: input.elementTypeId,
    name: input.name,
    description: input.description ?? null,
    processId: input.processId,
    siteId: input.siteId,
    zoneId: input.zoneId ?? null,
    location: input.location ?? null,
    responsibleId: input.responsibleId ?? null,
    frequency: input.frequency,
    frequencyDays: input.frequencyDays,
    lastInspectionAt,
    expiresAt: input.expiresAt ?? null,
    expiryLabel: input.expiresAt ? (input.expiryLabel ?? before.expiryLabel ?? "Vencimiento") : null,
    status: input.status,
    ...(scheduleChanged
      ? scheduleFields({
          lastInspectionAt,
          frequency: input.frequency,
          frequencyDays: input.frequencyDays,
          firstInspectionAt: input.firstInspectionAt ?? before.nextInspectionAt,
        })
      : {}),
  };
  const changes = diff(before as Record<string, unknown>, after);
  const recoded = newCode !== input.code;
  if (!changes.changed) return { code: newCode, recoded };

  await db.$transaction(async (tx) => {
    await tx.element.update({ where: { id: input.id }, data: after });
    await audit(
      auditCtx(ctx),
      { action: "element.update", entityType: "Element", entityId: input.id, before: changes.before, after: changes.after },
      tx,
    );
  });
  return { code: newCode, recoded };
}

/** Sugerencia de próximo código por tipo: EXT-001 → EXT-024 (máximo existente + 1). */
export async function suggestCodes(types: { id: string; codePrefix: string | null }[]) {
  const result: Record<string, string> = {};
  for (const type of types) {
    if (!type.codePrefix) continue;
    const prefix = `${type.codePrefix}-`;
    const codes = await db.element.findMany({
      where: { code: { startsWith: prefix } },
      select: { code: true },
    });
    const max = codes.reduce((acc, { code }) => {
      const n = Number.parseInt(code.slice(prefix.length), 10);
      return Number.isFinite(n) && n > acc ? n : acc;
    }, 0);
    result[type.id] = `${prefix}${String(max + 1).padStart(3, "0")}`;
  }
  return result;
}

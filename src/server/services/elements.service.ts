import "server-only";
import { firstFreeCode, nextSequentialCode, recodeElement, typeCodePrefix } from "@/lib/element-code";
import { randomBytes } from "node:crypto";
import { z } from "zod";
import { db } from "@/server/db";
import { Prisma } from "@/generated/prisma/client";
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

type Tx = Prisma.TransactionClient | typeof db;

/** Códigos existentes que empiezan por un prefijo (incluye eliminados: el código es único). */
async function codesStartingWith(prefix: string, tx: Tx = db) {
  const rows = await tx.element.findMany({ where: { code: { startsWith: prefix } }, select: { code: true } });
  return rows.map((r) => r.code);
}

/** Siguiente código SEDE-TIPO-NNN para la sede y el tipo indicados. */
export async function generateElementCode(siteId: string, elementTypeId: string, tx: Tx = db): Promise<string> {
  const [site, type] = await Promise.all([
    tx.site.findUniqueOrThrow({ where: { id: siteId }, select: { code: true } }),
    tx.elementType.findUniqueOrThrow({ where: { id: elementTypeId }, select: { code: true, codePrefix: true } }),
  ]);
  const prefix = typeCodePrefix(type);
  return nextSequentialCode(site.code, prefix, await codesStartingWith(`${site.code}-${prefix}-`.toUpperCase(), tx));
}

const isCodeConflict = (error: unknown) =>
  error instanceof Prisma.PrismaClientKnownRequestError &&
  error.code === "P2002" &&
  JSON.stringify(error.meta ?? {}).includes("code");

export async function createElement(input: ElementInput, ctx: ServiceContext) {
  // Dos personas creando a la vez pueden calcular el mismo consecutivo: se reintenta.
  for (let attempt = 0; ; attempt++) {
    try {
      return await createElementOnce(input, ctx);
    } catch (error) {
      if (attempt < 4 && isCodeConflict(error)) continue;
      throw error;
    }
  }
}

async function createElementOnce(input: ElementInput, ctx: ServiceContext) {
  await assertReferences(input, true);
  const schedule = scheduleFields({
    lastInspectionAt: input.lastInspectionAt ?? null,
    frequency: input.frequency,
    frequencyDays: input.frequencyDays,
    firstInspectionAt: input.firstInspectionAt ?? null,
  });
  return db.$transaction(async (tx) => {
    const code = await generateElementCode(input.siteId, input.elementTypeId, tx);
    const element = await tx.element.create({
      data: {
        code,
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
      select: { id: true, code: true },
    });
    await audit(
      auditCtx(ctx),
      { action: "element.create", entityType: "Element", entityId: element.id, after: { ...input, code, ...schedule } },
      tx,
    );
    return element;
  });
}

/**
 * El código no se edita a mano: si el elemento cambia de sede, zona o tipo,
 * se actualiza el segmento correspondiente (PRO-EXT-023 → COM-EXT-023). Si ese
 * código ya existe, se asigna el siguiente consecutivo de la nueva sede y tipo.
 * El QR sigue siendo válido (usa un token propio), pero la etiqueta impresa
 * muestra el código anterior.
 */
async function recodeOnMove(
  input: ElementInput & { id: string },
  before: { code: string; siteId: string; zoneId: string | null; elementTypeId: string },
) {
  const siteChanged = input.siteId !== before.siteId;
  const zoneChanged = (input.zoneId ?? null) !== before.zoneId;
  const typeChanged = input.elementTypeId !== before.elementTypeId;
  if (!siteChanged && !zoneChanged && !typeChanged) return before.code;
  const zoneIds = [before.zoneId, input.zoneId].filter((z): z is string => Boolean(z));
  const [sites, zones, types] = await Promise.all([
    db.site.findMany({ where: { id: { in: [before.siteId, input.siteId] } }, select: { id: true, code: true } }),
    db.zone.findMany({ where: { id: { in: zoneIds } }, select: { id: true, code: true } }),
    db.elementType.findMany({
      where: { id: { in: [before.elementTypeId, input.elementTypeId] } },
      select: { id: true, code: true, codePrefix: true },
    }),
  ]);
  const code = (list: { id: string; code: string }[], id: string | null | undefined) => list.find((x) => x.id === id)?.code ?? null;
  const prefix = (id: string) => {
    const t = types.find((x) => x.id === id);
    return t ? typeCodePrefix(t) : null;
  };
  const proposed = recodeElement(before.code, {
    fromSite: siteChanged ? code(sites, before.siteId) : null,
    toSite: siteChanged ? code(sites, input.siteId) : null,
    fromZone: zoneChanged ? code(zones, before.zoneId) : null,
    toZone: zoneChanged ? code(zones, input.zoneId) : null,
    fromType: typeChanged ? prefix(before.elementTypeId) : null,
    toType: typeChanged ? prefix(input.elementTypeId) : null,
  });
  if (proposed === before.code) return before.code;
  const taken = await db.element.findFirst({ where: { code: proposed, id: { not: input.id } }, select: { id: true } });
  if (!taken) return proposed;
  // Ocupado: siguiente consecutivo de la nueva sede y tipo (formato estándar), o sufijo -2.
  const siteCode = code(sites, input.siteId);
  const typePrefix = prefix(input.elementTypeId);
  if (siteCode && typePrefix && proposed.toUpperCase().startsWith(`${siteCode}-${typePrefix}-`.toUpperCase())) {
    return generateElementCode(input.siteId, input.elementTypeId);
  }
  const existing = new Set(await codesStartingWith(proposed));
  return firstFreeCode(proposed, (c) => existing.has(c)).slice(0, 40);
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
  const recoded = newCode !== before.code;
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


import "server-only";
import { z } from "zod";
import { db } from "@/server/db";
import { Prisma } from "@/generated/prisma/client";
import { audit } from "@/server/audit";
import { AuthorizationError, DomainError, NotFoundError, ValidationError } from "@/server/errors";
import { getReadScope, type CurrentUser } from "@/server/auth/current-user";
import { evaluateCompliance, normalizeAnswerValue } from "@/lib/inspection-rules";
import { computeInspectionResult } from "@/lib/inspection-result";
import { scheduleFields } from "@/lib/scheduling";
import { todayISO, zonedDayBoundary } from "@/lib/utils";
import { env } from "@/lib/env";
import { auditCtx, type ServiceContext } from "@/server/services/context";
import { scheduleWhere } from "@/server/services/elements.service";
import { paginated, paginationArgs } from "@/server/services/pagination";

/** Clave de la "zona" para elementos sin zona asignada. */
export const NO_ZONE = "sin-zona";

// ---------------------------------------------------------------------------
// Alcance de lectura
// ---------------------------------------------------------------------------

export function inspectionScopeWhere(user: CurrentUser): Prisma.InspectionWhereInput {
  const scope = getReadScope(user, "inspections");
  if (scope === "all") return {};
  if (scope === "process") return { processId: { in: user.processIds } };
  if (scope === "own") return { inspectorId: user.id };
  throw new AuthorizationError();
}

function assertCanPerform(user: CurrentUser) {
  if (!user.permissions.has("inspections.perform")) throw new AuthorizationError();
}

// ---------------------------------------------------------------------------
// Mis inspecciones: zonas y lista de trabajo
// ---------------------------------------------------------------------------

/**
 * Zonas con sus contadores de elementos activos (total, vencidos, próximos).
 * Cualquier brigadista puede inspeccionar cualquier zona.
 */
export async function listInspectionZones(user: CurrentUser, siteId?: string) {
  assertCanPerform(user);
  const now = new Date();
  const base: Prisma.ElementWhereInput = {
    deletedAt: null,
    status: "ACTIVE",
    site: { active: true, deletedAt: null },
    ...(siteId ? { siteId } : {}),
  };
  const count = (where: Prisma.ElementWhereInput) =>
    db.element.groupBy({ by: ["siteId", "zoneId"], where: { AND: [base, where] }, _count: { _all: true } });

  const [zones, totals, overdue, dueSoon] = await Promise.all([
    db.zone.findMany({
      where: { deletedAt: null, active: true, site: { active: true, deletedAt: null }, ...(siteId ? { siteId } : {}) },
      select: { id: true, name: true, code: true, site: { select: { id: true, name: true } } },
      orderBy: [{ site: { name: "asc" } }, { name: "asc" }],
    }),
    count({}),
    count(scheduleWhere("OVERDUE", now)),
    count(scheduleWhere("DUE_SOON", now)),
  ]);

  const key = (siteId: string, zoneId: string | null) => `${siteId}:${zoneId ?? NO_ZONE}`;
  const toMap = (rows: { siteId: string; zoneId: string | null; _count: { _all: number } }[]) =>
    new Map(rows.map((r) => [key(r.siteId, r.zoneId), r._count._all]));
  const [t, o, d] = [toMap(totals), toMap(overdue), toMap(dueSoon)];

  const result = zones.map((z) => ({
    key: z.id,
    zoneId: z.id as string | null,
    name: z.name,
    site: z.site,
    total: t.get(key(z.site.id, z.id)) ?? 0,
    overdue: o.get(key(z.site.id, z.id)) ?? 0,
    dueSoon: d.get(key(z.site.id, z.id)) ?? 0,
  }));

  // Elementos activos sin zona: una tarjeta por sede para que no queden fuera del recorrido.
  const sites = await db.site.findMany({
    where: { id: { in: totals.filter((r) => !r.zoneId).map((r) => r.siteId) } },
    select: { id: true, name: true },
  });
  for (const site of sites) {
    result.push({
      key: `${NO_ZONE}:${site.id}`,
      zoneId: null,
      name: "Sin zona asignada",
      site,
      total: t.get(key(site.id, null)) ?? 0,
      overdue: o.get(key(site.id, null)) ?? 0,
      dueSoon: d.get(key(site.id, null)) ?? 0,
    });
  }
  return result;
}

/** Elementos activos de una zona, del más urgente al menos urgente. */
export async function getZoneWorklist(user: CurrentUser, zoneId: string | null, siteId: string) {
  assertCanPerform(user);
  const zone = zoneId
    ? await db.zone.findFirst({
        where: { id: zoneId, deletedAt: null },
        select: { id: true, name: true, description: true, site: { select: { id: true, name: true } } },
      })
    : { id: null, name: "Sin zona asignada", description: null, site: await db.site.findUnique({ where: { id: siteId }, select: { id: true, name: true } }) };
  if (!zone || !zone.site) throw new NotFoundError("La zona no existe.");

  const elements = await db.element.findMany({
    where: { deletedAt: null, status: "ACTIVE", siteId: zone.site.id, zoneId: zone.id },
    orderBy: [{ nextInspectionAt: { sort: "asc", nulls: "first" } }, { code: "asc" }],
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
      elementType: { select: { name: true } },
      inspections: {
        where: { status: "IN_PROGRESS" },
        select: { id: true, inspectorId: true, startedAt: true, inspector: { select: { name: true } } },
      },
    },
  });

  return {
    zone,
    elements: elements.map(({ inspections, ...e }) => ({
      ...e,
      myInProgressId: inspections.find((i) => i.inspectorId === user.id)?.id ?? null,
      othersInProgress: inspections.filter((i) => i.inspectorId !== user.id).map((i) => i.inspector.name),
    })),
  };
}

export async function listMyInProgress(user: CurrentUser) {
  return db.inspection.findMany({
    where: { inspectorId: user.id, status: "IN_PROGRESS" },
    orderBy: { startedAt: "desc" },
    select: {
      id: true,
      number: true,
      startedAt: true,
      answeredCount: true,
      totalQuestions: true,
      element: { select: { code: true, name: true, zone: { select: { name: true } }, elementType: { select: { name: true } } } },
    },
  });
}

// ---------------------------------------------------------------------------
// Ejecución
// ---------------------------------------------------------------------------

async function activeTemplateWithQuestions(elementTypeId: string) {
  return db.inspectionTemplate.findFirst({
    where: { elementTypeId, status: "PUBLISHED" },
    orderBy: { version: "desc" },
    select: {
      id: true,
      questions: {
        where: { active: true, deletedAt: null },
        orderBy: { order: "asc" },
        select: {
          id: true,
          text: true,
          helpText: true,
          responseType: true,
          required: true,
          order: true,
          options: true,
          complianceRule: true,
          generatesFinding: true,
          defaultPriority: true,
        },
      },
    },
  });
}

/**
 * Inicia (o retoma) la inspección de un elemento. Si el brigadista ya tiene
 * una inspección en curso para ese elemento, se retoma la misma.
 */
export async function startInspection(elementId: string, ctx: ServiceContext) {
  assertCanPerform(ctx.user);
  const element = await db.element.findFirst({
    where: { id: elementId, deletedAt: null },
    select: { id: true, code: true, status: true, elementTypeId: true, processId: true, siteId: true, nextInspectionAt: true },
  });
  if (!element) throw new NotFoundError("El elemento no existe.");
  if (element.status !== "ACTIVE") throw new DomainError("Solo se pueden inspeccionar elementos activos.");

  const existing = await db.inspection.findFirst({
    where: { elementId, inspectorId: ctx.user.id, status: "IN_PROGRESS" },
    select: { id: true },
  });
  if (existing) return existing;

  const template = await activeTemplateWithQuestions(element.elementTypeId);
  if (!template || template.questions.length === 0) {
    throw new DomainError("Este tipo de elemento no tiene preguntas activas. Contacta al administrador.");
  }

  return db.$transaction(async (tx) => {
    const inspection = await tx.inspection.create({
      data: {
        elementId,
        templateId: template.id,
        inspectorId: ctx.user.id,
        processId: element.processId,
        siteId: element.siteId,
        dueDate: element.nextInspectionAt,
        totalQuestions: template.questions.length,
      },
      select: { id: true },
    });
    await audit(
      auditCtx(ctx),
      { action: "inspection.start", entityType: "Inspection", entityId: inspection.id, after: { elementId, code: element.code } },
      tx,
    );
    return inspection;
  });
}

/** Carga una inspección en curso del propio brigadista (o null si no puede ejecutarla). */
async function loadOwnInProgress(inspectionId: string, user: CurrentUser) {
  const inspection = await db.inspection.findFirst({
    where: { id: inspectionId },
    select: {
      id: true,
      status: true,
      inspectorId: true,
      templateId: true,
      element: { select: { id: true, elementTypeId: true, frequency: true, frequencyDays: true } },
    },
  });
  if (!inspection) throw new NotFoundError("La inspección no existe.");
  if (inspection.inspectorId !== user.id) throw new AuthorizationError("Solo quien inició la inspección puede modificarla.");
  if (inspection.status !== "IN_PROGRESS") throw new DomainError("La inspección ya fue finalizada o anulada.");
  return inspection;
}

export async function getInspectionForRunner(inspectionId: string, user: CurrentUser) {
  const inspection = await db.inspection.findFirst({
    where: { id: inspectionId, inspectorId: user.id, status: "IN_PROGRESS" },
    select: {
      id: true,
      number: true,
      notes: true,
      startedAt: true,
      templateId: true,
      element: {
        select: {
          id: true,
          code: true,
          name: true,
          location: true,
          responsibleId: true,
          elementType: { select: { id: true, name: true } },
          zone: { select: { id: true, name: true } },
          site: { select: { id: true, name: true } },
        },
      },
      answers: {
        select: {
          id: true,
          questionId: true,
          value: true,
          isCompliant: true,
          comment: true,
          evidences: { where: { deletedAt: null }, select: { id: true, fileName: true }, orderBy: { createdAt: "asc" } },
          findings: {
            select: {
              id: true,
              number: true,
              description: true,
              priority: true,
              requiredAction: true,
              dueDate: true,
              responsible: { select: { name: true } },
              evidences: { where: { deletedAt: null }, select: { id: true, fileName: true }, orderBy: { createdAt: "asc" } },
            },
          },
        },
      },
    },
  });
  if (!inspection) return null;
  const template = await activeTemplateWithQuestions(inspection.element.elementType.id);
  // Las preguntas se toman de la plantilla con la que se inició la inspección.
  const questions =
    template?.id === inspection.templateId
      ? template.questions
      : await db.inspectionQuestion.findMany({
          where: { templateId: inspection.templateId, active: true, deletedAt: null },
          orderBy: { order: "asc" },
          select: {
            id: true,
            text: true,
            helpText: true,
            responseType: true,
            required: true,
            order: true,
            options: true,
            complianceRule: true,
            generatesFinding: true,
            defaultPriority: true,
          },
        });
  return { ...inspection, questions };
}

export const saveAnswerSchema = z.object({
  inspectionId: z.string().min(1).max(64),
  questionId: z.string().min(1).max(64),
  value: z.union([z.string().max(2000), z.number(), z.array(z.string().max(100)).max(50), z.null()]),
  comment: z.string().trim().max(1000).nullable().optional(),
});

/**
 * Guarda (autoguardado) la respuesta de una pregunta: valida el valor según
 * el tipo, evalúa el cumplimiento en el servidor y guarda una copia de la
 * pregunta (snapshot) para el historial.
 */
export async function saveAnswer(input: z.infer<typeof saveAnswerSchema>, ctx: ServiceContext) {
  const inspection = await loadOwnInProgress(input.inspectionId, ctx.user);
  const question = await db.inspectionQuestion.findFirst({
    where: { id: input.questionId, templateId: inspection.templateId, deletedAt: null },
    select: { id: true, text: true, responseType: true, order: true, options: true, complianceRule: true },
  });
  if (!question) throw new NotFoundError("La pregunta no pertenece a esta inspección.");

  let value;
  try {
    value = normalizeAnswerValue(question, input.value);
  } catch (error) {
    throw new ValidationError({ value: [(error as Error).message] }, (error as Error).message);
  }
  const isCompliant = evaluateCompliance(question, value, todayISO(new Date(), env.APP_TIMEZONE));
  const jsonValue = value === null ? Prisma.DbNull : (value as Prisma.InputJsonValue);

  const answer = await db.$transaction(async (tx) => {
    const saved = await tx.inspectionAnswer.upsert({
      where: { inspectionId_questionId: { inspectionId: inspection.id, questionId: question.id } },
      create: {
        inspectionId: inspection.id,
        questionId: question.id,
        questionText: question.text,
        responseType: question.responseType,
        questionOrder: question.order,
        value: jsonValue,
        isCompliant,
        comment: input.comment ?? null,
      },
      update: {
        value: jsonValue,
        isCompliant,
        ...(input.comment !== undefined ? { comment: input.comment } : {}),
      },
      select: { id: true },
    });
    const answered = await tx.inspectionAnswer.count({
      where: { inspectionId: inspection.id, NOT: { value: { equals: Prisma.DbNull } } },
    });
    await tx.inspection.update({ where: { id: inspection.id }, data: { answeredCount: answered } });
    return saved;
  });
  return { answerId: answer.id, isCompliant };
}

/**
 * Asegura que exista la fila de respuesta (p.ej. para colgar fotos de una
 * pregunta de tipo Fotografía antes de responder otra cosa).
 */
export async function ensureAnswer(inspectionId: string, questionId: string, user: CurrentUser) {
  const inspection = await loadOwnInProgress(inspectionId, user);
  const question = await db.inspectionQuestion.findFirst({
    where: { id: questionId, templateId: inspection.templateId, deletedAt: null },
    select: { id: true, text: true, responseType: true, order: true },
  });
  if (!question) throw new NotFoundError("La pregunta no pertenece a esta inspección.");
  return db.inspectionAnswer.upsert({
    where: { inspectionId_questionId: { inspectionId, questionId } },
    create: {
      inspectionId,
      questionId,
      questionText: question.text,
      responseType: question.responseType,
      questionOrder: question.order,
    },
    update: {},
    select: { id: true },
  });
}

export async function finalizeInspection(inspectionId: string, notes: string | null, ctx: ServiceContext) {
  const inspection = await loadOwnInProgress(inspectionId, ctx.user);
  const [questions, answers] = await Promise.all([
    db.inspectionQuestion.findMany({
      where: { templateId: inspection.templateId, active: true, deletedAt: null },
      select: { id: true, required: true, responseType: true, text: true },
    }),
    db.inspectionAnswer.findMany({
      where: { inspectionId },
      select: { questionId: true, value: true, isCompliant: true, _count: { select: { evidences: { where: { deletedAt: null } } } } },
    }),
  ]);
  const photoCount = Object.fromEntries(answers.map((a) => [a.questionId, a._count.evidences]));
  const summary = computeInspectionResult(
    questions,
    answers.map((a) => ({ questionId: a.questionId, hasValue: a.value !== null, isCompliant: a.isCompliant })),
    photoCount,
  );
  if (summary.missingRequired.length > 0) {
    const pending = questions.filter((q) => summary.missingRequired.includes(q.id)).map((q) => q.text);
    throw new DomainError(`Faltan ${pending.length} pregunta(s) obligatoria(s): ${pending.slice(0, 3).join(" · ")}`);
  }

  const completedAt = new Date();
  const schedule = scheduleFields({
    lastInspectionAt: completedAt,
    frequency: inspection.element.frequency,
    frequencyDays: inspection.element.frequencyDays,
  });

  await db.$transaction(async (tx) => {
    await tx.inspection.update({
      where: { id: inspectionId },
      data: {
        status: "COMPLETED",
        completedAt,
        notes: notes || null,
        result: summary.result,
        totalQuestions: summary.totalQuestions,
        answeredCount: summary.answeredCount,
        compliantCount: summary.compliantCount,
        nonCompliantCount: summary.nonCompliantCount,
        compliancePct: summary.compliancePct,
      },
    });
    // La inspección reprograma el elemento con la lógica central.
    await tx.element.update({
      where: { id: inspection.element.id },
      data: { lastInspectionAt: completedAt, ...schedule },
    });
    await audit(
      auditCtx(ctx),
      {
        action: "inspection.complete",
        entityType: "Inspection",
        entityId: inspectionId,
        after: {
          result: summary.result,
          compliancePct: summary.compliancePct,
          nonCompliantCount: summary.nonCompliantCount,
          nextInspectionAt: schedule.nextInspectionAt,
        },
      },
      tx,
    );
  });
  return { ...summary, nextInspectionAt: schedule.nextInspectionAt };
}

export async function cancelInspection(inspectionId: string, ctx: ServiceContext) {
  await loadOwnInProgress(inspectionId, ctx.user);
  const findings = await db.finding.count({ where: { inspectionId } });
  if (findings > 0) {
    throw new DomainError("Elimina los hallazgos registrados en esta inspección antes de anularla.");
  }
  await db.$transaction(async (tx) => {
    await tx.inspection.update({ where: { id: inspectionId }, data: { status: "CANCELLED" } });
    await audit(auditCtx(ctx), { action: "inspection.cancel", entityType: "Inspection", entityId: inspectionId }, tx);
  });
}

// ---------------------------------------------------------------------------
// Consulta
// ---------------------------------------------------------------------------

export async function getInspectionDetail(inspectionId: string, user: CurrentUser) {
  const inspection = await db.inspection.findFirst({
    where: { AND: [{ id: inspectionId }, inspectionScopeWhere(user)] },
    select: {
      id: true,
      number: true,
      status: true,
      result: true,
      startedAt: true,
      completedAt: true,
      dueDate: true,
      notes: true,
      totalQuestions: true,
      answeredCount: true,
      compliantCount: true,
      nonCompliantCount: true,
      compliancePct: true,
      inspectorId: true,
      inspector: { select: { name: true } },
      process: { select: { name: true } },
      site: { select: { name: true } },
      element: {
        select: {
          id: true,
          code: true,
          name: true,
          location: true,
          nextInspectionAt: true,
          elementType: { select: { name: true } },
          zone: { select: { id: true, name: true } },
        },
      },
      answers: {
        orderBy: { questionOrder: "asc" },
        select: {
          id: true,
          questionText: true,
          responseType: true,
          value: true,
          isCompliant: true,
          comment: true,
          question: { select: { options: true, complianceRule: true } },
          evidences: { where: { deletedAt: null }, select: { id: true, fileName: true } },
        },
      },
      findings: {
        orderBy: { number: "asc" },
        select: {
          id: true,
          number: true,
          description: true,
          priority: true,
          status: true,
          dueDate: true,
          requiredAction: true,
          answerId: true,
          responsible: { select: { name: true } },
          evidences: { where: { deletedAt: null }, select: { id: true, fileName: true } },
        },
      },
    },
  });
  if (!inspection) throw new NotFoundError("La inspección no existe o no tienes acceso a ella.");
  return inspection;
}

export const inspectionListQuerySchema = z.object({
  q: z.string().trim().max(100).optional().catch(undefined),
  page: z.coerce.number().int().min(1).max(10_000).catch(1).default(1),
  site: z.string().max(64).optional().catch(undefined),
  process: z.string().max(64).optional().catch(undefined),
  result: z.enum(["COMPLIANT", "NON_COMPLIANT"]).optional().catch(undefined),
  status: z.enum(["IN_PROGRESS", "COMPLETED", "CANCELLED"]).optional().catch(undefined),
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().catch(undefined),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().catch(undefined),
});
export type InspectionListQuery = z.infer<typeof inspectionListQuerySchema>;

export async function listInspections(query: InspectionListQuery, user: CurrentUser) {
  const dateField = query.status === "IN_PROGRESS" ? "startedAt" : "completedAt";
  const where: Prisma.InspectionWhereInput = {
    AND: [
      inspectionScopeWhere(user),
      { status: query.status ?? "COMPLETED" },
      query.site ? { siteId: query.site } : {},
      query.process ? { processId: query.process } : {},
      query.result ? { result: query.result } : {},
      query.from ? { [dateField]: { gte: zonedDayBoundary(query.from, "start", env.APP_TIMEZONE) } } : {},
      query.to ? { [dateField]: { lte: zonedDayBoundary(query.to, "end", env.APP_TIMEZONE) } } : {},
      query.q
        ? {
            OR: [
              { element: { code: { contains: query.q, mode: "insensitive" } } },
              { element: { name: { contains: query.q, mode: "insensitive" } } },
              { inspector: { name: { contains: query.q, mode: "insensitive" } } },
            ],
          }
        : {},
    ],
  };
  const [items, total] = await db.$transaction([
    db.inspection.findMany({
      where,
      orderBy: [{ completedAt: { sort: "desc", nulls: "first" } }, { startedAt: "desc" }],
      select: {
        id: true,
        number: true,
        status: true,
        result: true,
        startedAt: true,
        completedAt: true,
        compliancePct: true,
        nonCompliantCount: true,
        inspector: { select: { name: true } },
        site: { select: { name: true } },
        process: { select: { name: true } },
        element: { select: { code: true, name: true, elementType: { select: { name: true } }, zone: { select: { name: true } } } },
      },
      ...paginationArgs(query.page),
    }),
    db.inspection.count({ where }),
  ]);
  return paginated(items, total, query.page);
}

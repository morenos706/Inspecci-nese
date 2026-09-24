import "server-only";
import { z } from "zod";
import { db } from "@/server/db";
import { Prisma } from "@/generated/prisma/client";
import { audit, diff } from "@/server/audit";
import { DomainError, NotFoundError } from "@/server/errors";
import type { ListQuery } from "@/lib/validation/admin";
import type { elementTypeSchema, questionSchema } from "@/lib/validation/config";
import { auditCtx, type ServiceContext } from "@/server/services/context";
import { activeFilter, paginated, paginationArgs } from "@/server/services/pagination";

type ElementTypeInput = z.infer<typeof elementTypeSchema>;
type QuestionInput = z.infer<typeof questionSchema>;
type Tx = Prisma.TransactionClient;

// ---------------------------------------------------------------------------
// Tipos de elemento
// ---------------------------------------------------------------------------

export async function listElementTypes(query: ListQuery) {
  const where: Prisma.ElementTypeWhereInput = {
    deletedAt: null,
    ...activeFilter(query.status),
    ...(query.q
      ? {
          OR: [
            { name: { contains: query.q, mode: "insensitive" } },
            { code: { contains: query.q, mode: "insensitive" } },
          ],
        }
      : {}),
  };
  const [items, total] = await db.$transaction([
    db.elementType.findMany({
      where,
      orderBy: { name: "asc" },
      select: {
        id: true,
        code: true,
        name: true,
        codePrefix: true,
        defaultFrequency: true,
        defaultFrequencyDays: true,
        active: true,
        _count: { select: { elements: { where: { deletedAt: null } } } },
        templates: {
          where: { status: "PUBLISHED" },
          select: { _count: { select: { questions: { where: { deletedAt: null, active: true } } } } },
        },
      },
      ...paginationArgs(query.page),
    }),
    db.elementType.count({ where }),
  ]);
  return paginated(
    items.map(({ templates, ...t }) => ({ ...t, questionCount: templates[0]?._count.questions ?? 0 })),
    total,
    query.page,
  );
}

/** Tipos activos para selects (con valores por defecto para precargar el formulario de elementos). */
export async function listElementTypeOptions() {
  return db.elementType.findMany({
    where: { deletedAt: null, active: true },
    select: { id: true, name: true, codePrefix: true, defaultFrequency: true, defaultFrequencyDays: true },
    orderBy: { name: "asc" },
  });
}

/**
 * Plantilla publicada del tipo. En el MVP hay una por tipo; si no existe se
 * crea (v1). El versionado queda disponible para cambios mayores futuros.
 */
export async function getOrCreateActiveTemplate(elementTypeId: string, tx: Tx | typeof db = db) {
  const existing = await tx.inspectionTemplate.findFirst({
    where: { elementTypeId, status: "PUBLISHED" },
    orderBy: { version: "desc" },
    select: { id: true, version: true },
  });
  if (existing) return existing;
  const type = await tx.elementType.findUniqueOrThrow({ where: { id: elementTypeId }, select: { name: true } });
  const last = await tx.inspectionTemplate.findFirst({
    where: { elementTypeId },
    orderBy: { version: "desc" },
    select: { version: true },
  });
  return tx.inspectionTemplate.create({
    data: {
      elementTypeId,
      version: (last?.version ?? 0) + 1,
      name: `Inspección de ${type.name.toLowerCase()}`,
      status: "PUBLISHED",
      publishedAt: new Date(),
    },
    select: { id: true, version: true },
  });
}

export async function getElementType(id: string) {
  const type = await db.elementType.findFirst({
    where: { id, deletedAt: null },
    select: {
      id: true,
      code: true,
      name: true,
      description: true,
      codePrefix: true,
      defaultFrequency: true,
      defaultFrequencyDays: true,
      active: true,
      updatedAt: true,
      _count: { select: { elements: { where: { deletedAt: null } } } },
    },
  });
  if (!type) throw new NotFoundError("El tipo de elemento no existe.");
  const template = await getOrCreateActiveTemplate(id);
  const questions = await db.inspectionQuestion.findMany({
    where: { templateId: template.id, deletedAt: null },
    orderBy: { order: "asc" },
    select: {
      id: true,
      text: true,
      helpText: true,
      responseType: true,
      required: true,
      active: true,
      order: true,
      options: true,
      complianceRule: true,
      generatesFinding: true,
      defaultPriority: true,
      tracksExpiry: true,
      _count: { select: { answers: true } },
    },
  });
  return { ...type, template, questions };
}

export async function createElementType(input: ElementTypeInput, ctx: ServiceContext) {
  return db.$transaction(async (tx) => {
    const type = await tx.elementType.create({
      data: {
        code: input.code,
        name: input.name,
        description: input.description ?? null,
        codePrefix: input.codePrefix || null,
        defaultFrequency: input.defaultFrequency,
        defaultFrequencyDays: input.defaultFrequencyDays ?? null,
        active: input.active,
      },
      select: { id: true },
    });
    await getOrCreateActiveTemplate(type.id, tx);
    await audit(auditCtx(ctx), { action: "element_type.create", entityType: "ElementType", entityId: type.id, after: input }, tx);
    return type;
  });
}

export async function updateElementType(input: ElementTypeInput & { id: string }, ctx: ServiceContext) {
  const current = await db.elementType.findFirst({
    where: { id: input.id, deletedAt: null },
    select: {
      code: true,
      name: true,
      description: true,
      codePrefix: true,
      defaultFrequency: true,
      defaultFrequencyDays: true,
      active: true,
    },
  });
  if (!current) throw new NotFoundError("El tipo de elemento no existe.");
  const changes = diff(current, {
    code: input.code,
    name: input.name,
    description: input.description ?? null,
    codePrefix: input.codePrefix || null,
    defaultFrequency: input.defaultFrequency,
    defaultFrequencyDays: input.defaultFrequencyDays ?? null,
    active: input.active,
  });
  if (!changes.changed) return;
  await db.$transaction(async (tx) => {
    await tx.elementType.update({ where: { id: input.id }, data: changes.after });
    await audit(
      auditCtx(ctx),
      { action: "element_type.update", entityType: "ElementType", entityId: input.id, before: changes.before, after: changes.after },
      tx,
    );
  });
}

// ---------------------------------------------------------------------------
// Preguntas
// ---------------------------------------------------------------------------

function questionData(input: QuestionInput) {
  return {
    text: input.text,
    helpText: input.helpText,
    responseType: input.responseType,
    required: input.required,
    active: input.active,
    generatesFinding: input.generatesFinding,
    defaultPriority: input.defaultPriority,
    tracksExpiry: input.tracksExpiry,
    options: (input.options ?? null) as Prisma.InputJsonValue | null,
    complianceRule: (input.complianceRule ?? null) as Prisma.InputJsonValue | null,
  };
}

// Prisma distingue JSON null de "sin valor": se traduce aquí.
function jsonOrNull(value: Prisma.InputJsonValue | null) {
  return value === null ? Prisma.DbNull : value;
}

export async function saveQuestion(input: QuestionInput, ctx: ServiceContext) {
  const type = await db.elementType.findFirst({ where: { id: input.elementTypeId, deletedAt: null }, select: { id: true } });
  if (!type) throw new NotFoundError("El tipo de elemento no existe.");
  const data = questionData(input);

  if (!input.id) {
    return db.$transaction(async (tx) => {
      const template = await getOrCreateActiveTemplate(input.elementTypeId, tx);
      const last = await tx.inspectionQuestion.aggregate({
        where: { templateId: template.id, deletedAt: null },
        _max: { order: true },
      });
      const question = await tx.inspectionQuestion.create({
        data: {
          ...data,
          options: jsonOrNull(data.options),
          complianceRule: jsonOrNull(data.complianceRule),
          templateId: template.id,
          order: (last._max.order ?? 0) + 1,
        },
        select: { id: true },
      });
      await audit(
        auditCtx(ctx),
        { action: "question.create", entityType: "InspectionQuestion", entityId: question.id, after: { elementTypeId: input.elementTypeId, ...data } },
        tx,
      );
      return question;
    });
  }

  const current = await db.inspectionQuestion.findFirst({
    where: { id: input.id, deletedAt: null, template: { elementTypeId: input.elementTypeId } },
    select: {
      text: true,
      helpText: true,
      responseType: true,
      required: true,
      active: true,
      generatesFinding: true,
      defaultPriority: true,
      tracksExpiry: true,
      options: true,
      complianceRule: true,
      _count: { select: { answers: true } },
    },
  });
  if (!current) throw new NotFoundError("La pregunta no existe.");
  const { _count, ...before } = current;
  // Cambiar el tipo de respuesta de una pregunta ya respondida rompería la
  // comparación histórica: se debe crear una pregunta nueva.
  if (_count.answers > 0 && before.responseType !== data.responseType) {
    throw new DomainError(
      "Esta pregunta ya tiene respuestas registradas; no se puede cambiar su tipo. Desactívala y crea una nueva.",
    );
  }
  const changes = diff(before as Record<string, unknown>, data as Record<string, unknown>);
  if (!changes.changed) return { id: input.id };

  await db.$transaction(async (tx) => {
    await tx.inspectionQuestion.update({
      where: { id: input.id },
      data: { ...data, options: jsonOrNull(data.options), complianceRule: jsonOrNull(data.complianceRule) },
    });
    await audit(
      auditCtx(ctx),
      { action: "question.update", entityType: "InspectionQuestion", entityId: input.id, before: changes.before, after: changes.after },
      tx,
    );
  });
  return { id: input.id };
}

/** Intercambia el orden con la pregunta vecina (arriba / abajo). */
export async function moveQuestion(questionId: string, direction: "up" | "down", ctx: ServiceContext) {
  const question = await db.inspectionQuestion.findFirst({
    where: { id: questionId, deletedAt: null },
    select: { id: true, templateId: true, order: true, template: { select: { elementTypeId: true } } },
  });
  if (!question) throw new NotFoundError("La pregunta no existe.");
  const neighbor = await db.inspectionQuestion.findFirst({
    where: {
      templateId: question.templateId,
      deletedAt: null,
      order: direction === "up" ? { lt: question.order } : { gt: question.order },
    },
    orderBy: { order: direction === "up" ? "desc" : "asc" },
    select: { id: true, order: true },
  });
  if (!neighbor) return question.template.elementTypeId;

  await db.$transaction(async (tx) => {
    await tx.inspectionQuestion.update({ where: { id: question.id }, data: { order: neighbor.order } });
    await tx.inspectionQuestion.update({ where: { id: neighbor.id }, data: { order: question.order } });
    await audit(
      auditCtx(ctx),
      {
        action: "question.reorder",
        entityType: "InspectionQuestion",
        entityId: question.id,
        before: { order: question.order },
        after: { order: neighbor.order },
      },
      tx,
    );
  });
  return question.template.elementTypeId;
}

/**
 * Borrado lógico: la pregunta deja de aparecer en nuevas inspecciones. Las
 * respuestas históricas se conservan (guardan copia del texto de la pregunta).
 */
export async function deleteQuestion(questionId: string, ctx: ServiceContext) {
  const question = await db.inspectionQuestion.findFirst({
    where: { id: questionId, deletedAt: null },
    select: { id: true, text: true, template: { select: { elementTypeId: true } } },
  });
  if (!question) throw new NotFoundError("La pregunta no existe.");
  await db.$transaction(async (tx) => {
    await tx.inspectionQuestion.update({ where: { id: questionId }, data: { deletedAt: new Date(), active: false } });
    await audit(
      auditCtx(ctx),
      { action: "question.delete", entityType: "InspectionQuestion", entityId: questionId, before: { text: question.text } },
      tx,
    );
  });
  return question.template.elementTypeId;
}

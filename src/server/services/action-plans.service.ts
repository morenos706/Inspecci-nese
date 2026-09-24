import "server-only";
import { z } from "zod";
import { db } from "@/server/db";
import type { Prisma, WorkflowStatus } from "@/generated/prisma/client";
import { audit } from "@/server/audit";
import { AuthorizationError, DomainError, NotFoundError, ValidationError } from "@/server/errors";
import { getReadScope, type CurrentUser } from "@/server/auth/current-user";
import { env } from "@/lib/env";
import { expiryDateFromISO } from "@/lib/expiry";
import { formatDate, formatNumber, todayISO } from "@/lib/utils";
import { canPerform, deriveFindingStatus, WORKFLOW_ACTIONS, type WorkflowAction, type WorkflowActor } from "@/lib/workflow";
import { auditCtx, type ServiceContext } from "@/server/services/context";
import { dueDateFromISO } from "@/server/services/findings.service";
import { notify, usersWithPermissionInProcess } from "@/server/services/notifications.service";
import { paginated, paginationArgs } from "@/server/services/pagination";

type Tx = Prisma.TransactionClient;

// ---------------------------------------------------------------------------
// Alcance
// ---------------------------------------------------------------------------

export function actionPlanScopeWhere(user: CurrentUser): Prisma.ActionPlanWhereInput {
  const scope = getReadScope(user, "actions");
  if (scope === "all") return {};
  if (scope === "process") return { finding: { processId: { in: user.processIds } } };
  if (scope === "assigned") return { responsibleId: user.id };
  throw new AuthorizationError();
}

/** ¿El usuario gestiona (actions.manage) planes del proceso indicado? */
export function managesProcess(user: CurrentUser, processId: string): boolean {
  if (!user.permissions.has("actions.manage")) return false;
  const scope = getReadScope(user, "actions");
  return scope === "all" || (scope === "process" && user.processIds.includes(processId));
}

export function workflowActor(user: CurrentUser, processId: string): WorkflowActor {
  return { userId: user.id, permissions: user.permissions, managesInScope: managesProcess(user, processId) };
}

/** Un plan es de vencimiento si su hallazgo es automático por vencimiento o viene de una pregunta de vencimiento. */
function isExpiryPlan(finding: { source: string; question: { tracksExpiry: boolean } | null }) {
  return finding.source === "EXPIRY" || Boolean(finding.question?.tracksExpiry);
}

// ---------------------------------------------------------------------------
// Consulta
// ---------------------------------------------------------------------------

export const actionPlanListQuerySchema = z.object({
  q: z.string().trim().max(100).optional().catch(undefined),
  page: z.coerce.number().int().min(1).max(10_000).catch(1).default(1),
  view: z.enum(["mine", "all"]).catch("mine").default("mine"),
  status: z.enum(["open", "PENDING", "IN_PROGRESS", "SOLVED", "VERIFIED", "CLOSED", "all"]).catch("open").default("open"),
  overdue: z.enum(["1"]).optional().catch(undefined),
  priority: z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]).optional().catch(undefined),
  process: z.string().max(64).optional().catch(undefined),
});
export type ActionPlanListQuery = z.infer<typeof actionPlanListQuerySchema>;

const OPEN_STATUSES: WorkflowStatus[] = ["PENDING", "IN_PROGRESS", "SOLVED", "VERIFIED"];

export async function listActionPlans(query: ActionPlanListQuery, user: CurrentUser) {
  const today = todayISO(new Date(), env.APP_TIMEZONE);
  const where: Prisma.ActionPlanWhereInput = {
    AND: [
      actionPlanScopeWhere(user),
      query.view === "mine" ? { responsibleId: user.id } : {},
      query.status === "open"
        ? { status: { in: OPEN_STATUSES } }
        : query.status === "all"
          ? {}
          : { status: query.status },
      query.overdue ? { status: { in: ["PENDING", "IN_PROGRESS"] }, dueDate: { lt: dueDateFromISO(today) } } : {},
      query.priority ? { finding: { priority: query.priority } } : {},
      query.process ? { finding: { processId: query.process } } : {},
      query.q
        ? {
            OR: [
              { action: { contains: query.q, mode: "insensitive" } },
              { finding: { element: { code: { contains: query.q, mode: "insensitive" } } } },
              { finding: { description: { contains: query.q, mode: "insensitive" } } },
            ],
          }
        : {},
    ],
  };
  const [items, total] = await db.$transaction([
    db.actionPlan.findMany({
      where,
      orderBy: [{ dueDate: "asc" }, { number: "asc" }],
      select: {
        id: true,
        number: true,
        action: true,
        status: true,
        dueDate: true,
        responsible: { select: { name: true } },
        finding: {
          select: {
            number: true,
            priority: true,
            source: true,
            element: { select: { code: true, elementType: { select: { name: true } } } },
            process: { select: { name: true } },
          },
        },
      },
      ...paginationArgs(query.page),
    }),
    db.actionPlan.count({ where }),
  ]);
  return { ...paginated(items, total, query.page), today };
}

/** Contadores para el Inicio: planes asignados al usuario. */
export async function myActionPlanSummary(user: CurrentUser) {
  const today = dueDateFromISO(todayISO(new Date(), env.APP_TIMEZONE));
  const [open, overdue, toVerify] = await db.$transaction([
    db.actionPlan.count({ where: { responsibleId: user.id, status: { in: ["PENDING", "IN_PROGRESS"] } } }),
    db.actionPlan.count({ where: { responsibleId: user.id, status: { in: ["PENDING", "IN_PROGRESS"] }, dueDate: { lt: today } } }),
    user.permissions.has("actions.verify")
      ? db.actionPlan.count({
          where: { AND: [actionPlanScopeWhere(user), { status: "SOLVED", NOT: { solvedById: user.id } }] },
        })
      : db.actionPlan.count({ where: { id: "__none__" } }),
  ]);
  return { open, overdue, toVerify };
}

export async function getActionPlan(id: string, user: CurrentUser) {
  const plan = await db.actionPlan.findFirst({
    where: { AND: [{ id }, actionPlanScopeWhere(user)] },
    select: {
      id: true,
      number: true,
      action: true,
      status: true,
      dueDate: true,
      observations: true,
      createdAt: true,
      solvedAt: true,
      verifiedAt: true,
      closedAt: true,
      responsibleId: true,
      solvedById: true,
      responsible: { select: { id: true, name: true, jobTitle: true } },
      createdBy: { select: { name: true } },
      solvedBy: { select: { name: true } },
      verifiedBy: { select: { name: true } },
      closedBy: { select: { name: true } },
      finding: {
        select: {
          id: true,
          number: true,
          description: true,
          priority: true,
          status: true,
          source: true,
          processId: true,
          question: { select: { tracksExpiry: true } },
          inspection: { select: { id: true, number: true } },
          element: {
            select: {
              id: true,
              code: true,
              name: true,
              location: true,
              expiresAt: true,
              expiryLabel: true,
              elementType: { select: { name: true } },
              zone: { select: { name: true } },
              site: { select: { name: true } },
            },
          },
          evidences: { where: { deletedAt: null }, select: { id: true, fileName: true, mimeType: true } },
        },
      },
      events: {
        orderBy: { createdAt: "asc" },
        select: { id: true, fromStatus: true, toStatus: true, comment: true, createdAt: true, user: { select: { name: true } } },
      },
      evidences: {
        where: { deletedAt: null },
        orderBy: { createdAt: "asc" },
        select: { id: true, fileName: true, mimeType: true, uploadedBy: { select: { name: true } } },
      },
    },
  });
  if (!plan) throw new NotFoundError("El plan de acción no existe o no tienes acceso a él.");
  return { ...plan, isExpiry: isExpiryPlan(plan.finding) };
}

// ---------------------------------------------------------------------------
// Estado del hallazgo derivado de sus planes
// ---------------------------------------------------------------------------

export async function syncFindingStatus(findingId: string, actorId: string | null, tx: Tx) {
  const [finding, plans] = await Promise.all([
    tx.finding.findUniqueOrThrow({ where: { id: findingId }, select: { status: true } }),
    tx.actionPlan.findMany({ where: { findingId }, select: { status: true } }),
  ]);
  const status = deriveFindingStatus(plans.map((p) => p.status));
  if (status === finding.status) return status;
  const now = new Date();
  await tx.finding.update({
    where: { id: findingId },
    data: {
      status,
      solvedAt: ["SOLVED", "VERIFIED", "CLOSED"].includes(status) ? now : null,
      verifiedAt: ["VERIFIED", "CLOSED"].includes(status) ? now : null,
      verifiedById: ["VERIFIED", "CLOSED"].includes(status) ? actorId : null,
      closedAt: status === "CLOSED" ? now : null,
      closedById: status === "CLOSED" ? actorId : null,
    },
  });
  return status;
}

// ---------------------------------------------------------------------------
// Cambios de estado
// ---------------------------------------------------------------------------

export const transitionSchema = z.object({
  planId: z.string().min(1).max(64),
  action: z.enum(["start", "solve", "verify", "reject", "close"]),
  comment: z.string().trim().max(2000).optional(),
  newExpiryDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha inválida")
    .optional(),
});

export async function transitionActionPlan(input: z.infer<typeof transitionSchema>, ctx: ServiceContext) {
  const plan = await getActionPlan(input.planId, ctx.user);
  const action = input.action as WorkflowAction;
  const def = WORKFLOW_ACTIONS[action];
  const check = canPerform(action, plan, workflowActor(ctx.user, plan.finding.processId));
  if (!check.allowed) throw new DomainError(check.reason);

  if (def.requiresComment && !input.comment) {
    throw new ValidationError({ comment: [action === "reject" ? "Explica por qué se devuelve" : "Describe lo que se hizo"] });
  }
  const today = todayISO(new Date(), env.APP_TIMEZONE);
  if (action === "solve") {
    if (plan.evidences.length === 0) throw new DomainError("Adjunta al menos una evidencia (foto o PDF) de la solución.");
    if (plan.isExpiry) {
      if (!input.newExpiryDate) throw new ValidationError({ newExpiryDate: ["Registra la nueva fecha de vencimiento"] });
      if (input.newExpiryDate <= today) {
        throw new ValidationError({ newExpiryDate: ["La nueva fecha de vencimiento debe ser posterior a hoy"] });
      }
    }
  }

  const now = new Date();
  const data: Prisma.ActionPlanUpdateInput = { status: def.to };
  if (action === "solve") Object.assign(data, { solvedAt: now, solvedBy: { connect: { id: ctx.user.id } } });
  if (action === "reject") Object.assign(data, { solvedAt: null, solvedBy: { disconnect: true } });
  if (action === "verify") Object.assign(data, { verifiedAt: now, verifiedBy: { connect: { id: ctx.user.id } } });
  if (action === "close") Object.assign(data, { closedAt: now, closedBy: { connect: { id: ctx.user.id } } });

  const findingStatus = await db.$transaction(async (tx) => {
    await tx.actionPlan.update({ where: { id: plan.id }, data });
    await tx.actionPlanEvent.create({
      data: {
        actionPlanId: plan.id,
        userId: ctx.user.id,
        fromStatus: plan.status,
        toStatus: def.to,
        comment: input.comment || null,
      },
    });
    // La solución de un vencimiento actualiza la fecha del elemento (apaga la alerta).
    if (action === "solve" && plan.isExpiry && input.newExpiryDate) {
      await tx.element.update({
        where: { id: plan.finding.element.id },
        data: { expiresAt: expiryDateFromISO(input.newExpiryDate) },
      });
    }
    const status = await syncFindingStatus(plan.finding.id, ctx.user.id, tx);
    await audit(
      auditCtx(ctx),
      {
        action: `action_plan.${action}`,
        entityType: "ActionPlan",
        entityId: plan.id,
        before: { status: plan.status },
        after: { status: def.to, comment: input.comment, newExpiryDate: input.newExpiryDate, findingStatus: status },
      },
      tx,
    );
    if (action === "solve") {
      await notify(
        {
          userIds: await usersWithPermissionInProcess("actions.verify", plan.finding.processId, "actions.read.all", tx),
          excludeUserId: ctx.user.id,
          type: "action_plan.solved",
          title: `Plan ${formatNumber(plan.number)} listo para verificar`,
          body: `${plan.finding.element.code}: ${input.comment ?? "Se registró la solución."}`,
          link: `/action-plans/${plan.id}`,
        },
        tx,
      );
    }
    if (action === "verify" || action === "close") {
      await notify(
        {
          userIds: [plan.responsibleId],
          excludeUserId: ctx.user.id,
          type: action === "verify" ? "action_plan.verified" : "action_plan.closed",
          title: `Plan ${formatNumber(plan.number)} ${action === "verify" ? "verificado" : "cerrado"}`,
          body: input.comment || (action === "verify" ? "La solución fue aprobada." : "El plan quedó cerrado."),
          link: `/action-plans/${plan.id}`,
        },
        tx,
      );
    }
    if (action === "reject") {
      await notify(
        {
          userIds: [plan.responsibleId],
          type: "action_plan.rejected",
          title: `Plan ${formatNumber(plan.number)} devuelto`,
          body: input.comment ?? "La solución no fue aprobada.",
          link: `/action-plans/${plan.id}`,
        },
        tx,
      );
    }
    return status;
  });
  return { status: def.to, findingStatus };
}

export async function addPlanComment(planId: string, comment: string, ctx: ServiceContext) {
  const plan = await getActionPlan(planId, ctx.user);
  if (plan.status === "CLOSED") throw new DomainError("El plan está cerrado.");
  await db.$transaction(async (tx) => {
    await tx.actionPlanEvent.create({ data: { actionPlanId: plan.id, userId: ctx.user.id, comment } });
    await audit(auditCtx(ctx), { action: "action_plan.comment", entityType: "ActionPlan", entityId: plan.id, after: { comment } }, tx);
  });
}

// ---------------------------------------------------------------------------
// Gestión (actions.manage): reasignar y crear planes adicionales
// ---------------------------------------------------------------------------

export const planEditSchema = z.object({
  action: z.string().trim().min(5, "Describe la acción (mínimo 5 caracteres)").max(1000),
  responsibleId: z.string({ error: "Selecciona el responsable" }).min(1, "Selecciona el responsable").max(64),
  dueDate: z.string({ error: "Indica la fecha límite" }).regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha inválida"),
});

async function assertResponsible(userId: string) {
  const ok = await db.user.findFirst({ where: { id: userId, active: true, deletedAt: null }, select: { id: true } });
  if (!ok) throw new ValidationError({ responsibleId: ["Responsable inválido o inactivo"] });
}

export async function updateActionPlan(planId: string, input: z.infer<typeof planEditSchema>, ctx: ServiceContext) {
  const plan = await getActionPlan(planId, ctx.user);
  if (!managesProcess(ctx.user, plan.finding.processId)) throw new AuthorizationError();
  if (plan.status === "CLOSED" || plan.status === "VERIFIED") throw new DomainError("El plan ya fue verificado o cerrado.");
  await assertResponsible(input.responsibleId);
  const reassigned = input.responsibleId !== plan.responsibleId;
  await db.$transaction(async (tx) => {
    await tx.actionPlan.update({
      where: { id: planId },
      data: { action: input.action, responsibleId: input.responsibleId, dueDate: dueDateFromISO(input.dueDate) },
    });
    await tx.actionPlanEvent.create({
      data: {
        actionPlanId: planId,
        userId: ctx.user.id,
        comment: reassigned ? "Plan reasignado / actualizado" : "Plan actualizado",
      },
    });
    await audit(
      auditCtx(ctx),
      {
        action: "action_plan.update",
        entityType: "ActionPlan",
        entityId: planId,
        before: { action: plan.action, responsibleId: plan.responsibleId, dueDate: plan.dueDate },
        after: input,
      },
      tx,
    );
    if (reassigned) {
      await notify(
        {
          userIds: [input.responsibleId],
          type: "action_plan.assigned",
          title: `Se te asignó el plan ${formatNumber(plan.number)}`,
          body: `${input.action} · Fecha límite ${formatDate(dueDateFromISO(input.dueDate))}`,
          link: `/action-plans/${planId}`,
        },
        tx,
      );
    }
  });
}

export async function createActionPlan(findingId: string, input: z.infer<typeof planEditSchema>, ctx: ServiceContext) {
  const finding = await db.finding.findFirst({ where: { id: findingId }, select: { id: true, processId: true, status: true } });
  if (!finding) throw new NotFoundError("El hallazgo no existe.");
  if (!managesProcess(ctx.user, finding.processId)) throw new AuthorizationError();
  if (finding.status === "CLOSED") throw new DomainError("El hallazgo está cerrado.");
  await assertResponsible(input.responsibleId);
  return db.$transaction(async (tx) => {
    const plan = await tx.actionPlan.create({
      data: {
        findingId,
        action: input.action,
        responsibleId: input.responsibleId,
        dueDate: dueDateFromISO(input.dueDate),
        createdById: ctx.user.id,
      },
      select: { id: true, number: true },
    });
    await tx.actionPlanEvent.create({ data: { actionPlanId: plan.id, userId: ctx.user.id, toStatus: "PENDING", comment: "Plan creado" } });
    await syncFindingStatus(findingId, ctx.user.id, tx);
    await audit(auditCtx(ctx), { action: "action_plan.create", entityType: "ActionPlan", entityId: plan.id, after: { findingId, ...input } }, tx);
    await notify(
      {
        userIds: [input.responsibleId],
        type: "action_plan.assigned",
        title: `Se te asignó el plan ${formatNumber(plan.number)}`,
        body: `${input.action} · Fecha límite ${formatDate(dueDateFromISO(input.dueDate))}`,
        link: `/action-plans/${plan.id}`,
      },
      tx,
    );
    return plan;
  });
}

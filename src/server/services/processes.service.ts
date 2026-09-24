import "server-only";
import { z } from "zod";
import { db } from "@/server/db";
import type { Prisma } from "@/generated/prisma/client";
import { audit, diff } from "@/server/audit";
import { NotFoundError } from "@/server/errors";
import type { ListQuery, processSchema } from "@/lib/validation/admin";
import { auditCtx, type ServiceContext } from "@/server/services/context";
import { activeFilter, paginated, paginationArgs } from "@/server/services/pagination";

type ProcessInput = z.infer<typeof processSchema>;

export async function listProcesses(query: ListQuery) {
  const where: Prisma.ProcessWhereInput = {
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
    db.process.findMany({
      where,
      orderBy: { name: "asc" },
      select: {
        id: true,
        code: true,
        name: true,
        description: true,
        active: true,
        _count: { select: { elements: { where: { deletedAt: null } }, users: true } },
      },
      ...paginationArgs(query.page),
    }),
    db.process.count({ where }),
  ]);
  return paginated(items, total, query.page);
}

export async function listProcessOptions() {
  return db.process.findMany({
    where: { deletedAt: null, active: true },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });
}

export async function getProcess(id: string) {
  const process = await db.process.findFirst({
    where: { id, deletedAt: null },
    select: { id: true, code: true, name: true, description: true, active: true, createdAt: true, updatedAt: true },
  });
  if (!process) throw new NotFoundError("El proceso no existe.");
  return process;
}

export async function createProcess(input: ProcessInput, ctx: ServiceContext) {
  return db.$transaction(async (tx) => {
    const process = await tx.process.create({
      data: { code: input.code, name: input.name, description: input.description ?? null, active: input.active },
      select: { id: true },
    });
    await audit(auditCtx(ctx), { action: "process.create", entityType: "Process", entityId: process.id, after: input }, tx);
    return process;
  });
}

export async function updateProcess(input: ProcessInput & { id: string }, ctx: ServiceContext) {
  const current = await getProcess(input.id);
  const changes = diff(
    { code: current.code, name: current.name, description: current.description, active: current.active },
    { code: input.code, name: input.name, description: input.description ?? null, active: input.active },
  );
  if (!changes.changed) return;
  await db.$transaction(async (tx) => {
    await tx.process.update({ where: { id: input.id }, data: changes.after });
    await audit(
      auditCtx(ctx),
      { action: "process.update", entityType: "Process", entityId: input.id, before: changes.before, after: changes.after },
      tx,
    );
  });
}

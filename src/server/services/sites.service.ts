import "server-only";
import { z } from "zod";
import { db } from "@/server/db";
import type { Prisma } from "@/generated/prisma/client";
import { audit, diff } from "@/server/audit";
import { NotFoundError } from "@/server/errors";
import type { zoneSchema, ListQuery, siteSchema } from "@/lib/validation/admin";
import { auditCtx, type ServiceContext } from "@/server/services/context";
import { activeFilter, paginated, paginationArgs } from "@/server/services/pagination";

type SiteInput = z.infer<typeof siteSchema>;
type ZoneInput = z.infer<typeof zoneSchema>;

export async function listSites(query: ListQuery) {
  const where: Prisma.SiteWhereInput = {
    deletedAt: null,
    ...activeFilter(query.status),
    ...(query.q
      ? {
          OR: [
            { name: { contains: query.q, mode: "insensitive" } },
            { code: { contains: query.q, mode: "insensitive" } },
            { city: { contains: query.q, mode: "insensitive" } },
          ],
        }
      : {}),
  };
  const [items, total] = await db.$transaction([
    db.site.findMany({
      where,
      orderBy: { name: "asc" },
      select: {
        id: true,
        code: true,
        name: true,
        city: true,
        active: true,
        _count: { select: { zones: { where: { deletedAt: null } }, elements: { where: { deletedAt: null } } } },
      },
      ...paginationArgs(query.page),
    }),
    db.site.count({ where }),
  ]);
  return paginated(items, total, query.page);
}

/** Sedes con sus zonas activas (para selects dependientes sede → zona). */
export async function listSiteOptions() {
  return db.site.findMany({
    where: { deletedAt: null, active: true },
    select: {
      id: true,
      code: true,
      name: true,
      zones: { where: { deletedAt: null, active: true }, select: { id: true, name: true }, orderBy: { name: "asc" } },
    },
    orderBy: { name: "asc" },
  });
}

export async function getSite(id: string) {
  const site = await db.site.findFirst({
    where: { id, deletedAt: null },
    select: {
      id: true,
      code: true,
      name: true,
      address: true,
      city: true,
      active: true,
      zones: {
        where: { deletedAt: null },
        orderBy: { name: "asc" },
        select: {
          id: true,
          code: true,
          name: true,
          description: true,
          active: true,
          _count: { select: { elements: { where: { deletedAt: null } } } },
        },
      },
    },
  });
  if (!site) throw new NotFoundError("La sede no existe.");
  return site;
}

export async function createSite(input: SiteInput, ctx: ServiceContext) {
  return db.$transaction(async (tx) => {
    const site = await tx.site.create({
      data: {
        code: input.code,
        name: input.name,
        address: input.address ?? null,
        city: input.city ?? null,
        active: input.active,
      },
      select: { id: true },
    });
    await audit(auditCtx(ctx), { action: "site.create", entityType: "Site", entityId: site.id, after: input }, tx);
    return site;
  });
}

export async function updateSite(input: SiteInput & { id: string }, ctx: ServiceContext) {
  const current = await getSite(input.id);
  const changes = diff(
    { code: current.code, name: current.name, address: current.address, city: current.city, active: current.active },
    { code: input.code, name: input.name, address: input.address ?? null, city: input.city ?? null, active: input.active },
  );
  if (!changes.changed) return;
  await db.$transaction(async (tx) => {
    await tx.site.update({ where: { id: input.id }, data: changes.after });
    await audit(
      auditCtx(ctx),
      { action: "site.update", entityType: "Site", entityId: input.id, before: changes.before, after: changes.after },
      tx,
    );
  });
}

export async function saveZone(input: ZoneInput, ctx: ServiceContext) {
  const site = await db.site.findFirst({ where: { id: input.siteId, deletedAt: null }, select: { id: true } });
  if (!site) throw new NotFoundError("La sede no existe.");

  const data = {
    code: input.code,
    name: input.name,
    description: input.description ?? null,
    active: input.active,
  };

  if (!input.id) {
    return db.$transaction(async (tx) => {
      const zone = await tx.zone.create({ data: { ...data, siteId: input.siteId }, select: { id: true } });
      await audit(auditCtx(ctx), { action: "zone.create", entityType: "Zone", entityId: zone.id, after: input }, tx);
      return zone;
    });
  }

  const current = await db.zone.findFirst({
    where: { id: input.id, siteId: input.siteId, deletedAt: null },
    select: { code: true, name: true, description: true, active: true },
  });
  if (!current) throw new NotFoundError("La zona no existe.");
  const changes = diff(current, data);
  if (!changes.changed) return { id: input.id };
  await db.$transaction(async (tx) => {
    await tx.zone.update({ where: { id: input.id }, data: changes.after });
    await audit(
      auditCtx(ctx),
      { action: "zone.update", entityType: "Zone", entityId: input.id, before: changes.before, after: changes.after },
      tx,
    );
  });
  return { id: input.id };
}

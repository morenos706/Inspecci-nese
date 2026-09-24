import "server-only";
import { z } from "zod";
import { db } from "@/server/db";
import { audit, diff } from "@/server/audit";
import { DomainError, NotFoundError } from "@/server/errors";
import { ALL_PERMISSIONS, LOCKED_ROLE_CODE } from "@/lib/permissions";
import type { roleSchema } from "@/lib/validation/admin";
import { auditCtx, type ServiceContext } from "@/server/services/context";

type RoleInput = z.infer<typeof roleSchema>;

export async function listRoles() {
  return db.role.findMany({
    orderBy: [{ isSystem: "desc" }, { name: "asc" }],
    select: {
      id: true,
      code: true,
      name: true,
      description: true,
      isSystem: true,
      active: true,
      _count: { select: { users: true, permissions: true } },
    },
  });
}

export async function listRoleOptions() {
  return db.role.findMany({ where: { active: true }, select: { id: true, name: true }, orderBy: { name: "asc" } });
}

export async function getRole(id: string) {
  const role = await db.role.findUnique({
    where: { id },
    select: {
      id: true,
      code: true,
      name: true,
      description: true,
      isSystem: true,
      active: true,
      permissions: { select: { permission: { select: { code: true } } } },
      _count: { select: { users: true } },
    },
  });
  if (!role) throw new NotFoundError("El rol no existe.");
  return { ...role, permissionCodes: role.permissions.map((p) => p.permission.code) };
}

async function permissionIds(codes: string[]) {
  const perms = await db.permission.findMany({ where: { code: { in: codes } }, select: { id: true } });
  if (perms.length !== new Set(codes).size) {
    throw new DomainError("Hay permisos que no existen en la base de datos. Ejecuta el seed de permisos.");
  }
  return perms.map((p) => p.id);
}

export async function createRole(input: RoleInput, ctx: ServiceContext) {
  const ids = await permissionIds(input.permissions);
  return db.$transaction(async (tx) => {
    const role = await tx.role.create({
      data: {
        code: input.code,
        name: input.name,
        description: input.description ?? null,
        active: input.active,
        permissions: { create: ids.map((permissionId) => ({ permissionId })) },
      },
      select: { id: true },
    });
    await audit(
      auditCtx(ctx),
      { action: "role.create", entityType: "Role", entityId: role.id, after: input },
      tx,
    );
    return role;
  });
}

export async function updateRole(input: RoleInput & { id: string }, ctx: ServiceContext) {
  const current = await getRole(input.id);

  if (current.isSystem && input.code !== current.code) {
    throw new DomainError("No se puede cambiar el código de un rol del sistema.");
  }
  if (current.code === LOCKED_ROLE_CODE) {
    if (!input.active) throw new DomainError("El rol Administrador no se puede desactivar.");
    // El administrador siempre conserva todos los permisos.
    input = { ...input, permissions: [...ALL_PERMISSIONS] };
  }

  const ids = await permissionIds(input.permissions);
  const changes = diff(
    {
      code: current.code,
      name: current.name,
      description: current.description,
      active: current.active,
      permissions: [...current.permissionCodes].sort(),
    },
    {
      code: input.code,
      name: input.name,
      description: input.description ?? null,
      active: input.active,
      permissions: [...input.permissions].sort(),
    },
  );
  if (!changes.changed) return;

  await db.$transaction(async (tx) => {
    await tx.role.update({
      where: { id: input.id },
      data: {
        code: input.code,
        name: input.name,
        description: input.description ?? null,
        active: input.active,
        permissions: { deleteMany: {}, create: ids.map((permissionId) => ({ permissionId })) },
      },
    });
    await audit(
      auditCtx(ctx),
      { action: "role.update", entityType: "Role", entityId: input.id, before: changes.before, after: changes.after },
      tx,
    );
  });
}

export async function deleteRole(id: string, ctx: ServiceContext) {
  const role = await getRole(id);
  if (role.isSystem) throw new DomainError("Los roles del sistema no se pueden eliminar; puedes desactivarlos.");
  if (role._count.users > 0) {
    throw new DomainError("El rol tiene usuarios asignados. Reasígnalos antes de eliminarlo.");
  }
  await db.$transaction(async (tx) => {
    await tx.role.delete({ where: { id } });
    await audit(
      auditCtx(ctx),
      { action: "role.delete", entityType: "Role", entityId: id, before: { code: role.code, name: role.name, permissions: role.permissionCodes } },
      tx,
    );
  });
}

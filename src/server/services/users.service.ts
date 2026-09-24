import "server-only";
import { z } from "zod";
import { db } from "@/server/db";
import type { Prisma } from "@/generated/prisma/client";
import { hashPassword } from "@/server/auth/password";
import { generateToken } from "@/server/auth/tokens";
import { destroyUserSessions } from "@/server/auth/session";
import { audit, diff } from "@/server/audit";
import { sendMail } from "@/server/mail/mailer";
import { welcomeEmail } from "@/emails/welcome";
import { passwordResetEmail } from "@/emails/password-reset";
import { DomainError, NotFoundError } from "@/server/errors";
import { env } from "@/lib/env";
import { LOCKED_ROLE_CODE } from "@/lib/permissions";
import type { ListQuery, userCreateSchema, userUpdateSchema } from "@/lib/validation/admin";
import { auditCtx, type ServiceContext } from "@/server/services/context";
import { activeFilter, paginated, paginationArgs } from "@/server/services/pagination";
import { createPasswordResetLink, INVITE_TOKEN_MINUTES, RESET_TOKEN_MINUTES } from "@/server/services/auth.service";

type UserCreateInput = z.infer<typeof userCreateSchema>;
type UserUpdateInput = z.infer<typeof userUpdateSchema>;

const listSelect = {
  id: true,
  name: true,
  email: true,
  jobTitle: true,
  active: true,
  lastLoginAt: true,
  roles: { select: { role: { select: { id: true, name: true } } } },
  processes: { select: { process: { select: { id: true, name: true } } } },
} satisfies Prisma.UserSelect;

export async function listUsers(query: ListQuery) {
  const where: Prisma.UserWhereInput = {
    deletedAt: null,
    ...activeFilter(query.status),
    ...(query.q
      ? {
          OR: [
            { name: { contains: query.q, mode: "insensitive" } },
            { email: { contains: query.q, mode: "insensitive" } },
            { jobTitle: { contains: query.q, mode: "insensitive" } },
          ],
        }
      : {}),
  };
  const [items, total] = await db.$transaction([
    db.user.findMany({ where, select: listSelect, orderBy: { name: "asc" }, ...paginationArgs(query.page) }),
    db.user.count({ where }),
  ]);
  return paginated(items, total, query.page);
}

export async function getUser(id: string) {
  const user = await db.user.findFirst({
    where: { id, deletedAt: null },
    select: {
      ...listSelect,
      phone: true,
      createdAt: true,
      updatedAt: true,
      lockedUntil: true,
      mustChangePassword: true,
    },
  });
  if (!user) throw new NotFoundError("El usuario no existe.");
  return user;
}

/** Opciones para selects (responsables, inspectores…). */
export async function listUserOptions() {
  return db.user.findMany({
    where: { active: true, deletedAt: null },
    select: { id: true, name: true, jobTitle: true },
    orderBy: { name: "asc" },
  });
}

async function assertRolesExist(roleIds: string[]) {
  const count = await db.role.count({ where: { id: { in: roleIds }, active: true } });
  if (count !== new Set(roleIds).size) throw new DomainError("Uno de los roles seleccionados no es válido.");
}

async function assertProcessesExist(processIds: string[]) {
  if (processIds.length === 0) return;
  const count = await db.process.count({ where: { id: { in: processIds }, deletedAt: null } });
  if (count !== new Set(processIds).size) throw new DomainError("Uno de los procesos seleccionados no es válido.");
}

export async function createUser(input: UserCreateInput, ctx: ServiceContext) {
  await assertRolesExist(input.roleIds);
  await assertProcessesExist(input.processIds);

  // Sin contraseña inicial → contraseña aleatoria inutilizable + invitación por correo.
  const passwordHash = await hashPassword(input.password ?? generateToken());

  const user = await db.$transaction(async (tx) => {
    const created = await tx.user.create({
      data: {
        name: input.name,
        email: input.email,
        phone: input.phone ?? null,
        jobTitle: input.jobTitle ?? null,
        active: input.active,
        passwordHash,
        mustChangePassword: Boolean(input.password),
        roles: { create: input.roleIds.map((roleId) => ({ roleId })) },
        processes: { create: input.processIds.map((processId) => ({ processId })) },
      },
      select: { id: true, name: true, email: true },
    });
    await audit(
      auditCtx(ctx),
      {
        action: "user.create",
        entityType: "User",
        entityId: created.id,
        after: { name: input.name, email: input.email, roleIds: input.roleIds, processIds: input.processIds, active: input.active },
      },
      tx,
    );
    return created;
  });

  if (!input.password) {
    const resetUrl = await createPasswordResetLink(user.id, INVITE_TOKEN_MINUTES);
    await sendMail(welcomeEmail({ to: user.email, name: user.name, resetUrl, loginUrl: `${env.APP_URL}/login` }));
  }
  return user;
}

/** Garantiza que siempre quede al menos un administrador activo. */
async function assertAdminRemains(userId: string, nextActive: boolean, nextRoleIds: string[]) {
  const adminRole = await db.role.findUnique({ where: { code: LOCKED_ROLE_CODE }, select: { id: true } });
  if (!adminRole) return;
  const willBeAdmin = nextActive && nextRoleIds.includes(adminRole.id);
  if (willBeAdmin) return;
  const otherAdmins = await db.user.count({
    where: { id: { not: userId }, active: true, deletedAt: null, roles: { some: { roleId: adminRole.id } } },
  });
  if (otherAdmins === 0) {
    throw new DomainError("Debe existir al menos un administrador activo en el sistema.");
  }
}

export async function updateUser(input: UserUpdateInput, ctx: ServiceContext) {
  const current = await db.user.findFirst({
    where: { id: input.id, deletedAt: null },
    select: {
      id: true,
      name: true,
      email: true,
      phone: true,
      jobTitle: true,
      active: true,
      roles: { select: { roleId: true } },
      processes: { select: { processId: true } },
    },
  });
  if (!current) throw new NotFoundError("El usuario no existe.");
  if (input.id === ctx.user.id && !input.active) {
    throw new DomainError("No puedes desactivar tu propio usuario.");
  }
  await assertRolesExist(input.roleIds);
  await assertProcessesExist(input.processIds);
  await assertAdminRemains(input.id, input.active, input.roleIds);

  const before = {
    name: current.name,
    email: current.email,
    phone: current.phone,
    jobTitle: current.jobTitle,
    active: current.active,
    roleIds: current.roles.map((r) => r.roleId).sort(),
    processIds: current.processes.map((p) => p.processId).sort(),
  };
  const after = {
    name: input.name,
    email: input.email,
    phone: input.phone ?? null,
    jobTitle: input.jobTitle ?? null,
    active: input.active,
    roleIds: [...input.roleIds].sort(),
    processIds: [...input.processIds].sort(),
  };
  const changes = diff(before, after);
  if (!changes.changed) return;

  await db.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: input.id },
      data: {
        name: after.name,
        email: after.email,
        phone: after.phone,
        jobTitle: after.jobTitle,
        active: after.active,
        roles: { deleteMany: {}, create: after.roleIds.map((roleId) => ({ roleId })) },
        processes: { deleteMany: {}, create: after.processIds.map((processId) => ({ processId })) },
      },
    });
    await audit(
      auditCtx(ctx),
      { action: "user.update", entityType: "User", entityId: input.id, before: changes.before, after: changes.after },
      tx,
    );
  });

  // Un usuario desactivado pierde sus sesiones inmediatamente.
  if (current.active && !input.active) await destroyUserSessions(input.id);
}

export async function sendPasswordResetByAdmin(userId: string, ctx: ServiceContext) {
  const user = await db.user.findFirst({
    where: { id: userId, deletedAt: null, active: true },
    select: { id: true, name: true, email: true },
  });
  if (!user) throw new NotFoundError("El usuario no existe o está inactivo.");
  await db.passwordResetToken.updateMany({ where: { userId, usedAt: null }, data: { usedAt: new Date() } });
  const url = await createPasswordResetLink(user.id, RESET_TOKEN_MINUTES);
  await sendMail(passwordResetEmail({ to: user.email, name: user.name, url, expiresInMinutes: RESET_TOKEN_MINUTES }));
  await audit(auditCtx(ctx), { action: "user.password_reset_sent", entityType: "User", entityId: userId });
}

export async function unlockUser(userId: string, ctx: ServiceContext) {
  await db.user.update({ where: { id: userId }, data: { lockedUntil: null, failedLoginCount: 0 } });
  await audit(auditCtx(ctx), { action: "user.unlock", entityType: "User", entityId: userId });
}

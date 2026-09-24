import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { db } from "@/server/db";
import { getSessionToken, validateSessionToken } from "@/server/auth/session";
import { AuthenticationError, AuthorizationError } from "@/server/errors";
import { readScope, type PermissionCode, type ReadScope } from "@/lib/permissions";

export interface CurrentUser {
  id: string;
  name: string;
  email: string;
  jobTitle: string | null;
  mustChangePassword: boolean;
  roles: { code: string; name: string }[];
  permissions: ReadonlySet<string>;
  processIds: string[];
  sessionId: string;
}

/**
 * Usuario autenticado de la petición actual (memoizado por request con
 * React.cache). Carga roles, permisos efectivos y procesos del usuario.
 */
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const token = await getSessionToken();
  if (!token) return null;
  const session = await validateSessionToken(token);
  if (!session) return null;

  const user = await db.user.findFirst({
    where: { id: session.userId, active: true, deletedAt: null },
    select: {
      id: true,
      name: true,
      email: true,
      jobTitle: true,
      mustChangePassword: true,
      roles: {
        where: { role: { active: true } },
        select: {
          role: {
            select: {
              code: true,
              name: true,
              permissions: { select: { permission: { select: { code: true } } } },
            },
          },
        },
      },
      processes: { where: { process: { active: true, deletedAt: null } }, select: { processId: true } },
    },
  });
  if (!user) return null;

  const permissions = new Set<string>();
  for (const { role } of user.roles) {
    for (const rp of role.permissions) permissions.add(rp.permission.code);
  }

  return {
    id: user.id,
    name: user.name,
    email: user.email,
    jobTitle: user.jobTitle,
    mustChangePassword: user.mustChangePassword,
    roles: user.roles.map(({ role }) => ({ code: role.code, name: role.name })),
    permissions,
    processIds: user.processes.map((p) => p.processId),
    sessionId: session.id,
  };
});

export function hasPermission(user: CurrentUser, permission: PermissionCode): boolean {
  return user.permissions.has(permission);
}

export function hasAnyPermission(user: CurrentUser, permissions: readonly PermissionCode[]): boolean {
  return permissions.some((p) => user.permissions.has(p));
}

export function getReadScope(
  user: CurrentUser,
  resource: "elements" | "inspections" | "findings" | "actions",
): ReadScope | null {
  return readScope(user.permissions, resource);
}

// ---------------------------------------------------------------------------
// Guards para Server Actions / Route Handlers (lanzan errores de dominio)
// ---------------------------------------------------------------------------

export async function requireUser(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) throw new AuthenticationError();
  return user;
}

/** Exige al menos uno de los permisos indicados. */
export async function requirePermission(...permissions: PermissionCode[]): Promise<CurrentUser> {
  const user = await requireUser();
  if (!hasAnyPermission(user, permissions)) throw new AuthorizationError();
  return user;
}

// ---------------------------------------------------------------------------
// Guards para páginas (Server Components): redirigen en lugar de lanzar
// ---------------------------------------------------------------------------

export async function requirePageUser(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

export async function requirePagePermission(...permissions: PermissionCode[]): Promise<CurrentUser> {
  const user = await requirePageUser();
  if (!hasAnyPermission(user, permissions)) redirect("/forbidden");
  return user;
}

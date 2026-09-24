import "server-only";
import { cookies } from "next/headers";
import { db } from "@/server/db";
import { env, isProduction } from "@/lib/env";
import { generateToken, hashToken } from "@/server/auth/tokens";
import type { RequestMeta } from "@/server/request-context";

/**
 * Sesiones en base de datos (revocables) con cookie httpOnly.
 *
 *  - Cookie: token aleatorio opaco. HttpOnly + SameSite=Lax + Secure en prod.
 *  - BD: SHA-256 del token, fecha de expiración y metadatos.
 *  - Expiración por inactividad (SESSION_TTL_HOURS, deslizante) y
 *    expiración absoluta (SESSION_MAX_AGE_DAYS) aunque haya actividad.
 */
export const SESSION_COOKIE = isProduction ? "__Host-session" : "session";
const SESSION_MAX_AGE_DAYS = 7;
// Solo se actualiza lastUsedAt/expiresAt si pasaron más de 5 min (reduce escrituras).
const TOUCH_INTERVAL_MS = 5 * 60_000;

const idleTtlMs = () => env.SESSION_TTL_HOURS * 3_600_000;

export async function createSession(userId: string, meta: RequestMeta) {
  const token = generateToken();
  const now = Date.now();
  await db.session.create({
    data: {
      tokenHash: hashToken(token),
      userId,
      expiresAt: new Date(now + idleTtlMs()),
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
    },
  });

  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: isProduction,
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_MAX_AGE_DAYS * 24 * 3600,
  });
}

export async function getSessionToken(): Promise<string | null> {
  const jar = await cookies();
  return jar.get(SESSION_COOKIE)?.value ?? null;
}

/** Valida el token y devuelve la sesión con el ID de usuario, o null. */
export async function validateSessionToken(token: string) {
  const session = await db.session.findUnique({
    where: { tokenHash: hashToken(token) },
    select: { id: true, userId: true, expiresAt: true, createdAt: true, lastUsedAt: true },
  });
  if (!session) return null;

  const now = Date.now();
  const absoluteExpiry = session.createdAt.getTime() + SESSION_MAX_AGE_DAYS * 86_400_000;
  if (session.expiresAt.getTime() <= now || absoluteExpiry <= now) {
    await db.session.delete({ where: { id: session.id } }).catch(() => undefined);
    return null;
  }

  if (now - session.lastUsedAt.getTime() > TOUCH_INTERVAL_MS) {
    await db.session
      .update({
        where: { id: session.id },
        data: {
          lastUsedAt: new Date(now),
          expiresAt: new Date(Math.min(now + idleTtlMs(), absoluteExpiry)),
        },
      })
      .catch(() => undefined);
  }
  return session;
}

export async function destroyCurrentSession() {
  const token = await getSessionToken();
  if (token) {
    await db.session.deleteMany({ where: { tokenHash: hashToken(token) } });
  }
  const jar = await cookies();
  jar.delete(SESSION_COOKIE);
}

/** Cierra todas las sesiones de un usuario (cambio de contraseña, desactivación). */
export async function destroyUserSessions(userId: string, exceptToken?: string | null) {
  await db.session.deleteMany({
    where: {
      userId,
      ...(exceptToken ? { NOT: { tokenHash: hashToken(exceptToken) } } : {}),
    },
  });
}

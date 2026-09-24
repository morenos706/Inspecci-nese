import "server-only";
import { db } from "@/server/db";
import { env } from "@/lib/env";
import { hashPassword, verifyPassword, verifyPasswordTimingSafe } from "@/server/auth/password";
import { createSession, destroyUserSessions, getSessionToken } from "@/server/auth/session";
import { generateToken, hashToken } from "@/server/auth/tokens";
import { loginIpLimiter, loginLimiter, passwordResetLimiter } from "@/server/auth/rate-limit";
import { audit } from "@/server/audit";
import { sendMail } from "@/server/mail/mailer";
import { passwordResetEmail } from "@/emails/password-reset";
import { DomainError, RateLimitError, ValidationError } from "@/server/errors";
import type { RequestMeta } from "@/server/request-context";

const MAX_FAILED_LOGINS = 10;
const LOCK_MINUTES = 15;
export const RESET_TOKEN_MINUTES = 60;
export const INVITE_TOKEN_MINUTES = 72 * 60;

const INVALID_CREDENTIALS = "Correo o contraseña incorrectos.";

export async function login(input: { email: string; password: string }, meta: RequestMeta) {
  const ipKey = meta.ipAddress ?? "unknown";
  if (!loginIpLimiter.consume(ipKey).allowed || !loginLimiter.consume(`${ipKey}:${input.email}`).allowed) {
    throw new RateLimitError();
  }

  const user = await db.user.findUnique({
    where: { email: input.email },
    select: { id: true, passwordHash: true, active: true, deletedAt: true, lockedUntil: true, failedLoginCount: true },
  });

  const valid = await verifyPasswordTimingSafe(input.password, user?.passwordHash ?? null);

  if (!user || user.deletedAt) throw new DomainError(INVALID_CREDENTIALS);

  if (user.lockedUntil && user.lockedUntil > new Date()) {
    throw new DomainError("La cuenta está bloqueada temporalmente por intentos fallidos. Inténtalo más tarde.");
  }

  if (!valid) {
    const failed = user.failedLoginCount + 1;
    await db.user.update({
      where: { id: user.id },
      data: {
        failedLoginCount: failed >= MAX_FAILED_LOGINS ? 0 : failed,
        lockedUntil: failed >= MAX_FAILED_LOGINS ? new Date(Date.now() + LOCK_MINUTES * 60_000) : undefined,
      },
    });
    await audit({ userId: user.id, meta }, { action: "auth.login_failed", entityType: "User", entityId: user.id });
    throw new DomainError(INVALID_CREDENTIALS);
  }

  // Se valida el estado solo tras verificar la contraseña: no revela cuentas inactivas a terceros.
  if (!user.active) throw new DomainError("Tu usuario está inactivo. Contacta al administrador.");

  await db.user.update({
    where: { id: user.id },
    data: { failedLoginCount: 0, lockedUntil: null, lastLoginAt: new Date() },
  });
  loginLimiter.reset(`${ipKey}:${input.email}`);
  await createSession(user.id, meta);
  await audit({ userId: user.id, meta }, { action: "auth.login", entityType: "User", entityId: user.id });
}

/** Crea un token de restablecimiento y devuelve la URL (sin enviarla). */
export async function createPasswordResetLink(userId: string, minutes: number) {
  const token = generateToken();
  await db.passwordResetToken.create({
    data: { userId, tokenHash: hashToken(token), expiresAt: new Date(Date.now() + minutes * 60_000) },
  });
  return `${env.APP_URL}/reset-password?token=${encodeURIComponent(token)}`;
}

/**
 * Solicitud de recuperación. Siempre responde igual exista o no el correo
 * (no permite averiguar qué correos están registrados).
 */
export async function requestPasswordReset(email: string, meta: RequestMeta) {
  if (!passwordResetLimiter.consume(`${meta.ipAddress ?? "unknown"}:${email}`).allowed) {
    throw new RateLimitError();
  }
  const user = await db.user.findFirst({
    where: { email, active: true, deletedAt: null },
    select: { id: true, name: true, email: true },
  });
  if (!user) return;

  // Invalida tokens anteriores sin usar.
  await db.passwordResetToken.updateMany({
    where: { userId: user.id, usedAt: null },
    data: { usedAt: new Date() },
  });
  const url = await createPasswordResetLink(user.id, RESET_TOKEN_MINUTES);
  await sendMail(passwordResetEmail({ to: user.email, name: user.name, url, expiresInMinutes: RESET_TOKEN_MINUTES }));
  await audit({ userId: user.id, meta }, { action: "auth.password_reset_requested", entityType: "User", entityId: user.id });
}

export async function findValidResetToken(token: string) {
  const record = await db.passwordResetToken.findUnique({
    where: { tokenHash: hashToken(token) },
    select: { id: true, userId: true, expiresAt: true, usedAt: true, user: { select: { active: true, deletedAt: true } } },
  });
  if (!record || record.usedAt || record.expiresAt <= new Date() || !record.user.active || record.user.deletedAt) {
    return null;
  }
  return record;
}

export async function resetPassword(input: { token: string; password: string }, meta: RequestMeta) {
  const record = await findValidResetToken(input.token);
  if (!record) throw new DomainError("El enlace no es válido o ya venció. Solicita uno nuevo.");

  const passwordHash = await hashPassword(input.password);
  await db.$transaction([
    db.user.update({
      where: { id: record.userId },
      data: { passwordHash, mustChangePassword: false, failedLoginCount: 0, lockedUntil: null },
    }),
    db.passwordResetToken.update({ where: { id: record.id }, data: { usedAt: new Date() } }),
    // Cierra todas las sesiones abiertas: si alguien tenía acceso, lo pierde.
    db.session.deleteMany({ where: { userId: record.userId } }),
  ]);
  await audit({ userId: record.userId, meta }, { action: "auth.password_reset", entityType: "User", entityId: record.userId });
}

export async function changeOwnPassword(
  userId: string,
  input: { currentPassword: string; newPassword: string },
  meta: RequestMeta,
) {
  const user = await db.user.findUniqueOrThrow({ where: { id: userId }, select: { passwordHash: true } });
  if (!(await verifyPassword(input.currentPassword, user.passwordHash))) {
    throw new ValidationError({ currentPassword: ["La contraseña actual no es correcta"] });
  }
  if (input.currentPassword === input.newPassword) {
    throw new ValidationError({ newPassword: ["La nueva contraseña debe ser diferente a la actual"] });
  }
  await db.user.update({
    where: { id: userId },
    data: { passwordHash: await hashPassword(input.newPassword), mustChangePassword: false },
  });
  // Mantiene la sesión actual y cierra las demás.
  await destroyUserSessions(userId, await getSessionToken());
  await audit({ userId, meta }, { action: "auth.password_change", entityType: "User", entityId: userId });
}

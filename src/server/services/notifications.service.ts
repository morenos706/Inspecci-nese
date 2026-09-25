import "server-only";
import { z } from "zod";
import { db } from "@/server/db";
import { env } from "@/lib/env";
import { sendMail } from "@/server/mail/mailer";
import { notificationEmail } from "@/emails/notification";
import type { EmailConfig } from "@/lib/email-templates";
import { getEmailConfig } from "@/server/mail/templates";
import { canRetry, EMAIL_MAX_AGE_HOURS, EMAIL_MAX_ATTEMPTS, safeInternalLink } from "@/lib/notifications";
import type { Prisma } from "@/generated/prisma/client";
import type { PermissionCode } from "@/lib/permissions";

type Tx = Prisma.TransactionClient | typeof db;

export interface NotifyInput {
  userIds: (string | null | undefined)[];
  type: string; // p.ej. "action_plan.assigned"
  title: string;
  body: string;
  link?: string;
  /** Evita duplicados del mismo aviso (se agrega el ID del usuario). */
  dedupeKey?: string;
  /** No notificar a este usuario (normalmente quien hizo la acción). */
  excludeUserId?: string | null;
}

/**
 * Patrón outbox: se registra la notificación (canal interno, visible de
 * inmediato en la campana) y una entrega pendiente por correo que envía
 * dispatchPendingEmails() fuera de la transacción. Nuevos canales (WhatsApp,
 * SMS, push) se agregan como otra entrega sin tocar a quienes llaman a notify().
 */
export async function notify(input: NotifyInput, tx: Tx = db): Promise<number> {
  let created = 0;
  const ids = new Set(input.userIds.filter((id): id is string => Boolean(id) && id !== input.excludeUserId));
  for (const userId of ids) {
    const dedupeKey = input.dedupeKey ? `${input.dedupeKey}:${userId}` : null;
    if (dedupeKey && (await tx.notification.findUnique({ where: { dedupeKey }, select: { id: true } }))) continue;
    await tx.notification.create({
      data: {
        userId,
        type: input.type,
        title: input.title.slice(0, 200),
        body: input.body.slice(0, 1000),
        link: input.link ?? null,
        dedupeKey,
        deliveries: {
          create: [
            { channel: "IN_APP", status: "SENT", sentAt: new Date() },
            { channel: "EMAIL", status: "PENDING" },
          ],
        },
      },
    });
    created++;
  }
  return created;
}

/**
 * Usuarios activos con un permiso que alcanza un proceso: los asignados al
 * proceso, o quienes tienen el alcance global indicado (p.ej. actions.read.all).
 */
export async function usersWithPermissionInProcess(
  permission: PermissionCode,
  processId: string,
  globalScope: PermissionCode,
  tx: Tx = db,
): Promise<string[]> {
  const hasPerm = (code: PermissionCode): Prisma.UserWhereInput => ({
    roles: { some: { role: { active: true, permissions: { some: { permission: { code } } } } } },
  });
  const users = await tx.user.findMany({
    where: {
      active: true,
      deletedAt: null,
      AND: [hasPerm(permission), { OR: [{ processes: { some: { processId } } }, hasPerm(globalScope)] }],
    },
    select: { id: true },
  });
  return users.map((u) => u.id);
}

// ---------------------------------------------------------------------------
// Bandeja del usuario
// ---------------------------------------------------------------------------

export const notificationsQuerySchema = z.object({
  filter: z.enum(["all", "unread"]).catch("all"),
  page: z.coerce.number().int().min(1).max(1000).catch(1),
});

const PAGE_SIZE = 20;

export async function listNotifications(userId: string, query: z.infer<typeof notificationsQuerySchema>) {
  const where: Prisma.NotificationWhereInput = { userId, ...(query.filter === "unread" ? { readAt: null } : {}) };
  const [items, total, unread] = await db.$transaction([
    db.notification.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (query.page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      select: { id: true, type: true, title: true, body: true, link: true, readAt: true, createdAt: true },
    }),
    db.notification.count({ where }),
    db.notification.count({ where: { userId, readAt: null } }),
  ]);
  return { items, total, unread, page: query.page, pages: Math.max(1, Math.ceil(total / PAGE_SIZE)) };
}

export async function unreadSummary(userId: string) {
  const [unread, latest] = await db.$transaction([
    db.notification.count({ where: { userId, readAt: null } }),
    db.notification.findMany({
      where: { userId, readAt: null },
      orderBy: { createdAt: "desc" },
      take: 5,
      select: { id: true, type: true, title: true, body: true, createdAt: true },
    }),
  ]);
  return { unread, latest };
}

/** Marca como leída y devuelve el enlace interno a abrir (solo si es del usuario). */
export async function openNotification(userId: string, id: string): Promise<string> {
  const n = await db.notification.findFirst({ where: { id, userId }, select: { id: true, link: true, readAt: true } });
  if (!n) return "/notifications";
  if (!n.readAt) await db.notification.update({ where: { id: n.id }, data: { readAt: new Date() } });
  return safeInternalLink(n.link);
}

export async function markNotificationsRead(userId: string, ids?: string[]) {
  const { count } = await db.notification.updateMany({
    where: { userId, readAt: null, ...(ids ? { id: { in: ids } } : {}) },
    data: { readAt: new Date() },
  });
  return count;
}

export async function getEmailPreference(userId: string): Promise<boolean> {
  const user = await db.user.findUnique({ where: { id: userId }, select: { emailNotifications: true } });
  return user?.emailNotifications ?? true;
}

export async function setEmailPreference(userId: string, enabled: boolean) {
  await db.user.update({ where: { id: userId }, data: { emailNotifications: enabled } });
}

// ---------------------------------------------------------------------------
// Envío de correos pendientes (outbox)
// ---------------------------------------------------------------------------

export interface DispatchResult {
  sent: number;
  failed: number;
  skipped: number;
}

/**
 * Envía los correos pendientes. Seguro con varias instancias: cada entrega se
 * "reclama" incrementando `attempts` de forma condicional antes de enviarla.
 * Reintentos con espera creciente; tras EMAIL_MAX_ATTEMPTS queda FAILED.
 */
export async function dispatchPendingEmails(limit = 50, now = new Date()): Promise<DispatchResult> {
  const result: DispatchResult = { sent: 0, failed: 0, skipped: 0 };

  // Sin SMTP configurado no hay a dónde enviar: se omiten (la campana sigue funcionando).
  const oldest = new Date(now.getTime() - EMAIL_MAX_AGE_HOURS * 3_600_000);
  if (!env.SMTP_HOST) {
    const { count } = await db.notificationDelivery.updateMany({
      where: { channel: "EMAIL", status: "PENDING" },
      data: { status: "SKIPPED", lastError: "SMTP no configurado" },
    });
    result.skipped += count;
    return result;
  }
  const expired = await db.notificationDelivery.updateMany({
    where: { channel: "EMAIL", status: "PENDING", createdAt: { lt: oldest } },
    data: { status: "SKIPPED", lastError: "Venció el tiempo de envío" },
  });
  result.skipped += expired.count;

  const pending = await db.notificationDelivery.findMany({
    where: { channel: "EMAIL", status: "PENDING", attempts: { lt: EMAIL_MAX_ATTEMPTS } },
    orderBy: { createdAt: "asc" },
    take: limit,
    select: {
      id: true,
      attempts: true,
      updatedAt: true,
      notification: {
        select: {
          title: true,
          body: true,
          link: true,
          type: true,
          user: { select: { email: true, name: true, active: true, deletedAt: true, emailNotifications: true } },
        },
      },
    },
  });

  let emailConfig: EmailConfig | undefined;
  for (const d of pending) {
    if (d.attempts > 0 && !canRetry(d.attempts, d.updatedAt, now)) continue;
    const { user } = d.notification;
    if (!user.active || user.deletedAt || !user.emailNotifications) {
      await db.notificationDelivery.update({
        where: { id: d.id },
        data: { status: "SKIPPED", lastError: user.emailNotifications ? "Usuario inactivo" : "El usuario desactivó los correos" },
      });
      result.skipped++;
      continue;
    }
    // Reclamo atómico: si otra instancia ya lo tomó, count = 0.
    const claim = await db.notificationDelivery.updateMany({
      where: { id: d.id, status: "PENDING", attempts: d.attempts },
      data: { attempts: { increment: 1 } },
    });
    if (claim.count === 0) continue;
    try {
      emailConfig ??= await getEmailConfig();
      await sendMail(
        await notificationEmail({
          to: user.email,
          name: user.name,
          title: d.notification.title,
          body: d.notification.body,
          type: d.notification.type,
          url: `${env.APP_URL}${safeInternalLink(d.notification.link)}`,
        }, emailConfig),
      );
      await db.notificationDelivery.update({ where: { id: d.id }, data: { status: "SENT", sentAt: new Date(), lastError: null } });
      result.sent++;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const final = d.attempts + 1 >= EMAIL_MAX_ATTEMPTS;
      await db.notificationDelivery.update({
        where: { id: d.id },
        data: { status: final ? "FAILED" : "PENDING", lastError: message.slice(0, 500) },
      });
      if (final) result.failed++;
      // Si el servidor SMTP no responde, no insistir con el resto del lote.
      if (/ECONNREFUSED|ETIMEDOUT|ENOTFOUND|EAUTH|Invalid login/i.test(message)) {
        console.error(`[mail] Error de envío (se reintentará): ${message}`);
        break;
      }
    }
  }
  return result;
}

import "server-only";
import { db } from "@/server/db";
import type { Prisma } from "@/generated/prisma/client";

type Tx = Prisma.TransactionClient | typeof db;

export interface NotifyInput {
  userIds: string[];
  type: string; // p.ej. "action_plan.assigned"
  title: string;
  body: string;
  link?: string;
  /** Evita duplicados del mismo aviso (se agrega el ID del usuario). */
  dedupeKey?: string;
}

/**
 * Patrón outbox: se registra la notificación (canal interno) y una entrega
 * pendiente por correo. La Fase 7 procesa las entregas pendientes y agrega
 * canales (WhatsApp, SMS, push) sin tocar a quienes llaman a notify().
 */
export async function notify(input: NotifyInput, tx: Tx = db) {
  for (const userId of new Set(input.userIds)) {
    const dedupeKey = input.dedupeKey ? `${input.dedupeKey}:${userId}` : null;
    if (dedupeKey && (await tx.notification.findUnique({ where: { dedupeKey }, select: { id: true } }))) continue;
    await tx.notification.create({
      data: {
        userId,
        type: input.type,
        title: input.title,
        body: input.body,
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
  }
}

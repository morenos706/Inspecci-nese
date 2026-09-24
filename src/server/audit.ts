import "server-only";
import { db } from "@/server/db";
import type { Prisma } from "@/generated/prisma/client";
import type { RequestMeta } from "@/server/request-context";

/**
 * Auditoría de acciones relevantes. Se llama desde los servicios, idealmente
 * dentro de la misma transacción que el cambio (pasando `tx`) para que no
 * exista un cambio sin su registro de auditoría.
 */
export interface AuditContext {
  userId: string | null;
  meta?: RequestMeta;
}

export interface AuditEntry {
  action: string; // "<entidad>.<verbo>", p.ej. "user.update"
  entityType: string;
  entityId?: string | null;
  before?: unknown;
  after?: unknown;
}

type Tx = Pick<typeof db, "auditLog">;

// Campos que nunca deben quedar en la auditoría.
const REDACTED_KEYS = new Set(["passwordHash", "password", "tokenHash", "token"]);

function sanitize(value: unknown): Prisma.InputJsonValue | undefined {
  if (value === undefined || value === null) return undefined;
  return JSON.parse(
    JSON.stringify(value, (key, v) => {
      if (REDACTED_KEYS.has(key)) return "[redacted]";
      if (typeof v === "bigint") return v.toString();
      return v;
    }),
  ) as Prisma.InputJsonValue;
}

export async function audit(ctx: AuditContext, entry: AuditEntry, tx: Tx = db) {
  await tx.auditLog.create({
    data: {
      userId: ctx.userId,
      action: entry.action,
      entityType: entry.entityType,
      entityId: entry.entityId ?? null,
      before: sanitize(entry.before),
      after: sanitize(entry.after),
      ipAddress: ctx.meta?.ipAddress ?? null,
      userAgent: ctx.meta?.userAgent ?? null,
    },
  });
}

/** JSON con claves ordenadas: jsonb de PostgreSQL no conserva el orden de las claves. */
export function stableStringify(value: unknown): string {
  return JSON.stringify(value, (_key, v) =>
    v && typeof v === "object" && !Array.isArray(v) && !(v instanceof Date)
      ? Object.fromEntries(Object.entries(v as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)))
      : v,
  );
}

/** Devuelve solo los campos que cambiaron (para registrar before/after compactos). */
export function diff<T extends Record<string, unknown>>(before: T, after: Partial<T>) {
  const b: Partial<T> = {};
  const a: Partial<T> = {};
  for (const key of Object.keys(after) as (keyof T)[]) {
    const prev = before[key];
    const next = after[key];
    const same =
      prev instanceof Date && next instanceof Date
        ? prev.getTime() === next.getTime()
        : stableStringify(prev ?? null) === stableStringify(next ?? null);
    if (!same) {
      b[key] = prev;
      a[key] = next as T[keyof T];
    }
  }
  return { before: b, after: a, changed: Object.keys(a).length > 0 };
}

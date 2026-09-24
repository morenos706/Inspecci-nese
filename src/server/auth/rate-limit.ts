import "server-only";

/**
 * Rate limiter en memoria (ventana fija por clave).
 *
 * Suficiente para una sola instancia. Para varias réplicas se debe
 * reemplazar por un store compartido (Redis / Upstash) manteniendo la misma
 * interfaz `RateLimiter`.
 */
export interface RateLimiter {
  consume(key: string): { allowed: boolean; remaining: number; resetAt: number };
  reset(key: string): void;
}

export function createMemoryRateLimiter(options: { limit: number; windowMs: number }): RateLimiter {
  const hits = new Map<string, { count: number; resetAt: number }>();

  function sweep(now: number) {
    if (hits.size < 10_000) return;
    for (const [key, entry] of hits) if (entry.resetAt <= now) hits.delete(key);
  }

  return {
    consume(key) {
      const now = Date.now();
      sweep(now);
      const entry = hits.get(key);
      if (!entry || entry.resetAt <= now) {
        const fresh = { count: 1, resetAt: now + options.windowMs };
        hits.set(key, fresh);
        return { allowed: true, remaining: options.limit - 1, resetAt: fresh.resetAt };
      }
      entry.count += 1;
      return {
        allowed: entry.count <= options.limit,
        remaining: Math.max(0, options.limit - entry.count),
        resetAt: entry.resetAt,
      };
    },
    reset(key) {
      hits.delete(key);
    },
  };
}

const globalLimiters = globalThis as unknown as { __rateLimiters?: Record<string, RateLimiter> };
globalLimiters.__rateLimiters ??= {};

function named(name: string, limit: number, windowMs: number): RateLimiter {
  return (globalLimiters.__rateLimiters![name] ??= createMemoryRateLimiter({ limit, windowMs }));
}

const MINUTE = 60_000;

export const loginLimiter = named("login", 5, 15 * MINUTE);
export const loginIpLimiter = named("login-ip", 30, 15 * MINUTE);
export const passwordResetLimiter = named("password-reset", 3, 60 * MINUTE);

import { describe, expect, it } from "vitest";
import { createMemoryRateLimiter } from "@/server/auth/rate-limit";

describe("rate limiter en memoria", () => {
  it("bloquea al superar el límite y se puede reiniciar", () => {
    const limiter = createMemoryRateLimiter({ limit: 3, windowMs: 60_000 });
    expect(limiter.consume("k").allowed).toBe(true);
    expect(limiter.consume("k").allowed).toBe(true);
    expect(limiter.consume("k").allowed).toBe(true);
    expect(limiter.consume("k").allowed).toBe(false);
    expect(limiter.consume("otra").allowed).toBe(true);
    limiter.reset("k");
    expect(limiter.consume("k").allowed).toBe(true);
  });
});

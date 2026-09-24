import { describe, expect, it } from "vitest";
import { canRetry, EMAIL_MAX_ATTEMPTS, notificationTone, retryDelayMinutes, safeInternalLink, timeAgo } from "@/lib/notifications";

describe("reintentos de correo", () => {
  it("espera creciente entre intentos", () => {
    expect([0, 1, 2, 3, 4].map(retryDelayMinutes)).toEqual([0, 2, 4, 8, 16]);
  });
  it("respeta la espera y el máximo de intentos", () => {
    const last = new Date("2026-09-25T10:00:00Z");
    expect(canRetry(1, last, new Date("2026-09-25T10:01:00Z"))).toBe(false);
    expect(canRetry(1, last, new Date("2026-09-25T10:02:00Z"))).toBe(true);
    expect(canRetry(EMAIL_MAX_ATTEMPTS, last, new Date("2026-09-26T10:00:00Z"))).toBe(false);
  });
});

describe("enlaces de notificación", () => {
  it("solo permite rutas internas", () => {
    expect(safeInternalLink("/action-plans/abc")).toBe("/action-plans/abc");
    expect(safeInternalLink("https://malicioso.com")).toBe("/notifications");
    expect(safeInternalLink("//malicioso.com")).toBe("/notifications");
    expect(safeInternalLink("/\\malicioso.com")).toBe("/notifications");
    expect(safeInternalLink(null)).toBe("/notifications");
  });
});

describe("presentación", () => {
  it("tono por tipo y por texto crítico", () => {
    expect(notificationTone("action_plan.overdue")).toBe("danger");
    expect(notificationTone("action_plan.assigned", "ALERTA CRÍTICA: Recarga vencida")).toBe("danger");
    expect(notificationTone("action_plan.due_soon")).toBe("warning");
    expect(notificationTone("action_plan.verified")).toBe("success");
    expect(notificationTone("otro")).toBe("neutral");
  });
  it("tiempo relativo", () => {
    const now = new Date("2026-09-25T12:00:00Z");
    expect(timeAgo(new Date("2026-09-25T11:59:40Z"), now)).toBe("ahora");
    expect(timeAgo(new Date("2026-09-25T11:55:00Z"), now)).toBe("hace 5 min");
    expect(timeAgo(new Date("2026-09-25T09:00:00Z"), now)).toBe("hace 3 h");
    expect(timeAgo(new Date("2026-09-23T12:00:00Z"), now)).toBe("hace 2 d");
  });
});

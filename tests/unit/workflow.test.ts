import { describe, expect, it } from "vitest";
import { availableActions, canPerform, deriveFindingStatus, isPlanOverdue } from "@/lib/workflow";

const actor = (userId: string, perms: string[], managesInScope = false) => ({
  userId,
  permissions: new Set(perms),
  managesInScope,
});
const plan = (status: "PENDING" | "IN_PROGRESS" | "SOLVED" | "VERIFIED" | "CLOSED", solvedById: string | null = null) => ({
  status,
  responsibleId: "resp",
  solvedById,
});

describe("canPerform", () => {
  it("el responsable inicia y soluciona su plan", () => {
    const r = actor("resp", ["actions.update"]);
    expect(availableActions(plan("PENDING"), r)).toEqual(["start", "solve"]);
    expect(availableActions(plan("IN_PROGRESS"), r)).toEqual(["solve"]);
  });

  it("otro usuario sin gestión no puede actualizar el plan", () => {
    expect(canPerform("solve", plan("IN_PROGRESS"), actor("otro", ["actions.update"])).allowed).toBe(false);
  });

  it("quien gestiona en su alcance puede actualizar planes ajenos", () => {
    expect(canPerform("start", plan("PENDING"), actor("jefe", ["actions.manage"], true)).allowed).toBe(true);
  });

  it("segregación: quien solucionó no verifica, aunque tenga permiso", () => {
    const admin = actor("admin", ["actions.verify", "actions.close", "actions.update"], true);
    expect(canPerform("verify", plan("SOLVED", "admin"), admin)).toEqual({
      allowed: false,
      reason: "Quien solucionó el plan no puede verificarlo.",
    });
    expect(canPerform("verify", plan("SOLVED", "resp"), admin).allowed).toBe(true);
    expect(canPerform("reject", plan("SOLVED", "resp"), admin).allowed).toBe(true);
  });

  it("solo actions.close cierra, y solo planes verificados", () => {
    expect(canPerform("close", plan("VERIFIED"), actor("x", ["actions.verify"])).allowed).toBe(false);
    expect(canPerform("close", plan("VERIFIED"), actor("x", ["actions.close"])).allowed).toBe(true);
    expect(canPerform("close", plan("SOLVED"), actor("x", ["actions.close"])).allowed).toBe(false);
  });

  it("nada se puede hacer sobre un plan cerrado", () => {
    expect(availableActions(plan("CLOSED"), actor("admin", ["actions.update", "actions.verify", "actions.close"], true))).toEqual([]);
  });
});

describe("deriveFindingStatus", () => {
  it.each([
    [[], "PENDING"],
    [["PENDING"], "PENDING"],
    [["PENDING", "SOLVED"], "IN_PROGRESS"],
    [["IN_PROGRESS", "CLOSED"], "IN_PROGRESS"],
    [["SOLVED", "VERIFIED"], "SOLVED"],
    [["VERIFIED", "CLOSED"], "VERIFIED"],
    [["CLOSED", "CLOSED"], "CLOSED"],
  ] as const)("%j → %s", (statuses, expected) => {
    expect(deriveFindingStatus([...statuses])).toBe(expected);
  });
});

describe("isPlanOverdue", () => {
  const due = new Date("2026-09-23T12:00:00Z");
  it("vencido si la fecha pasó y no está solucionado", () => {
    expect(isPlanOverdue("IN_PROGRESS", due, "2026-09-24")).toBe(true);
    expect(isPlanOverdue("SOLVED", due, "2026-09-24")).toBe(false);
    expect(isPlanOverdue("PENDING", due, "2026-09-23")).toBe(false);
  });
});

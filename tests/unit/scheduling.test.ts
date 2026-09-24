import { describe, expect, it } from "vitest";
import { computeNextInspection, scheduleStatus } from "@/lib/scheduling";

const utc = (iso: string) => new Date(`${iso}T12:00:00.000Z`);

describe("computeNextInspection", () => {
  it("mensual: 01/09/2026 → 01/10/2026 (ejemplo del requerimiento)", () => {
    expect(computeNextInspection(utc("2026-09-01"), "MONTHLY").toISOString()).toBe(utc("2026-10-01").toISOString());
  });

  it("ajusta fin de mes: 31/01 + 1 mes = 28/02 (año no bisiesto)", () => {
    expect(computeNextInspection(utc("2027-01-31"), "MONTHLY").toISOString()).toBe(utc("2027-02-28").toISOString());
  });

  it.each([
    ["DAILY", "2026-09-02"],
    ["WEEKLY", "2026-09-08"],
    ["BIWEEKLY", "2026-09-16"],
    ["BIMONTHLY", "2026-11-01"],
    ["QUARTERLY", "2026-12-01"],
    ["SEMIANNUAL", "2027-03-01"],
    ["ANNUAL", "2027-09-01"],
  ] as const)("%s desde 01/09/2026 → %s", (frequency, expected) => {
    expect(computeNextInspection(utc("2026-09-01"), frequency).toISOString()).toBe(utc(expected).toISOString());
  });

  it("personalizada usa los días configurados", () => {
    expect(computeNextInspection(utc("2026-09-01"), "CUSTOM", 45).toISOString()).toBe(utc("2026-10-16").toISOString());
  });

  it("personalizada sin días es un error", () => {
    expect(() => computeNextInspection(utc("2026-09-01"), "CUSTOM")).toThrow();
  });
});

describe("scheduleStatus", () => {
  const now = utc("2026-09-24");

  it("vencida si la fecha ya pasó", () => {
    expect(scheduleStatus(utc("2026-09-23"), "MONTHLY", now)).toBe("OVERDUE");
  });
  it("próxima a vencer dentro de la ventana (7 días para mensual)", () => {
    expect(scheduleStatus(utc("2026-09-30"), "MONTHLY", now)).toBe("DUE_SOON");
  });
  it("al día fuera de la ventana", () => {
    expect(scheduleStatus(utc("2026-10-10"), "MONTHLY", now)).toBe("ON_TIME");
  });
  it("sin fecha = sin programar", () => {
    expect(scheduleStatus(null, "MONTHLY", now)).toBe("UNSCHEDULED");
  });
});

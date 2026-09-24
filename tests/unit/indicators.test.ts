import { describe, expect, it } from "vitest";
import { average, countBy, monthKey, monthLabel, monthsBetween, pct, programCompliance } from "@/lib/indicators";

describe("indicadores", () => {
  it("cumplimiento del programa: ejemplo del requerimiento (180/15/5 → 90 %)", () => {
    expect(programCompliance(180, 15, 5)).toBe(90);
    expect(programCompliance(0, 0, 0)).toBeNull();
  });

  it("porcentajes y promedios con un decimal", () => {
    expect(pct(2, 3)).toBe(66.7);
    expect(average([80, 90, 100])).toBe(90);
    expect(average([])).toBeNull();
  });

  it("meses entre fechas (cruza años) y límite", () => {
    expect(monthsBetween("2025-11-15", "2026-02-01")).toEqual(["2025-11", "2025-12", "2026-01", "2026-02"]);
    expect(monthsBetween("2020-01-01", "2026-09-24", 12)).toHaveLength(12);
    expect(monthsBetween("2020-01-01", "2026-09-24", 12).at(-1)).toBe("2026-09");
  });

  it("el mes se calcula en la zona horaria de la app", () => {
    // 1 oct 2026 02:00 UTC = 30 sep 2026 21:00 en Bogotá
    expect(monthKey(new Date("2026-10-01T02:00:00Z"), "America/Bogota")).toBe("2026-09");
    expect(monthLabel("2026-09")).toBe("sep 26");
  });

  it("conteo por clave ignora nulos", () => {
    expect([...countBy([{ p: "a" }, { p: "a" }, { p: null }], (r) => r.p)]).toEqual([["a", 2]]);
  });
});

import { fmt, niceTicks } from "@/lib/chart-format";

describe("ejes y formato", () => {
  it("marcas redondas", () => {
    expect(niceTicks(11)).toEqual([0, 5, 10, 15]);
    expect(niceTicks(100, 5)).toEqual([0, 20, 40, 60, 80, 100]);
    expect(niceTicks(0)).toEqual([0, 1]);
  });
  it("formato es-CO con un decimal", () => {
    expect(fmt(94.35, "%")).toBe("94,4%");
    expect(fmt(null)).toBe("—");
  });
});

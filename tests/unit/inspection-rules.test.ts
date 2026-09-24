import { describe, expect, it } from "vitest";
import {
  describeRule,
  evaluateCompliance,
  formatAnswerValue,
  isEvaluable,
  normalizeAnswerValue,
} from "@/lib/inspection-rules";

const TODAY = "2026-09-24";

describe("evaluateCompliance", () => {
  it("Sí/No: por defecto NO no cumple", () => {
    const q = { responseType: "YES_NO" as const };
    expect(evaluateCompliance(q, "YES", TODAY)).toBe(true);
    expect(evaluateCompliance(q, "NO", TODAY)).toBe(false);
  });

  it("Sí/No invertida (¿Tiene elementos faltantes?): SÍ no cumple", () => {
    const q = { responseType: "YES_NO" as const, complianceRule: { nonCompliantValues: ["YES"] } };
    expect(evaluateCompliance(q, "YES", TODAY)).toBe(false);
    expect(evaluateCompliance(q, "NO", TODAY)).toBe(true);
  });

  it("No aplica y sin respuesta no se evalúan", () => {
    const q = { responseType: "YES_NO_NA" as const };
    expect(evaluateCompliance(q, "NA", TODAY)).toBeNull();
    expect(evaluateCompliance(q, null, TODAY)).toBeNull();
  });

  it("Cumple / No cumple", () => {
    const q = { responseType: "COMPLIES" as const };
    expect(evaluateCompliance(q, "NOT_COMPLIES", TODAY)).toBe(false);
  });

  it("Número con rango", () => {
    const q = { responseType: "NUMBER" as const, complianceRule: { min: 10, max: 20 } };
    expect(evaluateCompliance(q, 15, TODAY)).toBe(true);
    expect(evaluateCompliance(q, 9, TODAY)).toBe(false);
    expect(evaluateCompliance(q, 21, TODAY)).toBe(false);
  });

  it("Número sin rango no es evaluable", () => {
    expect(evaluateCompliance({ responseType: "NUMBER" }, 5, TODAY)).toBeNull();
  });

  it("Fecha no vencida", () => {
    const q = { responseType: "DATE" as const, complianceRule: { dateNotPast: true } };
    expect(evaluateCompliance(q, "2026-09-24", TODAY)).toBe(true);
    expect(evaluateCompliance(q, "2026-09-23", TODAY)).toBe(false);
  });

  it("Selección y selección múltiple", () => {
    const options = [
      { value: "Bueno", label: "Bueno" },
      { value: "Malo", label: "Malo" },
    ];
    const rule = { nonCompliantValues: ["Malo"] };
    expect(evaluateCompliance({ responseType: "SELECT", options, complianceRule: rule }, "Malo", TODAY)).toBe(false);
    expect(evaluateCompliance({ responseType: "MULTI_SELECT", options, complianceRule: rule }, ["Bueno"], TODAY)).toBe(true);
    expect(evaluateCompliance({ responseType: "MULTI_SELECT", options, complianceRule: rule }, ["Bueno", "Malo"], TODAY)).toBe(false);
    expect(isEvaluable({ responseType: "SELECT", options })).toBe(false);
  });

  it("Texto y foto nunca se evalúan", () => {
    expect(evaluateCompliance({ responseType: "TEXT" }, "ok", TODAY)).toBeNull();
    expect(isEvaluable({ responseType: "PHOTO" })).toBe(false);
  });
});

describe("normalizeAnswerValue", () => {
  it("rechaza opciones inválidas", () => {
    expect(() => normalizeAnswerValue({ responseType: "YES_NO" }, "QUIZAS")).toThrow();
    expect(() => normalizeAnswerValue({ responseType: "YES_NO" }, "NA")).toThrow(); // NA solo en YES_NO_NA
    expect(normalizeAnswerValue({ responseType: "YES_NO_NA" }, "NA")).toBe("NA");
  });
  it("números con coma decimal", () => {
    expect(normalizeAnswerValue({ responseType: "NUMBER" }, "12,5")).toBe(12.5);
    expect(() => normalizeAnswerValue({ responseType: "NUMBER" }, "abc")).toThrow();
  });
  it("fechas ISO", () => {
    expect(normalizeAnswerValue({ responseType: "DATE" }, "2026-10-01")).toBe("2026-10-01");
    expect(() => normalizeAnswerValue({ responseType: "DATE" }, "01/10/2026")).toThrow();
  });
  it("vacío = sin responder; selección múltiple sin duplicados", () => {
    expect(normalizeAnswerValue({ responseType: "TEXT" }, "")).toBeNull();
    const q = { responseType: "MULTI_SELECT" as const, options: [{ value: "A", label: "A" }, { value: "B", label: "B" }] };
    expect(normalizeAnswerValue(q, ["A", "A", "B"])).toEqual(["A", "B"]);
  });
});

describe("presentación", () => {
  it("formatea valores y describe reglas", () => {
    expect(formatAnswerValue({ responseType: "YES_NO" }, "NO")).toBe("No");
    expect(formatAnswerValue({ responseType: "DATE" }, "2026-10-01")).toBe("01/10/2026");
    expect(describeRule({ responseType: "YES_NO" })).toBe("No cumple si responde: No");
    expect(describeRule({ responseType: "NUMBER", complianceRule: { min: 1 } })).toBe("Cumple si es ≥ 1");
  });
});

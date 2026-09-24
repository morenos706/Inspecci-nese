import { describe, expect, it } from "vitest";
import { computeInspectionResult, DEFAULT_DUE_DAYS } from "@/lib/inspection-result";

const q = (id: string, required = true, responseType = "YES_NO") => ({ id, required, responseType });

describe("computeInspectionResult", () => {
  it("todas cumplen → CUMPLE 100%", () => {
    const r = computeInspectionResult(
      [q("a"), q("b")],
      [
        { questionId: "a", hasValue: true, isCompliant: true },
        { questionId: "b", hasValue: true, isCompliant: true },
      ],
    );
    expect(r).toMatchObject({ result: "COMPLIANT", compliancePct: 100, missingRequired: [], answeredCount: 2 });
  });

  it("una no cumple → NO CUMPLE; N/A y texto no cuentan en el %", () => {
    const r = computeInspectionResult(
      [q("a"), q("b"), q("c", false, "TEXT"), q("d", true, "YES_NO_NA")],
      [
        { questionId: "a", hasValue: true, isCompliant: true },
        { questionId: "b", hasValue: true, isCompliant: false },
        { questionId: "c", hasValue: true, isCompliant: null },
        { questionId: "d", hasValue: true, isCompliant: null },
      ],
    );
    expect(r.result).toBe("NON_COMPLIANT");
    expect(r.compliancePct).toBe(50);
    expect(r.nonCompliantCount).toBe(1);
  });

  it("detecta obligatorias sin responder, incluidas fotos sin archivo", () => {
    const r = computeInspectionResult(
      [q("a"), q("foto", true, "PHOTO"), q("opt", false)],
      [{ questionId: "a", hasValue: false, isCompliant: null }],
      { foto: 0 },
    );
    expect(r.missingRequired).toEqual(["a", "foto"]);
    const ok = computeInspectionResult([q("foto", true, "PHOTO")], [], { foto: 2 });
    expect(ok.missingRequired).toEqual([]);
    expect(ok.compliancePct).toBeNull();
  });

  it("plazos sugeridos por prioridad", () => {
    expect(DEFAULT_DUE_DAYS.CRITICAL).toBeLessThan(DEFAULT_DUE_DAYS.HIGH);
    expect(DEFAULT_DUE_DAYS.HIGH).toBeLessThan(DEFAULT_DUE_DAYS.LOW);
  });
});

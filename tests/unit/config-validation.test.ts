import { describe, expect, it } from "vitest";
import { elementSchema, elementTypeSchema, questionSchema } from "@/lib/validation/config";

const base = { elementTypeId: "t1", text: "¿Está completo?", required: "on", active: "on", generatesFinding: "on" };

describe("questionSchema", () => {
  it("Sí/No invertida genera la regla", () => {
    const q = questionSchema.parse({ ...base, responseType: "YES_NO", nonCompliantAnswer: "YES" });
    expect(q.complianceRule).toEqual({ nonCompliantValues: ["YES"] });
    expect(q.generatesFinding).toBe(true);
  });

  it("Sí/No normal no guarda regla (usa la de por defecto)", () => {
    expect(questionSchema.parse({ ...base, responseType: "YES_NO", nonCompliantAnswer: "NO" }).complianceRule).toBeNull();
  });

  it("Selección exige al menos 2 opciones y filtra no conformes inexistentes", () => {
    expect(questionSchema.safeParse({ ...base, responseType: "SELECT", optionsText: "Solo una" }).success).toBe(false);
    const q = questionSchema.parse({
      ...base,
      responseType: "SELECT",
      optionsText: "Bueno\nMalo\nBueno\n",
      nonCompliantOptions: ["Malo", "Inventada"],
    });
    expect(q.options).toEqual([
      { value: "Bueno", label: "Bueno" },
      { value: "Malo", label: "Malo" },
    ]);
    expect(q.complianceRule).toEqual({ nonCompliantValues: ["Malo"] });
  });

  it("Texto nunca genera hallazgo aunque se marque", () => {
    expect(questionSchema.parse({ ...base, responseType: "TEXT" }).generatesFinding).toBe(false);
  });

  it("Número: mínimo no puede superar máximo", () => {
    expect(questionSchema.safeParse({ ...base, responseType: "NUMBER", min: "10", max: "5" }).success).toBe(false);
    expect(questionSchema.parse({ ...base, responseType: "NUMBER", min: "1" }).complianceRule).toEqual({ min: 1 });
  });
});

describe("elementTypeSchema / elementSchema", () => {
  it("frecuencia personalizada exige días", () => {
    expect(elementTypeSchema.safeParse({ code: "X", name: "X", defaultFrequency: "CUSTOM" }).success).toBe(false);
    expect(elementTypeSchema.parse({ code: "X", name: "X", defaultFrequency: "MONTHLY", defaultFrequencyDays: "9" }).defaultFrequencyDays).toBeUndefined();
  });

  const element = { elementTypeId: "t", code: "ext-024", name: "Extintor", processId: "p", siteId: "s", frequency: "MONTHLY" };

  it("normaliza el código y convierte fechas", () => {
    const e = elementSchema.parse({ ...element, lastInspectionAt: "2026-09-01" });
    expect(e.code).toBe("EXT-024");
    expect(e.lastInspectionAt?.toISOString()).toBe("2026-09-01T12:00:00.000Z");
    expect(e.frequencyDays).toBeNull();
  });

  it("rechaza última inspección futura", () => {
    expect(elementSchema.safeParse({ ...element, lastInspectionAt: "2099-01-01" }).success).toBe(false);
  });
});

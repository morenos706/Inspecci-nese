import { describe, expect, it } from "vitest";
import { parseResponseType, parseYesNo, questionRowToForm, splitOptions } from "@/lib/import-questions";
import { questionSchema } from "@/lib/validation/config";

const row = (over: Partial<Parameters<typeof questionRowToForm>[0]>) => ({
  text: "¿Pregunta de prueba?",
  responseType: "Sí/No",
  options: "",
  nonCompliant: "",
  min: "",
  max: "",
  required: "",
  generatesFinding: "",
  priority: "",
  tracksExpiry: "",
  helpText: "",
  ...over,
});
const parse = (over: Partial<Parameters<typeof questionRowToForm>[0]>) => {
  const { form, errors } = questionRowToForm(row(over));
  expect(errors).toEqual([]);
  return questionSchema.parse({ ...form, elementTypeId: "t1" });
};

describe("tipos de respuesta", () => {
  it("reconoce variantes con tildes, espacios y barras", () => {
    expect(parseResponseType("Sí / No")).toBe("YES_NO");
    expect(parseResponseType("si/no/no aplica")).toBe("YES_NO_NA");
    expect(parseResponseType("Si / No / N/A")).toBe("YES_NO_NA");
    expect(parseResponseType("Número")).toBe("NUMBER");
    expect(parseResponseType("Selección")).toBe("SELECT");
    expect(parseResponseType("Foto")).toBe("PHOTO");
    expect(parseResponseType("Texto libre")).toBe("TEXT");
    expect(parseResponseType("otra cosa")).toBeNull();
  });
  it("opciones y Sí/No", () => {
    expect(splitOptions("Bueno / Malo / bueno")).toEqual(["Bueno", "Malo"]);
    expect(splitOptions("A; B\nC")).toEqual(["A", "B", "C"]);
    expect(parseYesNo("", true)).toBe(true);
    expect(parseYesNo("Sí", false)).toBe(true);
    expect(parseYesNo("quizá", false)).toBeNull();
  });
});

describe("fila → pregunta", () => {
  it("Sí/No negativa: «Sí» no cumple", () => {
    const q = parse({ text: "¿Se evidencian fugas?", nonCompliant: "Sí", priority: "Alta" });
    expect(q.complianceRule).toEqual({ nonCompliantValues: ["YES"] });
    expect(q.defaultPriority).toBe("HIGH");
  });
  it("selección con opciones que no cumplen", () => {
    const q = parse({ responseType: "Selección", options: "Bueno / Incompleto / Malo", nonCompliant: "incompleto / Malo" });
    expect(q.options?.map((o) => o.value)).toEqual(["Bueno", "Incompleto", "Malo"]);
    expect(q.complianceRule).toEqual({ nonCompliantValues: ["Incompleto", "Malo"] });
    expect(q.generatesFinding).toBe(true);
  });
  it("número con mínimo (cantidades de botiquín)", () => {
    const q = parse({ responseType: "Número", min: "1" });
    expect(q.complianceRule).toEqual({ min: 1 });
  });
  it("fecha de vencimiento: siempre no cumple si ya pasó", () => {
    const q = parse({ responseType: "Fecha", tracksExpiry: "Sí", priority: "Crítica" });
    expect(q.tracksExpiry).toBe(true);
    expect(q.complianceRule).toEqual({ dateNotPast: true });
    expect(q.defaultPriority).toBe("CRITICAL");
  });
  it("texto y foto no generan hallazgos", () => {
    expect(parse({ responseType: "Texto", required: "No" }).generatesFinding).toBe(false);
    expect(parse({ responseType: "Foto" }).generatesFinding).toBe(false);
  });
  it("errores claros", () => {
    expect(questionRowToForm(row({ responseType: "Colores" })).errors[0]).toMatch(/Tipo de respuesta/);
    expect(questionRowToForm(row({ responseType: "Selección", options: "Solo una" })).errors[0]).toMatch(/al menos 2/);
    expect(questionRowToForm(row({ responseType: "Selección", options: "A / B", nonCompliant: "C" })).errors[0]).toMatch(/una de las opciones/);
    expect(questionRowToForm(row({ tracksExpiry: "Sí" })).errors[0]).toMatch(/Fecha/);
    expect(questionRowToForm(row({ priority: "Urgente" })).errors[0]).toMatch(/Prioridad/);
  });
});

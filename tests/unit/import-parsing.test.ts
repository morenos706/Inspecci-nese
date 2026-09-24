import { describe, expect, it } from "vitest";
import { cellText, findByCodeOrName, normalizeKey, parseDateCell, parseElementStatus, parseFrequency } from "@/lib/import-parsing";

describe("carga masiva: interpretación de celdas", () => {
  it("normaliza encabezados", () => {
    expect(normalizeKey("  Código*  ")).toBe("codigo");
    expect(normalizeKey("Última  inspección")).toBe("ultima inspeccion");
  });

  it("fechas en varios formatos", () => {
    expect(parseDateCell("01/09/2026")).toBe("2026-09-01");
    expect(parseDateCell("1-9-26")).toBe("2026-09-01");
    expect(parseDateCell("2026-09-01")).toBe("2026-09-01");
    expect(parseDateCell(new Date(Date.UTC(2026, 8, 1)))).toBe("2026-09-01");
    expect(parseDateCell(46266)).toBe("2026-09-01"); // número de serie de Excel
    expect(parseDateCell("")).toBeNull();
    expect(() => parseDateCell("31/02/2026")).toThrow();
    expect(() => parseDateCell("ayer")).toThrow();
  });

  it("frecuencias y estados en español", () => {
    expect(parseFrequency("Mensual")).toBe("MONTHLY");
    expect(parseFrequency("TRIMESTRAL")).toBe("QUARTERLY");
    expect(parseFrequency("quincenal")).toBe("BIWEEKLY");
    expect(parseFrequency("cada tanto")).toBeNull();
    expect(parseElementStatus("En mantenimiento")).toBe("MAINTENANCE");
    expect(parseElementStatus("")).toBe("ACTIVE");
    expect(parseElementStatus("roto")).toBeNull();
  });

  it("texto de celdas con fórmulas o texto enriquecido", () => {
    expect(cellText({ richText: [{ text: "EXT" }, { text: "-001" }] })).toBe("EXT-001");
    expect(cellText({ formula: "A1", result: 5 })).toBe("5");
    expect(cellText(null)).toBe("");
  });

  it("busca por código o nombre sin tildes", () => {
    const items = [{ code: "PROD", name: "Producción" }];
    expect(findByCodeOrName(items, "produccion")?.code).toBe("PROD");
    expect(findByCodeOrName(items, "prod")?.code).toBe("PROD");
    expect(findByCodeOrName(items, "otro")).toBeUndefined();
  });
});

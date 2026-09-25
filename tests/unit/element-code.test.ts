import { describe, expect, it } from "vitest";
import { firstFreeCode, idFromCode, idKey, nextIdNumber, normalizeIdNumber, recodeElement, typeCodePrefix } from "@/lib/element-code";

describe("recodificación por sede y zona", () => {
  it("cambia el prefijo de sede", () => {
    expect(recodeElement("PRO-EXT-023", { fromSite: "PRO", toSite: "COM" })).toBe("COM-EXT-023");
    expect(recodeElement("PRO-EXT-R01", { fromSite: "pro", toSite: "rio" })).toBe("RIO-EXT-R01");
  });
  it("cambia el segmento de zona si el código lo incluye", () => {
    expect(recodeElement("PRO-MANT-EXT-023", { fromSite: "PRO", toSite: "RIO", fromZone: "MANT", toZone: "BODEGA" })).toBe(
      "RIO-BODEGA-EXT-023",
    );
    expect(recodeElement("PRO-EXT-023", { fromZone: "MANT", toZone: "ENV" })).toBe("PRO-EXT-023");
  });
  it("no toca códigos con otro formato", () => {
    expect(recodeElement("EXT-023", { fromSite: "PRO", toSite: "COM" })).toBe("EXT-023");
    expect(recodeElement("EXTINTOR23", { fromSite: "PRO", toSite: "COM" })).toBe("EXTINTOR23");
  });
  it("evita duplicados", () => {
    const taken = new Set(["COM-EXT-023", "COM-EXT-023-2"]);
    expect(firstFreeCode("COM-EXT-023", (c) => taken.has(c))).toBe("COM-EXT-023-3");
    expect(firstFreeCode("COM-EXT-024", (c) => taken.has(c))).toBe("COM-EXT-024");
  });
});

describe("código automático", () => {
  it("prefijo del tipo", () => {
    expect(typeCodePrefix({ code: "EXT", codePrefix: null })).toBe("EXT");
    expect(typeCodePrefix({ code: "BOTF", codePrefix: "bot" })).toBe("BOT");
  });
  it("recodifica el tipo", () => {
    expect(recodeElement("PRO-BOT-002", { fromType: "BOT", toType: "BOTF" })).toBe("PRO-BOTF-002");
  });
});

describe("ID del elemento", () => {
  it("normaliza lo que escribe el usuario", () => {
    expect(normalizeIdNumber("23")).toBe("023");
    expect(normalizeIdNumber(" 0023 ")).toBe("023");
    expect(normalizeIdNumber("34a")).toBe("034A");
    expect(normalizeIdNumber("1250")).toBe("1250");
    expect(normalizeIdNumber("A-1")).toBeNull();
    expect(normalizeIdNumber("")).toBeNull();
  });
  it("lee el ID del código y lo compara sin ceros", () => {
    expect(idFromCode("PRO-EXT-023", "EXT")).toBe("23");
    expect(idFromCode("COM-EXT-023-2", "EXT")).toBe("23");
    expect(idFromCode("PRO-EXT-034A", "EXT")).toBe("34A");
    expect(idFromCode("PRO-EXT-R01", "EXT")).toBeNull();
    expect(idFromCode("PRO-LUZ-023", "EXT")).toBeNull();
    expect(idKey("023")).toBe(idKey("23"));
  });
  it("siguiente número libre en todas las sedes", () => {
    expect(nextIdNumber(["PRO-EXT-023", "COM-EXT-120", "RIO-EXT-007", "PRO-LUZ-900"], "EXT")).toBe("121");
    expect(nextIdNumber([], "ALA")).toBe("001");
  });
});

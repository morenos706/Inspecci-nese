import { describe, expect, it } from "vitest";
import { firstFreeCode, recodeElement } from "@/lib/element-code";

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

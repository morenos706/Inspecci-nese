import { describe, expect, it } from "vitest";
import { expiryDateFromISO, expiryLabelFromQuestion, expiryRange, expiryStatus } from "@/lib/expiry";

const TODAY = "2026-09-24";

describe("expiryStatus", () => {
  it("vencido si la fecha ya pasó (ayer)", () => {
    expect(expiryStatus(expiryDateFromISO("2026-09-23"), TODAY)).toBe("EXPIRED");
  });
  it("hoy aún no está vencido, pero está por vencer", () => {
    expect(expiryStatus(expiryDateFromISO("2026-09-24"), TODAY)).toBe("EXPIRING");
  });
  it("por vencer dentro de 30 días; vigente después", () => {
    expect(expiryStatus(expiryDateFromISO("2026-10-24"), TODAY)).toBe("EXPIRING");
    expect(expiryStatus(expiryDateFromISO("2026-10-25"), TODAY)).toBe("VALID");
  });
  it("sin fecha", () => {
    expect(expiryStatus(null, TODAY)).toBe("NONE");
  });

  // El filtro SQL debe coincidir exactamente con el estado mostrado.
  it.each(["2026-09-22", "2026-09-23", "2026-09-24", "2026-10-24", "2026-10-25"])("rango SQL coherente (%s)", (iso) => {
    const d = expiryDateFromISO(iso);
    const inRange = (r: { lt?: Date; gte?: Date; lte?: Date }) =>
      (!r.lt || d < r.lt) && (!r.gte || d >= r.gte) && (!r.lte || d <= r.lte);
    const status = expiryStatus(d, TODAY);
    expect(inRange(expiryRange("EXPIRED", TODAY))).toBe(status === "EXPIRED");
    expect(inRange(expiryRange("EXPIRING", TODAY))).toBe(status === "EXPIRING");
  });
});

describe("expiryLabelFromQuestion", () => {
  it.each([
    ["Fecha de vencimiento de la recarga", "Recarga"],
    ["¿Fecha de caducidad de los insumos?", "Insumos"],
    ["Vencimiento del mantenimiento", "Mantenimiento"],
    ["Próxima prueba hidrostática", "Próxima prueba hidrostática"],
    ["Fecha de vencimiento", "Vencimiento"],
  ])("%s → %s", (text, label) => {
    expect(expiryLabelFromQuestion(text)).toBe(label);
  });
});

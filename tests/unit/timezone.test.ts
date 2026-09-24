import { describe, expect, it } from "vitest";
import { addDaysISO, todayISO, zonedDayBoundary } from "@/lib/utils";

describe("fechas en zona horaria de la app", () => {
  it("hoy en Bogotá difiere de UTC cerca de medianoche", () => {
    // 2026-09-25 03:00 UTC = 2026-09-24 22:00 en Bogotá (UTC-5)
    expect(todayISO(new Date("2026-09-25T03:00:00Z"), "America/Bogota")).toBe("2026-09-24");
  });

  it("límites del día local como instante UTC", () => {
    expect(zonedDayBoundary("2026-09-24", "start", "America/Bogota").toISOString()).toBe("2026-09-24T05:00:00.000Z");
    expect(zonedDayBoundary("2026-09-24", "end", "America/Bogota").toISOString()).toBe("2026-09-25T04:59:59.999Z");
  });

  it("suma días a fechas ISO (cruza meses)", () => {
    expect(addDaysISO("2026-09-24", 7)).toBe("2026-10-01");
  });
});

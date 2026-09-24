import { describe, expect, it } from "vitest";
import { ALL_PERMISSIONS, readScope, SYSTEM_ROLES, isPermissionCode } from "@/lib/permissions";

describe("catálogo de permisos", () => {
  it("todos los permisos de los roles del sistema existen en el catálogo", () => {
    for (const role of Object.values(SYSTEM_ROLES)) {
      for (const p of role.permissions) expect(isPermissionCode(p)).toBe(true);
    }
  });

  it("ADMIN tiene todos los permisos", () => {
    expect(new Set(SYSTEM_ROLES.ADMIN.permissions)).toEqual(new Set(ALL_PERMISSIONS));
  });

  it("solo ADMIN puede cerrar hallazgos y planes por defecto", () => {
    for (const [code, role] of Object.entries(SYSTEM_ROLES)) {
      const perms = role.permissions as readonly string[];
      if (code === "ADMIN") continue;
      expect(perms).not.toContain("findings.close");
      expect(perms).not.toContain("actions.close");
    }
  });

  it("el responsable de acción no puede verificar (segregación de funciones)", () => {
    expect(SYSTEM_ROLES.ACTION_OWNER.permissions as readonly string[]).not.toContain("actions.verify");
  });
});

describe("readScope", () => {
  it("devuelve el alcance más amplio", () => {
    expect(readScope(new Set(["findings.read.assigned", "findings.read.process"]), "findings")).toBe("process");
    expect(readScope(new Set(["findings.read.all", "findings.read.assigned"]), "findings")).toBe("all");
  });
  it("null si no tiene lectura", () => {
    expect(readScope(new Set(["inspections.perform"]), "findings")).toBeNull();
  });
});

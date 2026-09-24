import { describe, expect, it } from "vitest";
import { formDataToObject } from "@/lib/validation/form";
import { processSchema, userCreateSchema } from "@/lib/validation/admin";
import { resetPasswordSchema } from "@/lib/validation/auth";
import { safeRedirectPath } from "@/lib/safe-redirect";

describe("formDataToObject", () => {
  it("convierte vacíos en undefined, recorta y agrupa arrays", () => {
    const fd = new FormData();
    fd.set("name", "  Juan  ");
    fd.set("phone", "");
    fd.append("roleIds", "a");
    fd.append("roleIds", "b");
    expect(formDataToObject(fd, ["roleIds", "processIds"])).toEqual({
      name: "Juan",
      phone: undefined,
      roleIds: ["a", "b"],
      processIds: [],
    });
  });
});

describe("esquemas", () => {
  it("normaliza el código en mayúsculas y el checkbox a booleano", () => {
    const parsed = processSchema.parse({ code: "prod", name: "Producción", active: "on" });
    expect(parsed.code).toBe("PROD");
    expect(parsed.active).toBe(true);
    expect(processSchema.parse({ code: "X", name: "Y" }).active).toBe(false);
  });

  it("rechaza códigos con caracteres inválidos", () => {
    expect(processSchema.safeParse({ code: "PR OD", name: "x" }).success).toBe(false);
  });

  it("usuario: correo en minúsculas y al menos un rol", () => {
    const ok = userCreateSchema.safeParse({ name: "Ana", email: "ANA@Mail.com", roleIds: ["r1"], processIds: [] });
    expect(ok.success && ok.data.email).toBe("ana@mail.com");
    expect(userCreateSchema.safeParse({ name: "Ana", email: "ana@mail.com", roleIds: [] }).success).toBe(false);
  });

  it("contraseña: política y confirmación", () => {
    expect(resetPasswordSchema.safeParse({ token: "x".repeat(20), password: "debil", confirmPassword: "debil" }).success).toBe(false);
    expect(
      resetPasswordSchema.safeParse({ token: "x".repeat(20), password: "Segura123", confirmPassword: "Otra1234A" }).success,
    ).toBe(false);
    expect(
      resetPasswordSchema.safeParse({ token: "x".repeat(20), password: "Segura123", confirmPassword: "Segura123" }).success,
    ).toBe(true);
  });
});

describe("safeRedirectPath (anti open-redirect)", () => {
  it.each([
    ["/admin/users", "/admin/users"],
    ["//evil.com", "/"],
    ["https://evil.com", "/"],
    ["/\\evil.com", "/"],
    [undefined, "/"],
  ])("%s → %s", (input, expected) => {
    expect(safeRedirectPath(input)).toBe(expected);
  });
});

import { describe, expect, it } from "vitest";
import { explainMailError } from "@/lib/mail-errors";

describe("explicación de errores SMTP", () => {
  it("credenciales de Gmail", () => {
    expect(explainMailError("Invalid login: 535-5.7.8 Username and Password not accepted", "smtp.gmail.com")).toMatch(/contraseña de aplicación/);
  });
  it("conexión y host", () => {
    expect(explainMailError("connect ETIMEDOUT 1.2.3.4:587", "smtp.gmail.com")).toMatch(/SMTP_PORT/);
    expect(explainMailError("getaddrinfo ENOTFOUND smtp.gmial.com", "smtp.gmial.com")).toMatch(/smtp\.gmial\.com/);
  });
  it("cifrado y remitente", () => {
    expect(explainMailError("ssl3_get_record:wrong version number")).toMatch(/SMTP_SECURE/);
    expect(explainMailError("553 Sender address rejected")).toMatch(/MAIL_FROM/);
  });
  it("genérico", () => {
    expect(explainMailError("algo raro")).toMatch(/SMTP_/);
  });
});

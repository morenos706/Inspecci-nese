import { describe, expect, it } from "vitest";
import {
  DEFAULT_EMAIL_CONFIG,
  fillPlaceholders,
  htmlToText,
  renderEmail,
  resolveEmailConfig,
  SAMPLE_VARS,
  sanitizeEmailHtml,
} from "@/lib/email-templates";

describe("plantillas de correo", () => {
  it("reemplaza variables con escape HTML y respeta saltos de línea", () => {
    expect(fillPlaceholders("Hola {{nombre}}", { nombre: "<b>Ana</b>" }, "html")).toBe("Hola &lt;b&gt;Ana&lt;/b&gt;");
    expect(fillPlaceholders("{{mensaje}}", { mensaje: "a\nb" }, "html")).toBe("a<br>b");
    expect(fillPlaceholders("{{ NOMBRE }} {{otra}}", { nombre: "Ana" }, "text")).toBe("Ana {{otra}}");
  });
  it("limpia HTML peligroso", () => {
    const dirty = '<p onclick="x()">Hola</p><script>alert(1)</script><a href="javascript:alert(1)">x</a><iframe src="a"></iframe><style>p{}</style>';
    const clean = sanitizeEmailHtml(dirty);
    expect(clean).not.toMatch(/script|onclick|javascript:|iframe|<style/i);
    expect(clean).toContain("<p>Hola</p>");
  });
  it("arma el correo completo con marca, botón y texto alterno", () => {
    const mail = renderEmail(DEFAULT_EMAIL_CONFIG, "notification", SAMPLE_VARS.notification);
    expect(mail.subject).toBe("Se te asignó el plan #000021");
    expect(mail.html).toContain("Inspecciones de Emergencia");
    expect(mail.html).toContain('href="https://inspecciones.miempresa.com/action-plans/ejemplo"');
    expect(mail.html).toContain("Fecha límite: 30/09/2026");
    expect(mail.text).toContain("Ver en el sistema: https://");
  });
  it("usa la configuración guardada y completa lo que falte", () => {
    const cfg = resolveEmailConfig({ brand: { companyName: "ACME S.A.S.", primaryColor: "#123456" }, templates: { welcome: { subject: "Bienvenido a {{empresa}}" } } });
    expect(cfg.brand.accentColor).toBe(DEFAULT_EMAIL_CONFIG.brand.accentColor);
    const mail = renderEmail(cfg, "welcome", SAMPLE_VARS.welcome);
    expect(mail.subject).toBe("Bienvenido a ACME S.A.S.");
    expect(mail.html).toContain("#123456");
    expect(resolveEmailConfig({ brand: { primaryColor: "rojo" } })).toEqual(DEFAULT_EMAIL_CONFIG);
  });
  it("html a texto", () => {
    expect(htmlToText("<p>Hola</p><p>A &amp; B</p>")).toBe("Hola\nA & B");
  });
});

import { describe, expect, it } from "vitest";
import { detectMimeType, sanitizeFileName } from "@/lib/uploads";

const bytes = (...b: number[]) => new Uint8Array([...b, ...new Array(16).fill(0)]);

describe("detectMimeType (magic bytes)", () => {
  it("reconoce JPEG, PNG, WEBP y PDF", () => {
    expect(detectMimeType(bytes(0xff, 0xd8, 0xff, 0xe0))).toBe("image/jpeg");
    expect(detectMimeType(bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a))).toBe("image/png");
    expect(detectMimeType(bytes(0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50))).toBe("image/webp");
    expect(detectMimeType(new TextEncoder().encode("%PDF-1.7 ..."))).toBe("application/pdf");
  });

  it("rechaza contenido disfrazado (HTML/SVG/ejecutables con extensión de imagen)", () => {
    expect(detectMimeType(new TextEncoder().encode("<svg onload=alert(1)>"))).toBeNull();
    expect(detectMimeType(new TextEncoder().encode("<html><script>"))).toBeNull();
    expect(detectMimeType(bytes(0x4d, 0x5a))).toBeNull(); // MZ (exe)
  });
});

describe("sanitizeFileName", () => {
  it("quita rutas y caracteres peligrosos", () => {
    expect(sanitizeFileName("../../etc/passwd")).toBe("passwd");
    expect(sanitizeFileName('C:\\fotos\\a"<b>.jpg')).toBe("ab.jpg");
    expect(sanitizeFileName("", "foto.jpg")).toBe("foto.jpg");
  });
});

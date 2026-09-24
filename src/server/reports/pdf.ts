import "server-only";
import { PDFDocument, rgb, StandardFonts, type PDFFont, type PDFImage, type PDFPage } from "pdf-lib";
import type { Cell, ReportSection, TableReport } from "@/server/reports/types";

const INK = rgb(0.06, 0.09, 0.16);
const MUTED = rgb(0.39, 0.45, 0.55);
const BRAND = rgb(0.73, 0.11, 0.11);
const RULE = rgb(0.89, 0.91, 0.94);
const HEADER_BG = rgb(0.95, 0.96, 0.98);
const ZEBRA = rgb(0.985, 0.988, 0.992);

const MARGIN = 36;

/**
 * Documento PDF con utilidades de maquetación: texto con ajuste de línea,
 * tablas con salto de página y encabezado repetido, imágenes y pie con
 * numeración. Usa las fuentes estándar (Helvetica, codificación WinAnsi):
 * cubre el español; los caracteres no representables se sustituyen.
 */
export class PdfBuilder {
  private doc!: PDFDocument;
  private font!: PDFFont;
  private bold!: PDFFont;
  page!: PDFPage;
  y = 0;
  private readonly size: [number, number];
  private charCache = new Map<string, string>();

  constructor(
    private readonly meta: { organization: string; title: string; generatedBy: string; generatedAt: string },
    landscape = false,
  ) {
    this.size = landscape ? [842, 595] : [595, 842];
  }

  static async create(meta: PdfBuilder["meta"], landscape = false) {
    const b = new PdfBuilder(meta, landscape);
    b.doc = await PDFDocument.create();
    b.doc.setTitle(meta.title);
    b.doc.setCreator("Inspecciones de Emergencia");
    b.font = await b.doc.embedFont(StandardFonts.Helvetica);
    b.bold = await b.doc.embedFont(StandardFonts.HelveticaBold);
    b.addPage();
    return b;
  }

  get width() {
    return this.size[0] - MARGIN * 2;
  }

  /** Sustituye caracteres que Helvetica/WinAnsi no puede codificar. */
  safe(text: string): string {
    const replacements: Record<string, string> = { "≥": ">=", "≤": "<=", "✓": "OK", "→": "->", "–": "-", " ": " " };
    let out = "";
    for (const ch of text.replace(/\r/g, "")) {
      let s = this.charCache.get(ch);
      if (s === undefined) {
        s = replacements[ch] ?? ch;
        try {
          this.font.encodeText(s);
        } catch {
          s = "?";
        }
        this.charCache.set(ch, s);
      }
      out += s;
    }
    return out;
  }

  private addPage() {
    this.page = this.doc.addPage(this.size);
    const [w, h] = this.size;
    this.page.drawRectangle({ x: 0, y: h - 6, width: w, height: 6, color: BRAND });
    this.page.drawText(this.safe(this.meta.organization.toUpperCase()), { x: MARGIN, y: h - 26, size: 8, font: this.bold, color: BRAND });
    this.page.drawText(this.safe(this.meta.title), {
      x: w - MARGIN - this.font.widthOfTextAtSize(this.safe(this.meta.title), 8),
      y: h - 26,
      size: 8,
      font: this.font,
      color: MUTED,
    });
    this.y = h - 44;
  }

  ensure(height: number) {
    if (this.y - height < MARGIN + 20) this.addPage();
  }

  wrap(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
    const lines: string[] = [];
    for (const paragraph of this.safe(text).split("\n")) {
      let line = "";
      for (const word of paragraph.split(/\s+/)) {
        const candidate = line ? `${line} ${word}` : word;
        if (font.widthOfTextAtSize(candidate, size) <= maxWidth) {
          line = candidate;
          continue;
        }
        if (line) lines.push(line);
        // palabra más larga que el ancho: se corta
        let rest = word;
        while (font.widthOfTextAtSize(rest, size) > maxWidth && rest.length > 1) {
          let cut = rest.length - 1;
          while (cut > 1 && font.widthOfTextAtSize(rest.slice(0, cut), size) > maxWidth) cut--;
          lines.push(rest.slice(0, cut));
          rest = rest.slice(cut);
        }
        line = rest;
      }
      lines.push(line);
    }
    return lines;
  }

  text(content: string, opts: { size?: number; bold?: boolean; color?: ReturnType<typeof rgb>; gap?: number; x?: number; width?: number } = {}) {
    const size = opts.size ?? 10;
    const font = opts.bold ? this.bold : this.font;
    const lines = this.wrap(content, font, size, opts.width ?? this.width);
    for (const line of lines) {
      this.ensure(size + 3);
      this.page.drawText(line, { x: MARGIN + (opts.x ?? 0), y: this.y - size, size, font, color: opts.color ?? INK });
      this.y -= size + 3;
    }
    this.y -= opts.gap ?? 4;
  }

  heading(title: string, subtitle?: string) {
    this.text(title, { size: 16, bold: true, gap: 2 });
    if (subtitle) this.text(subtitle, { size: 9, color: MUTED, gap: 8 });
  }

  /** Pares etiqueta/valor en columnas. */
  keyValues(pairs: [string, string][], columns = 3) {
    const colW = this.width / columns;
    for (let i = 0; i < pairs.length; i += columns) {
      const chunk = pairs.slice(i, i + columns);
      const heights = chunk.map(([, v]) => this.wrap(v, this.bold, 10, colW - 10).length);
      const h = 12 + Math.max(...heights) * 13;
      this.ensure(h + 4);
      chunk.forEach(([label, value], c) => {
        const x = MARGIN + c * colW;
        this.page.drawText(this.safe(label), { x, y: this.y - 8, size: 7.5, font: this.font, color: MUTED });
        this.wrap(value, this.bold, 10, colW - 10).forEach((line, li) =>
          this.page.drawText(line, { x, y: this.y - 21 - li * 13, size: 10, font: this.bold, color: INK }),
        );
      });
      this.y -= h + 6;
    }
    this.y -= 4;
  }

  /**
   * Anchos proporcionales a `width`, pero ninguna columna queda más angosta
   * que su palabra más larga (códigos, fechas, encabezados), hasta un tope.
   * El espacio extra se toma de las columnas que tienen holgura.
   */
  private columnWidths(section: ReportSection, size: number, pad: number): number[] {
    const cap = 90;
    const longest = (text: string, font: PDFFont) =>
      Math.max(0, ...this.safe(text).split(/\s+/).map((w) => font.widthOfTextAtSize(w, size)));
    const mins = section.columns.map((c, i) => {
      let m = longest(c.header, this.bold);
      for (const row of section.rows.slice(0, 500)) m = Math.max(m, longest(formatCell(row[i] ?? null), this.font));
      return Math.min(cap, m + pad * 2 + 1);
    });
    const total = section.columns.reduce((a, c) => a + c.width, 0);
    const widths = section.columns.map((c) => (c.width / total) * this.width);
    for (let pass = 0; pass < 5; pass++) {
      const deficit = widths.reduce((a, w, i) => a + Math.max(0, mins[i]! - w), 0);
      if (deficit < 0.5) break;
      const slack = widths.map((w, i) => Math.max(0, w - mins[i]!));
      const totalSlack = slack.reduce((a, b) => a + b, 0);
      if (totalSlack <= 0) break;
      const take = Math.min(deficit, totalSlack);
      widths.forEach((w, i) => {
        widths[i] = w < mins[i]! ? mins[i]! : w - (slack[i]! / totalSlack) * take;
      });
    }
    // normaliza por si no hubo holgura suficiente
    const sum = widths.reduce((a, b) => a + b, 0);
    return widths.map((w) => (w / sum) * this.width);
  }

  table(section: ReportSection) {
    const size = 8;
    const pad = 4;
    const widths = this.columnWidths(section, size, pad);
    const drawHeader = () => {
      const lines = section.columns.map((c, i) => this.wrap(c.header, this.bold, size, widths[i]! - pad * 2));
      const h = Math.max(...lines.map((l) => l.length)) * (size + 2) + pad * 2;
      this.ensure(h + 16);
      this.page.drawRectangle({ x: MARGIN, y: this.y - h, width: this.width, height: h, color: HEADER_BG });
      let x = MARGIN;
      lines.forEach((ls, i) => {
        ls.forEach((line, li) => this.page.drawText(line, { x: x + pad, y: this.y - pad - size - li * (size + 2), size, font: this.bold, color: MUTED }));
        x += widths[i]!;
      });
      this.y -= h;
    };

    if (section.heading) this.text(section.heading, { size: 11, bold: true, gap: 4 });
    if (section.rows.length === 0) {
      this.text("Sin registros para los filtros seleccionados.", { size: 9, color: MUTED, gap: 10 });
      return;
    }
    drawHeader();
    section.rows.forEach((row, r) => {
      const cells = row.map((cell, i) => this.wrap(formatCell(cell), this.font, size, widths[i]! - pad * 2));
      const h = Math.max(...cells.map((c) => c.length)) * (size + 2) + pad * 2;
      if (this.y - h < MARGIN + 20) {
        this.addPage();
        drawHeader();
      }
      if (r % 2 === 1) this.page.drawRectangle({ x: MARGIN, y: this.y - h, width: this.width, height: h, color: ZEBRA });
      let x = MARGIN;
      cells.forEach((lines, i) => {
        const col = section.columns[i]!;
        lines.forEach((line, li) => {
          const tx = col.align === "right" ? x + widths[i]! - pad - this.font.widthOfTextAtSize(line, size) : x + pad;
          this.page.drawText(line, { x: tx, y: this.y - pad - size - li * (size + 2), size, font: this.font, color: INK });
        });
        x += widths[i]!;
      });
      this.y -= h;
      this.page.drawLine({ start: { x: MARGIN, y: this.y }, end: { x: MARGIN + this.width, y: this.y }, thickness: 0.5, color: RULE });
    });
    this.y -= 14;
  }

  async embedImage(bytes: Uint8Array, mime: string): Promise<PDFImage | null> {
    try {
      if (mime === "image/jpeg") return await this.doc.embedJpg(bytes);
      if (mime === "image/png") return await this.doc.embedPng(bytes);
    } catch {
      /* imagen dañada o formato no soportado (webp) */
    }
    return null;
  }

  /** Fila de miniaturas (ajustadas a una caja de `box` puntos). */
  images(images: PDFImage[], box = 120) {
    const gap = 8;
    const perRow = Math.max(1, Math.floor((this.width + gap) / (box + gap)));
    for (let i = 0; i < images.length; i += perRow) {
      this.ensure(box + gap);
      images.slice(i, i + perRow).forEach((img, c) => {
        const scale = Math.min(box / img.width, box / img.height);
        const w = img.width * scale;
        const h = img.height * scale;
        this.page.drawImage(img, { x: MARGIN + c * (box + gap) + (box - w) / 2, y: this.y - box + (box - h) / 2, width: w, height: h });
      });
      this.y -= box + gap;
    }
  }

  spacer(h = 8) {
    this.y -= h;
  }

  async save(): Promise<Uint8Array> {
    const pages = this.doc.getPages();
    pages.forEach((p, i) => {
      const footer = this.safe(`Generado el ${this.meta.generatedAt} por ${this.meta.generatedBy}`);
      p.drawText(footer, { x: MARGIN, y: 18, size: 7, font: this.font, color: MUTED });
      const num = `Página ${i + 1} de ${pages.length}`;
      p.drawText(this.safe(num), { x: this.size[0] - MARGIN - this.font.widthOfTextAtSize(this.safe(num), 7), y: 18, size: 7, font: this.font, color: MUTED });
    });
    return this.doc.save();
  }
}

export function formatCell(cell: Cell): string {
  if (cell === null || cell === undefined || cell === "") return "—";
  if (typeof cell === "number") return cell.toLocaleString("es-CO", { maximumFractionDigits: 1 });
  return String(cell);
}

/** Reporte tabular completo a PDF. */
export async function renderTablePdf(report: TableReport, meta: { organization: string; generatedBy: string; generatedAt: string }) {
  const pdf = await PdfBuilder.create({ ...meta, title: report.title }, report.landscape ?? true);
  pdf.heading(report.title, report.subtitle);
  if (report.summary?.length) pdf.keyValues(report.summary, report.landscape === false ? 3 : 5);
  for (const section of report.sections) pdf.table(section);
  return pdf.save();
}

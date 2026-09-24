import "server-only";
import ExcelJS from "exceljs";
import type { TableReport } from "@/server/reports/types";

/** Reporte tabular a Excel: una hoja por sección, encabezado fijo, filtros y anchos de columna. */
export async function renderTableXlsx(report: TableReport, meta: { organization: string; generatedBy: string; generatedAt: string }) {
  const wb = new ExcelJS.Workbook();
  wb.creator = meta.organization;
  wb.created = new Date();

  report.sections.forEach((section, i) => {
    const name = (section.heading ?? report.title).replace(/[\\/?*[\]:]/g, " ").slice(0, 31) || `Hoja ${i + 1}`;
    const ws = wb.addWorksheet(wb.worksheets.some((w) => w.name === name) ? `${name.slice(0, 28)} ${i + 1}` : name);
    ws.addRow([report.title]).font = { bold: true, size: 14 };
    if (report.subtitle) ws.addRow([report.subtitle]).font = { color: { argb: "FF64748B" } };
    ws.addRow([`Generado el ${meta.generatedAt} por ${meta.generatedBy}`]).font = { italic: true, size: 9, color: { argb: "FF64748B" } };
    if (i === 0 && report.summary?.length) {
      ws.addRow([]);
      for (const [label, value] of report.summary) {
        const row = ws.addRow([label, value]);
        row.getCell(1).font = { color: { argb: "FF64748B" } };
        row.getCell(2).font = { bold: true };
      }
    }
    ws.addRow([]);
    const headerRow = ws.addRow(section.columns.map((c) => c.header));
    headerRow.font = { bold: true, color: { argb: "FFFFFFFF" } };
    headerRow.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1D4ED8" } };
    const headerIndex = headerRow.number;
    for (const r of section.rows) ws.addRow(r.map((c) => (c === null ? "" : c)));
    section.columns.forEach((c, ci) => {
      ws.getColumn(ci + 1).width = Math.max(10, Math.min(60, c.width * 1.6));
      if (c.align === "right") ws.getColumn(ci + 1).alignment = { horizontal: "right" };
    });
    ws.views = [{ state: "frozen", ySplit: headerIndex }];
    if (section.rows.length > 0) {
      ws.autoFilter = { from: { row: headerIndex, column: 1 }, to: { row: headerIndex + section.rows.length, column: section.columns.length } };
    }
  });
  return Buffer.from(await wb.xlsx.writeBuffer());
}

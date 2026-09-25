import "server-only";
import type ExcelJS from "exceljs";
import { cellText, normalizeKey } from "@/lib/import-parsing";

/** Columna de una hoja de carga masiva (el * del encabezado indica obligatorio). */
export interface SheetColumn<K extends string = string> {
  key: K;
  header: string;
  width: number;
}

export interface RowIssue {
  row: number;
  code: string;
  action: "create" | "update" | "error";
  errors: string[];
  warnings: string[];
}

export interface ImportSection {
  key: "sites" | "processes" | "users" | "types" | "questions" | "zones" | "elements";
  title: string;
  rows: RowIssue[];
}

export const CODE_RE = /^[A-Z0-9_-]+$/;

/** Lee una hoja por nombre (sin distinguir mayúsculas ni tildes) mapeando encabezados a claves. */
export function readSheet<K extends string>(wb: ExcelJS.Workbook, name: string, columns: readonly { key: K; header: string }[]) {
  const ws = wb.worksheets.find((w) => normalizeKey(w.name) === normalizeKey(name));
  if (!ws) return [];
  const headerRow = ws.getRow(1);
  const map = new Map<number, K>();
  headerRow.eachCell((cell, col) => {
    const key = normalizeKey(cellText(cell.value)).replace(/\s*\(.*$/, "");
    const match = columns.find((c) => normalizeKey(c.header).replace(/\s*\(.*$/, "") === key || c.key === key);
    if (match) map.set(col, match.key);
  });
  const rows: { row: number; values: Record<K, unknown> }[] = [];
  ws.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;
    const values = {} as Record<K, unknown>;
    let any = false;
    map.forEach((key, col) => {
      const v = row.getCell(col).value;
      values[key] = v;
      if (cellText(v) !== "") any = true;
    });
    if (any) rows.push({ row: rowNumber, values });
  });
  return rows;
}

/** Filas de ejemplo de la plantilla: se ignoran al importar. */
export const isExampleRow = (text: unknown) => normalizeKey(cellText(text)).startsWith("fila de ejemplo");

/** Hoja con encabezado azul congelado y una fila de ejemplo en gris. */
export function addTemplateSheet<K extends string>(
  wb: ExcelJS.Workbook,
  name: string,
  columns: readonly SheetColumn<K>[],
  example: Partial<Record<K, string | number>>,
) {
  const ws = wb.addWorksheet(name, { views: [{ state: "frozen", ySplit: 1 }] });
  ws.columns = columns.map((c) => ({ header: c.header, key: c.key, width: c.width }));
  ws.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
  ws.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1D4ED8" } };
  ws.addRow(example);
  ws.getRow(2).font = { italic: true, color: { argb: "FF64748B" } };
  return ws;
}

/** Lista desplegable en una columna (filas 2..1000). */
export function addDropdown(ws: ExcelJS.Worksheet, colKey: string, formula: string) {
  const col = ws.getColumn(colKey);
  for (let r = 2; r <= 1000; r++) {
    ws.getCell(r, col.number).dataValidation = { type: "list", allowBlank: true, formulae: [formula], showErrorMessage: false };
  }
}

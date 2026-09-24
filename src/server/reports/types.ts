/** Reporte tabular genérico: se renderiza igual a PDF y a Excel. */
export type Cell = string | number | null;

export interface ReportColumn {
  header: string;
  /** Peso relativo del ancho en PDF y ancho aproximado (caracteres) en Excel. */
  width: number;
  align?: "left" | "right";
}

export interface ReportSection {
  heading?: string;
  columns: ReportColumn[];
  rows: Cell[][];
}

export interface TableReport {
  /** Nombre base del archivo, sin extensión. */
  fileName: string;
  title: string;
  subtitle?: string;
  /** Pares etiqueta / valor que se muestran como resumen. */
  summary?: [string, string][];
  sections: ReportSection[];
  landscape?: boolean;
}

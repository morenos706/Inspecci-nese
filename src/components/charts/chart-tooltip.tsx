export interface TooltipRow {
  label: string;
  value: string;
  color?: string;
}

/** Tooltip: el valor es lo destacado, la serie va en segundo plano; clave de serie con trazo corto. */
export function ChartTooltip({ x, y, title, rows, width }: { x: number; y: number; title: string; rows: TooltipRow[]; width: number }) {
  const left = Math.min(Math.max(x - 80, 0), width - 160);
  return (
    <div
      role="status"
      className="pointer-events-none absolute z-10 w-40 rounded-lg border border-border bg-surface px-3 py-2 text-xs shadow-lg"
      style={{ left, top: Math.max(0, y - 8), transform: "translateY(-100%)" }}
    >
      <p className="mb-1 font-medium text-subtle">{title}</p>
      {rows.map((r) => (
        <p key={r.label} className="flex items-center gap-2">
          {r.color && <span className="h-0.5 w-3 rounded" style={{ background: r.color }} aria-hidden />}
          <span className="text-sm font-semibold text-foreground">{r.value}</span>
          <span className="truncate text-subtle">{r.label}</span>
        </p>
      ))}
    </div>
  );
}

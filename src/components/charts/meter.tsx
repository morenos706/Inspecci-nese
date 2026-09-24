import { fmt } from "@/lib/chart-format";

/** Medidor de porcentaje: el riel es un tono claro de la misma escala que el relleno. */
export function Meter({ value, label }: { value: number | null; label: string }) {
  if (value === null) return <span className="text-subtle">—</span>;
  return (
    <span className="flex items-center gap-2" aria-label={`${label}: ${fmt(value, "%")}`}>
      <span className="h-2 w-20 overflow-hidden rounded-full bg-[#cde2fb]" aria-hidden>
        <span className="block h-full rounded-full bg-series-1" style={{ width: `${Math.min(100, value)}%` }} />
      </span>
      <span className="w-12 text-right text-sm font-semibold tabular-nums">{fmt(value, "%")}</span>
    </span>
  );
}

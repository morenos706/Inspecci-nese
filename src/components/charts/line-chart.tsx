"use client";

import { useState } from "react";
import { ChartTable } from "@/components/charts/chart-table";
import { ChartTooltip } from "@/components/charts/chart-tooltip";
import { fmt, niceTicks, useWidth } from "@/components/charts/chart-utils";

const H = 210;
const PAD = { top: 16, right: 12, bottom: 26, left: 40 };
const SERIES_COLORS = ["var(--color-series-1)", "var(--color-series-2)"];

export interface LineSeries {
  key: string;
  label: string;
  values: (number | null)[];
}

/**
 * Líneas en el tiempo (1–2 series, un solo eje). Línea 2 px, puntos 8 px con
 * anillo de 2 px del color de la superficie, cruz vertical que se ajusta al mes
 * más cercano y un tooltip con todas las series. Leyenda si hay 2 series.
 */
export function LineChart({
  labels,
  series,
  caption,
  unit = "",
  fixedMax,
}: {
  labels: string[];
  series: LineSeries[];
  caption: string;
  unit?: string;
  fixedMax?: number;
}) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [active, setActive] = useState<number | null>(null);
  const all = series.flatMap((s) => s.values.filter((v): v is number => v !== null));
  const ticks = fixedMax ? niceTicks(fixedMax, 5) : niceTicks(Math.max(1, ...all));
  const top = ticks.at(-1)!;
  const plotW = width - PAD.left - PAD.right;
  const plotH = H - PAD.top - PAD.bottom;
  const step = labels.length > 1 ? plotW / (labels.length - 1) : 0;
  const x = (i: number) => PAD.left + (labels.length > 1 ? step * i : plotW / 2);
  const y = (v: number) => PAD.top + plotH - (v / top) * plotH;
  const labelEvery = Math.ceil(labels.length / Math.max(1, Math.floor(plotW / 52)));

  function path(values: (number | null)[]) {
    let d = "";
    values.forEach((v, i) => {
      if (v === null) return;
      d += `${d && values[i - 1] !== null ? "L" : "M"}${x(i)},${y(v)} `;
    });
    return d.trim();
  }

  function nearest(clientX: number, rect: DOMRect) {
    const px = clientX - rect.left - PAD.left;
    return Math.min(labels.length - 1, Math.max(0, Math.round(labels.length > 1 ? px / step : 0)));
  }

  if (all.length === 0) return <p className="py-6 text-center text-sm text-subtle">Sin datos en el periodo.</p>;

  return (
    <div>
      {series.length > 1 && (
        <ul className="mb-2 flex flex-wrap gap-4 text-xs text-muted" aria-label="Leyenda">
          {series.map((s, i) => (
            <li key={s.key} className="flex items-center gap-1.5">
              <span className="h-0.5 w-4 rounded" style={{ background: SERIES_COLORS[i] }} aria-hidden />
              {s.label}
            </li>
          ))}
        </ul>
      )}
      <div
        ref={ref}
        className="relative w-full touch-pan-y"
        onPointerMove={(e) => setActive(nearest(e.clientX, e.currentTarget.getBoundingClientRect()))}
        onPointerLeave={() => setActive(null)}
      >
        <svg
          width={width}
          height={H}
          role="img"
          aria-label={caption}
          tabIndex={0}
          className="outline-none focus-visible:ring-2 focus-visible:ring-primary"
          onKeyDown={(e) => {
            if (e.key === "ArrowRight") setActive((a) => Math.min(labels.length - 1, (a ?? -1) + 1));
            if (e.key === "ArrowLeft") setActive((a) => Math.max(0, (a ?? labels.length) - 1));
          }}
          onBlur={() => setActive(null)}
        >
          {ticks.map((t) => (
            <g key={t}>
              <line x1={PAD.left} x2={width - PAD.right} y1={y(t)} y2={y(t)} stroke={t === 0 ? "var(--color-chart-axis)" : "var(--color-chart-grid)"} strokeWidth={1} />
              <text x={PAD.left - 6} y={y(t)} dy="0.32em" textAnchor="end" fontSize={11} fill="var(--color-chart-muted)" className="tabular-nums">
                {t.toLocaleString("es-CO")}
                {unit}
              </text>
            </g>
          ))}
          {labels.map((l, i) =>
            // Siempre se muestra el último mes; se omite una etiqueta regular que quedaría encima de él.
            (i % labelEvery === 0 && labels.length - 1 - i >= labelEvery) || i === labels.length - 1 ? (
              <text key={l} x={x(i)} y={H - 8} textAnchor={i === labels.length - 1 && labels.length > 1 ? "end" : "middle"} fontSize={11} fill="var(--color-chart-muted)">
                {l}
              </text>
            ) : null,
          )}
          {active !== null && <line x1={x(active)} x2={x(active)} y1={PAD.top} y2={PAD.top + plotH} stroke="var(--color-chart-axis)" strokeWidth={1} />}
          {series.map((s, si) => (
            <g key={s.key}>
              <path d={path(s.values)} fill="none" stroke={SERIES_COLORS[si]} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
              {s.values.map((v, i) =>
                v === null ? null : (
                  <circle
                    key={i}
                    cx={x(i)}
                    cy={y(v)}
                    r={active === i ? 5 : 4}
                    fill={SERIES_COLORS[si]}
                    stroke="var(--color-surface)"
                    strokeWidth={2}
                  />
                ),
              )}
            </g>
          ))}
        </svg>
        {active !== null && (
          <ChartTooltip
            x={x(active)}
            y={Math.min(...series.map((s) => (s.values[active] === null ? H : y(s.values[active]!))))}
            width={width}
            title={labels[active]!}
            rows={series.map((s, i) => ({ label: s.label, value: fmt(s.values[active], unit), color: SERIES_COLORS[i] }))}
          />
        )}
      </div>
      <ChartTable
        caption={caption}
        headers={["Mes", ...series.map((s) => s.label)]}
        rows={labels.map((l, i) => [l, ...series.map((s) => fmt(s.values[i], unit))])}
      />
    </div>
  );
}

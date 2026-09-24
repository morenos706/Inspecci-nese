"use client";

import { useState } from "react";
import { ChartTable } from "@/components/charts/chart-table";
import { ChartTooltip } from "@/components/charts/chart-tooltip";
import { fmt, niceTicks, useWidth } from "@/components/charts/chart-utils";

const H = 200;
const PAD = { top: 16, right: 8, bottom: 26, left: 32 };

/**
 * Columnas de una serie a lo largo del tiempo (p.ej. inspecciones por mes).
 * Columnas ≤24 px con 4 px redondeados arriba, eje único, rejilla hairline,
 * etiqueta directa solo en el máximo y el último valor; tooltip por columna.
 */
export function ColumnChart({
  data,
  seriesLabel,
  caption,
}: {
  data: { key: string; label: string; value: number }[];
  seriesLabel: string;
  caption: string;
}) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [active, setActive] = useState<number | null>(null);
  const ticks = niceTicks(Math.max(...data.map((d) => d.value), 1));
  const top = ticks.at(-1)!;
  const plotW = width - PAD.left - PAD.right;
  const plotH = H - PAD.top - PAD.bottom;
  const band = plotW / Math.max(1, data.length);
  const barW = Math.min(24, band * 0.6);
  const y = (v: number) => PAD.top + plotH - (v / top) * plotH;
  const maxIdx = data.reduce((best, d, i) => (d.value > data[best]!.value ? i : best), 0);
  const labelEvery = Math.ceil(data.length / Math.max(1, Math.floor(plotW / 44)));

  return (
    <div>
      <div ref={ref} className="relative w-full" onPointerLeave={() => setActive(null)}>
        <svg width={width} height={H} role="img" aria-label={caption}>
          {ticks.map((t) => (
            <g key={t}>
              <line x1={PAD.left} x2={width - PAD.right} y1={y(t)} y2={y(t)} stroke={t === 0 ? "var(--color-chart-axis)" : "var(--color-chart-grid)"} strokeWidth={1} />
              <text x={PAD.left - 6} y={y(t)} dy="0.32em" textAnchor="end" fontSize={11} fill="var(--color-chart-muted)" className="tabular-nums">
                {t.toLocaleString("es-CO")}
              </text>
            </g>
          ))}
          {data.map((d, i) => {
            const cx = PAD.left + band * i + band / 2;
            const h = Math.max(0, y(0) - y(d.value));
            const r = Math.min(4, h);
            const x0 = cx - barW / 2;
            const showLabel = d.value > 0 && (i === maxIdx || i === data.length - 1);
            return (
              <g key={d.key}>
                {h > 0 && (
                  <path
                    d={`M${x0},${y(0)} V${y(d.value) + r} Q${x0},${y(d.value)} ${x0 + r},${y(d.value)} H${x0 + barW - r} Q${x0 + barW},${y(d.value)} ${x0 + barW},${y(d.value) + r} V${y(0)} Z`}
                    fill="var(--color-series-1)"
                    opacity={active === null || active === i ? 1 : 0.55}
                  />
                )}
                {showLabel && (
                  <text x={cx} y={y(d.value) - 5} textAnchor="middle" fontSize={11} fontWeight={600} fill="var(--color-foreground)">
                    {fmt(d.value)}
                  </text>
                )}
                {i % labelEvery === 0 && (
                  <text x={cx} y={H - 8} textAnchor="middle" fontSize={11} fill="var(--color-chart-muted)">
                    {d.label}
                  </text>
                )}
                {/* Zona de interacción: toda la banda (más grande que la marca) */}
                <rect
                  x={PAD.left + band * i}
                  y={PAD.top}
                  width={band}
                  height={plotH}
                  fill="transparent"
                  tabIndex={0}
                  aria-label={`${d.label}: ${fmt(d.value)} ${seriesLabel}`}
                  onPointerEnter={() => setActive(i)}
                  onFocus={() => setActive(i)}
                  onBlur={() => setActive(null)}
                  className="outline-none"
                />
              </g>
            );
          })}
        </svg>
        {active !== null && (
          <ChartTooltip
            x={PAD.left + band * active + band / 2}
            y={y(data[active]!.value)}
            width={width}
            title={data[active]!.label}
            rows={[{ label: seriesLabel, value: fmt(data[active]!.value), color: "var(--color-series-1)" }]}
          />
        )}
      </div>
      <ChartTable caption={caption} headers={["Mes", seriesLabel]} rows={data.map((d) => [d.label, fmt(d.value)])} />
    </div>
  );
}

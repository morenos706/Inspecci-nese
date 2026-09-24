"use client";

import { useState } from "react";
import Link from "next/link";
import { ChartTable } from "@/components/charts/chart-table";
import { fmt } from "@/components/charts/chart-utils";

export interface BarItem {
  key: string;
  label: string;
  value: number;
  href?: string;
}

/**
 * Barras horizontales de una sola serie (magnitud): un color, barras ≤16 px,
 * extremo redondeado 4 px, valor al final de cada barra en tinta de texto.
 */
export function BarList({ items, caption, unit = "" }: { items: BarItem[]; caption: string; unit?: string }) {
  const [hover, setHover] = useState<string | null>(null);
  const max = Math.max(1, ...items.map((i) => i.value));
  if (items.every((i) => i.value === 0)) {
    return <p className="py-6 text-center text-sm text-subtle">Sin datos en el periodo.</p>;
  }
  return (
    <div>
      <ul className="space-y-2.5" aria-label={caption}>
        {items.map((item) => {
          const width = `${(item.value / max) * 100}%`;
          const row = (
            <div
              className="group grid grid-cols-[minmax(6rem,38%)_1fr] items-center gap-3 rounded-md py-0.5 outline-none focus-visible:ring-2 focus-visible:ring-primary"
              tabIndex={item.href ? undefined : 0}
              onPointerEnter={() => setHover(item.key)}
              onPointerLeave={() => setHover(null)}
              onFocus={() => setHover(item.key)}
              onBlur={() => setHover(null)}
            >
              <span className="truncate text-sm text-muted" title={item.label}>
                {item.label}
              </span>
              <span className="flex items-center gap-2">
                <span className="relative h-4 flex-1">
                  {item.value > 0 && (
                    <span
                      className="absolute inset-y-0 left-0 rounded-r bg-series-1 transition-opacity"
                      style={{ width, minWidth: 3, opacity: hover && hover !== item.key ? 0.55 : 1 }}
                      aria-hidden
                    />
                  )}
                </span>
                <span className="w-12 shrink-0 text-right text-sm font-semibold tabular-nums text-foreground">
                  {fmt(item.value, unit)}
                </span>
              </span>
            </div>
          );
          return (
            <li key={item.key}>
              {item.href ? (
                <Link href={item.href} className="block rounded-md hover:bg-surface-muted" onFocus={() => setHover(item.key)} onBlur={() => setHover(null)}>
                  {row}
                </Link>
              ) : (
                row
              )}
            </li>
          );
        })}
      </ul>
      <ChartTable caption={caption} headers={["Categoría", "Valor"]} rows={items.map((i) => [i.label, fmt(i.value, unit)])} />
    </div>
  );
}

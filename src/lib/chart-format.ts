/** Utilidades puras de gráficos (servidor y cliente). */

/** Máximo "redondo" y marcas del eje (0, 5, 10… / 0, 20, 40…), máximo ~5 marcas. */
export function niceTicks(max: number, count = 4): number[] {
  if (max <= 0) return [0, 1];
  const raw = max / count;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? 10 * mag;
  const top = Math.ceil(max / step) * step;
  const ticks: number[] = [];
  for (let v = 0; v <= top + 1e-9; v += step) ticks.push(Math.round(v * 100) / 100);
  return ticks;
}

export const fmt = (n: number | null | undefined, suffix = "") =>
  n === null || n === undefined ? "—" : `${n.toLocaleString("es-CO", { maximumFractionDigits: 1 })}${suffix}`;

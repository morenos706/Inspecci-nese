"use client";

import { useEffect, useRef, useState } from "react";

export { fmt, niceTicks } from "@/lib/chart-format";

/** Ancho real del contenedor (los SVG se dibujan en píxeles reales: el texto no se deforma). */
export function useWidth<T extends HTMLElement>(initial = 300) {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(initial);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setWidth(Math.max(260, Math.floor(entry!.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, width] as const;
}

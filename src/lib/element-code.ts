/**
 * Recodificación del elemento cuando cambia de sede o zona (código puro).
 * El código se divide por guiones: si el primer segmento es el código de la
 * sede anterior se reemplaza por el de la nueva; si algún segmento es el
 * código de la zona anterior se reemplaza por el de la nueva zona.
 *   PRO-EXT-023      → (sede COM)            → COM-EXT-023
 *   PRO-MANT-EXT-023 → (sede RIO, zona BOD)  → RIO-BOD-EXT-023
 * Si el código no sigue ese formato, no se cambia (devuelve el mismo).
 */
export function recodeElement(
  code: string,
  change: { fromSite?: string | null; toSite?: string | null; fromZone?: string | null; toZone?: string | null },
): string {
  const parts = code.split("-");
  const eq = (a: string | null | undefined, b: string) => Boolean(a) && a!.toUpperCase() === b.toUpperCase();
  if (change.fromSite && change.toSite && eq(change.fromSite, parts[0] ?? "")) parts[0] = change.toSite.toUpperCase();
  if (change.fromZone && change.toZone) {
    const i = parts.findIndex((p, idx) => idx > 0 && eq(change.fromZone, p));
    if (i > 0) parts[i] = change.toZone.toUpperCase();
  }
  return parts.join("-");
}

/** Primer código libre: el propuesto, o con sufijo -2, -3… si ya existe. */
export function firstFreeCode(proposed: string, taken: (code: string) => boolean): string {
  if (!taken(proposed)) return proposed;
  for (let n = 2; n < 1000; n++) {
    const candidate = `${proposed}-${n}`;
    if (!taken(candidate)) return candidate;
  }
  return proposed;
}

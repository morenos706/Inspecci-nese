/**
 * Códigos de elementos (código puro, probado en tests/unit/element-code.test.ts).
 *
 * Formato configurado: SEDE-TIPO-NNN (p. ej. PRO-EXT-024), donde SEDE es el
 * código de la sede, TIPO el prefijo del tipo de elemento (o su código) y NNN
 * el consecutivo siguiente para esa sede y tipo. El sistema lo asigna; el
 * usuario no lo escribe.
 */

/** Prefijo del tipo para el código: el configurado en el tipo, o su código. */
export function typeCodePrefix(type: { code: string; codePrefix?: string | null }): string {
  return (type.codePrefix || type.code).toUpperCase();
}

/** Siguiente código SEDE-TIPO-NNN según los códigos existentes (incluye eliminados: el código es único). */
export function nextSequentialCode(siteCode: string, typePrefix: string, existing: Iterable<string>): string {
  const base = `${siteCode}-${typePrefix}-`.toUpperCase();
  let max = 0;
  for (const code of existing) {
    if (!code.toUpperCase().startsWith(base)) continue;
    const match = code.slice(base.length).match(/^(\d+)/);
    if (match) max = Math.max(max, Number(match[1]));
  }
  return `${base}${String(max + 1).padStart(3, "0")}`;
}

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
  change: {
    fromSite?: string | null;
    toSite?: string | null;
    fromZone?: string | null;
    toZone?: string | null;
    fromType?: string | null;
    toType?: string | null;
  },
): string {
  const parts = code.split("-");
  const eq = (a: string | null | undefined, b: string) => Boolean(a) && a!.toUpperCase() === b.toUpperCase();
  if (change.fromSite && change.toSite && eq(change.fromSite, parts[0] ?? "")) parts[0] = change.toSite.toUpperCase();
  if (change.fromType && change.toType) {
    const i = parts.findIndex((p, idx) => idx > 0 && eq(change.fromType, p));
    if (i > 0) parts[i] = change.toType.toUpperCase();
  }
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

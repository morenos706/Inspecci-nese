/**
 * Códigos de elementos (código puro, probado en tests/unit/element-code.test.ts).
 *
 * Formato: SEDE-TIPO-ID (p. ej. PRO-EXT-024), donde SEDE es el código de la
 * sede, TIPO el prefijo del tipo de elemento (o su código) e ID el número del
 * equipo, único por tipo en todas las sedes. El código no se edita: el ID se
 * conserva y solo cambia la codificación al mover el elemento.
 */

/** Prefijo del tipo para el código: el configurado en el tipo, o su código. */
export function typeCodePrefix(type: { code: string; codePrefix?: string | null }): string {
  return (type.codePrefix || type.code).toUpperCase();
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

/**
 * Número (ID) del elemento escrito por el usuario: dígitos con una letra
 * opcional (23, 023, 34A). Devuelve el segmento normalizado ("023", "034A")
 * o null si no es válido.
 */
export function normalizeIdNumber(value: string): string | null {
  const match = value.trim().toUpperCase().replace(/\s+/g, "").match(/^0*(\d{1,6})([A-Z]?)$/);
  if (!match) return null;
  return `${match[1]!.padStart(3, "0")}${match[2]}`;
}

/** Clave comparable de un ID: "023" y "23" son el mismo número. */
export function idKey(segment: string): string {
  const match = segment.toUpperCase().match(/^0*(\d+)([A-Z]?)$/);
  return match ? `${Number(match[1])}${match[2]}` : segment.toUpperCase();
}

/** ID del elemento dentro de su código (segmento que sigue al prefijo del tipo): PRO-EXT-023 → "23". */
export function idFromCode(code: string, typePrefix: string): string | null {
  const parts = code.toUpperCase().split("-");
  const i = parts.findIndex((p, idx) => idx > 0 && p === typePrefix.toUpperCase());
  const segment = i > 0 ? parts[i + 1] : undefined;
  return segment && /^\d+[A-Z]?$/.test(segment) ? idKey(segment) : null;
}

/** Siguiente número libre del tipo considerando TODAS las sedes (el ID es único por tipo). */
export function nextIdNumber(codes: Iterable<string>, typePrefix: string): string {
  let max = 0;
  for (const code of codes) {
    const id = idFromCode(code, typePrefix);
    const n = id ? Number.parseInt(id, 10) : NaN;
    if (Number.isFinite(n)) max = Math.max(max, n);
  }
  return String(max + 1).padStart(3, "0");
}

/** Datos para mostrar el código y validar el ID en el formulario (el servidor valida igual). */
export interface CodeInfo {
  /** Prefijo del tipo para el código (EXT, LUZ…), por ID de tipo. */
  typePrefix: Record<string, string>;
  /** Siguiente ID libre por tipo (en todas las sedes). */
  nextId: Record<string, string>;
  /** IDs ya usados por tipo → «código · sede». */
  usedIds: Record<string, Record<string, string>>;
}

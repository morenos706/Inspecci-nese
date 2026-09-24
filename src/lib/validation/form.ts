import { z } from "zod";

// Mensajes de validación por defecto en español.
z.config(z.locales.es());

/**
 * Convierte FormData a un objeto plano. Los campos listados en `arrays`
 * se leen con getAll (checkboxes múltiples, selects múltiples).
 * Los strings vacíos se convierten a undefined para que `.optional()` funcione.
 */
export function formDataToObject(formData: FormData, arrays: readonly string[] = []) {
  const out: Record<string, unknown> = {};
  for (const key of new Set(formData.keys())) {
    if (key.startsWith("$ACTION")) continue; // campos internos de Next
    if (arrays.includes(key)) {
      out[key] = formData.getAll(key).filter((v): v is string => typeof v === "string" && v !== "");
      continue;
    }
    const value = formData.get(key);
    if (typeof value === "string") {
      const trimmed = value.trim();
      out[key] = trimmed === "" ? undefined : trimmed;
    }
  }
  for (const key of arrays) out[key] ??= [];
  return out;
}

/** Checkbox HTML: presente ("on" / "true") → true; ausente → false. */
export const zCheckbox = z
  .union([z.literal("on"), z.literal("true"), z.literal("false"), z.boolean()])
  .optional()
  .transform((v) => v === true || v === "on" || v === "true");

export const zRequiredText = (label: string, max = 200) =>
  z
    .string({ error: `${label} es obligatorio` })
    .trim()
    .min(1, `${label} es obligatorio`)
    .max(max, `Máximo ${max} caracteres`);

export const zOptionalText = (max = 1000) => z.string().trim().max(max, `Máximo ${max} caracteres`).optional();

/** Código corto en mayúsculas: letras, números, guion y guion bajo. */
export const zCode = (label = "El código") =>
  zRequiredText(label, 30)
    .transform((v) => v.toUpperCase())
    .pipe(z.string().regex(/^[A-Z0-9_-]+$/, "Solo letras, números, guion (-) o guion bajo (_)"));

export const zEmail = z
  .string({ error: "El correo es obligatorio" })
  .trim()
  .toLowerCase()
  .pipe(z.email("Correo electrónico inválido").max(254));

export const zId = z.string().min(1).max(64);

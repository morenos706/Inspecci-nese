import { z } from "zod";

/** Política de contraseñas compartida por cliente y servidor. */
export const passwordSchema = z
  .string({ error: "La contraseña es obligatoria" })
  .min(8, "Mínimo 8 caracteres")
  .max(128, "Máximo 128 caracteres")
  .regex(/[a-z]/, "Debe incluir una letra minúscula")
  .regex(/[A-Z]/, "Debe incluir una letra mayúscula")
  .regex(/[0-9]/, "Debe incluir un número");

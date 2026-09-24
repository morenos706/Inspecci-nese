import "server-only";
import { z } from "zod";
import type { ActionState } from "@/lib/action-state";
import {
  AppError,
  AuthenticationError,
  AuthorizationError,
  DomainError,
  NotFoundError,
  RateLimitError,
  ValidationError,
} from "@/server/errors";
import { Prisma } from "@/generated/prisma/client";
import { formDataToObject } from "@/lib/validation/form";

/**
 * Envoltorio estándar de Server Actions:
 *  - Traduce errores de dominio a mensajes seguros.
 *  - Traduce errores de Prisma conocidos (unicidad, FK).
 *  - Nunca filtra detalles internos al cliente (se registran en el log).
 */
export async function runAction(fn: () => Promise<ActionState>): Promise<ActionState> {
  try {
    const result = await fn();
    return { ...result, at: Date.now() };
  } catch (error) {
    return { ...toActionError(error), at: Date.now() };
  }
}

function toActionError(error: unknown): ActionState {
  if (error instanceof ValidationError) {
    return { ok: false, message: error.message, fieldErrors: error.fieldErrors };
  }
  if (
    error instanceof AuthenticationError ||
    error instanceof AuthorizationError ||
    error instanceof NotFoundError ||
    error instanceof DomainError ||
    error instanceof RateLimitError
  ) {
    return { ok: false, message: error.message };
  }
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === "P2002") {
      const target = (error.meta?.target as string[] | string | undefined) ?? "";
      const fields = Array.isArray(target) ? target : [target];
      const fieldErrors = Object.fromEntries(fields.filter(Boolean).map((f) => [f, ["Ya existe un registro con este valor"]]));
      return { ok: false, message: "Ya existe un registro con esos datos.", fieldErrors };
    }
    if (error.code === "P2003") {
      return { ok: false, message: "El registro está relacionado con otros datos y no se puede modificar así." };
    }
    if (error.code === "P2025") {
      return { ok: false, message: "El registro no existe o fue modificado." };
    }
  }
  if (error instanceof AppError) return { ok: false, message: error.message };

  console.error("[action] Error no controlado:", error);
  return { ok: false, message: "Ocurrió un error inesperado. Inténtalo de nuevo." };
}

/** Valida FormData contra un esquema Zod; lanza ValidationError si falla. */
export function parseForm<S extends z.ZodType>(
  schema: S,
  formData: FormData,
  options: { arrays?: readonly string[] } = {},
): z.infer<S> {
  return parseInput(schema, formDataToObject(formData, options.arrays));
}

export function parseInput<S extends z.ZodType>(schema: S, input: unknown): z.infer<S> {
  const result = schema.safeParse(input);
  if (!result.success) {
    const flat = z.flattenError(result.error);
    throw new ValidationError(flat.fieldErrors as Record<string, string[]>, flat.formErrors[0] ?? undefined);
  }
  return result.data;
}

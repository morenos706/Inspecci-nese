import "server-only";
import { NextResponse } from "next/server";
import {
  AppError,
  AuthenticationError,
  AuthorizationError,
  NotFoundError,
  RateLimitError,
  ValidationError,
} from "@/server/errors";

/**
 * Protección CSRF para Route Handlers que modifican datos (las Server
 * Actions ya la traen): el Origin del navegador debe coincidir con el host.
 */
export function assertSameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  if (!origin || !host) throw new AuthorizationError("Solicitud no permitida.");
  try {
    if (new URL(origin).host !== host) throw new Error();
  } catch {
    throw new AuthorizationError("Solicitud no permitida.");
  }
}

/** Convierte errores de dominio en respuestas JSON con el código HTTP adecuado. */
export function errorResponse(error: unknown) {
  const status =
    error instanceof AuthenticationError
      ? 401
      : error instanceof AuthorizationError
        ? 403
        : error instanceof NotFoundError
          ? 404
          : error instanceof RateLimitError
            ? 429
            : error instanceof ValidationError || error instanceof AppError
              ? 400
              : 500;
  if (status === 500) console.error("[api] Error no controlado:", error);
  const message = error instanceof AppError ? error.message : "Ocurrió un error inesperado.";
  return NextResponse.json({ ok: false, message }, { status });
}

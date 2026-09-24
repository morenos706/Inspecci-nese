/**
 * Errores de dominio. Los servicios lanzan estos errores y la capa de acciones
 * (runAction) los traduce a respuestas seguras para el usuario.
 */
export class AppError extends Error {
  constructor(message: string) {
    super(message);
    this.name = new.target.name;
  }
}

/** No hay sesión válida. */
export class AuthenticationError extends AppError {
  constructor(message = "Tu sesión expiró. Inicia sesión nuevamente.") {
    super(message);
  }
}

/** Hay sesión pero no permiso. */
export class AuthorizationError extends AppError {
  constructor(message = "No tienes permiso para realizar esta acción.") {
    super(message);
  }
}

export class NotFoundError extends AppError {
  constructor(message = "El registro no existe o no tienes acceso a él.") {
    super(message);
  }
}

/** Regla de negocio incumplida (mensaje apto para mostrar al usuario). */
export class DomainError extends AppError {}

export class ValidationError extends AppError {
  constructor(
    public readonly fieldErrors: Record<string, string[] | undefined>,
    message = "Revisa los campos marcados.",
  ) {
    super(message);
  }
}

export class RateLimitError extends AppError {
  constructor(message = "Demasiados intentos. Espera unos minutos e inténtalo de nuevo.") {
    super(message);
  }
}

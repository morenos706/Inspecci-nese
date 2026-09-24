/** Resultado estándar de todas las Server Actions (serializable). */
export interface ActionState {
  ok: boolean;
  message?: string;
  fieldErrors?: Record<string, string[] | undefined>;
  /** Ruta a la que el cliente navega tras un resultado exitoso. */
  redirectTo?: string;
  /** Marca de tiempo: permite al cliente reaccionar a cada envío, incluso si el mensaje se repite. */
  at?: number;
}

export const initialActionState: ActionState = { ok: false };

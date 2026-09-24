"use client";

import { useActionState, useEffect, useEffectEvent, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { initialActionState, type ActionState } from "@/lib/action-state";

type FormAction = (prev: ActionState, formData: FormData) => Promise<ActionState>;

/**
 * Conecta un formulario a una Server Action:
 *  - Muestra toast de éxito / error.
 *  - Navega a `redirectTo` cuando la acción lo indica.
 *  - Envía con onSubmit + transición para NO resetear el formulario si hay
 *    errores (comportamiento por defecto de <form action> en React 19).
 */
export function useActionForm(
  action: FormAction,
  options: { onSuccess?: (state: ActionState) => void; successToast?: boolean } = {},
) {
  const successToast = options.successToast ?? true;
  const [state, formAction, isPending] = useActionState(action, initialActionState);
  const [isTransitioning, startTransition] = useTransition();
  const router = useRouter();
  // useEffectEvent: siempre usa el callback más reciente sin re-ejecutar el efecto.
  const onSuccess = useEffectEvent((result: ActionState) => options.onSuccess?.(result));

  useEffect(() => {
    if (!state.at) return;
    if (state.ok) {
      if (state.message && successToast) toast.success(state.message);
      onSuccess(state);
      if (state.redirectTo) {
        router.push(state.redirectTo);
        router.refresh();
      }
    } else if (state.message) {
      toast.error(state.message);
    }
  }, [state, router, successToast]);

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    startTransition(() => formAction(formData));
  }

  return {
    state,
    onSubmit,
    pending: isPending || isTransitioning,
    errors: (field: string) => state.fieldErrors?.[field],
  };
}

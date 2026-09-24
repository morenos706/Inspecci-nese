"use client";

import { useRef, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button, type ButtonVariant } from "@/components/ui/button";
import type { ActionState } from "@/lib/action-state";

/**
 * Botón que pide confirmación (diálogo nativo accesible) antes de ejecutar
 * una acción crítica. Muestra toast con el resultado.
 */
export function ConfirmButton({
  action,
  title,
  description,
  confirmLabel = "Confirmar",
  variant = "outline",
  confirmVariant = "danger",
  children,
}: {
  action: () => Promise<ActionState>;
  title: string;
  description?: ReactNode;
  confirmLabel?: string;
  variant?: ButtonVariant;
  confirmVariant?: ButtonVariant;
  children: ReactNode;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function confirm() {
    startTransition(async () => {
      const result = await action();
      dialogRef.current?.close();
      if (result.ok) {
        if (result.message) toast.success(result.message);
        if (result.redirectTo) router.push(result.redirectTo);
        router.refresh();
      } else {
        toast.error(result.message ?? "No se pudo completar la acción.");
      }
    });
  }

  return (
    <>
      <Button variant={variant} onClick={() => dialogRef.current?.showModal()}>
        {children}
      </Button>
      <dialog
        ref={dialogRef}
        aria-labelledby="confirm-title"
        className="m-auto w-[calc(100%-2rem)] max-w-md rounded-xl bg-surface p-0 shadow-xl"
      >
        <div className="p-5">
          <h2 id="confirm-title" className="text-lg font-semibold">
            {title}
          </h2>
          {description && <div className="mt-2 text-sm text-muted">{description}</div>}
        </div>
        <div className="flex flex-col-reverse gap-2 border-t border-border bg-surface-muted p-4 sm:flex-row sm:justify-end">
          <Button variant="outline" onClick={() => dialogRef.current?.close()} disabled={pending}>
            Cancelar
          </Button>
          <Button variant={confirmVariant} onClick={confirm} loading={pending}>
            {confirmLabel}
          </Button>
        </div>
      </dialog>
    </>
  );
}

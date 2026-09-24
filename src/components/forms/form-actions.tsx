import type { ReactNode } from "react";
import { ButtonLink } from "@/components/ui/button";

/** Barra de acciones de formulario: fija abajo en móvil para tener el botón siempre a mano. */
export function FormActions({ cancelHref, children }: { cancelHref: string; children: ReactNode }) {
  return (
    <div className="sticky bottom-16 -mx-4 flex gap-2 border-t border-border bg-surface/95 px-4 py-3 backdrop-blur sm:static sm:mx-0 sm:justify-end sm:border-0 sm:bg-transparent sm:px-0 sm:py-0 lg:bottom-0">
      <ButtonLink href={cancelHref} variant="outline" className="flex-1 sm:flex-none">
        Cancelar
      </ButtonLink>
      <div className="flex flex-1 sm:flex-none">{children}</div>
    </div>
  );
}

"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ClipboardCheck } from "lucide-react";
import { Button, type ButtonSize, type ButtonVariant } from "@/components/ui/button";
import { startInspectionAction } from "@/server/actions/inspections.actions";

/** Inicia (o retoma) la inspección de un elemento y abre el formulario. */
export function StartInspectionButton({
  elementId,
  label = "Inspeccionar",
  variant = "primary",
  size = "md",
  className,
}: {
  elementId: string;
  label?: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
  className?: string;
}) {
  const [pending, start] = useTransition();
  const router = useRouter();
  return (
    <Button
      variant={variant}
      size={size}
      className={className}
      loading={pending}
      onClick={() =>
        start(async () => {
          const result = await startInspectionAction(elementId);
          if (result.ok && result.redirectTo) router.push(result.redirectTo);
          else toast.error(result.message ?? "No se pudo iniciar la inspección");
        })
      }
    >
      {!pending && <ClipboardCheck className="h-4 w-4" aria-hidden />}
      {label}
    </Button>
  );
}

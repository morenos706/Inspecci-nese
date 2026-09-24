import { FileQuestion } from "lucide-react";
import { ButtonLink } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";

export default function NotFound() {
  return (
    <div className="flex min-h-dvh items-center justify-center p-4">
      <div className="w-full max-w-md rounded-xl border border-border bg-surface">
        <EmptyState
          icon={FileQuestion}
          title="Página no encontrada"
          description="El recurso no existe o no tienes acceso a él."
          action={<ButtonLink href="/">Ir al inicio</ButtonLink>}
        />
      </div>
    </div>
  );
}

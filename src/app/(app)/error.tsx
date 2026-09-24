"use client";

import { useEffect } from "react";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";

export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <Card>
      <EmptyState
        icon={AlertTriangle}
        title="No pudimos cargar esta sección"
        description={
          error.digest ? `Código de referencia: ${error.digest}` : "Ocurrió un error inesperado. Inténtalo de nuevo."
        }
        action={<Button onClick={reset}>Reintentar</Button>}
      />
    </Card>
  );
}

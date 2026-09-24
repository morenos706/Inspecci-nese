import { ShieldX } from "lucide-react";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";

export const metadata = { title: "Sin permiso" };

export default function ForbiddenPage() {
  return (
    <Card>
      <EmptyState
        icon={ShieldX}
        title="No tienes permiso para ver esta página"
        description="Si crees que es un error, solicita el acceso al administrador del sistema."
        action={<ButtonLink href="/dashboard">Ir al inicio</ButtonLink>}
      />
    </Card>
  );
}

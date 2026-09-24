import { Alert } from "@/components/ui/alert";
import { PageHeader } from "@/components/ui/page-header";
import { ElementForm } from "@/components/forms/element-form";
import { requirePagePermission } from "@/server/auth/current-user";
import { getElementFormData } from "@/server/services/element-form-data";

export const metadata = { title: "Nuevo elemento" };

export default async function NewElementPage() {
  await requirePagePermission("elements.manage");
  const data = await getElementFormData();
  const missing = [
    data.types.length === 0 && "tipos de elemento",
    data.processes.length === 0 && "procesos",
    data.sites.length === 0 && "sedes",
  ].filter(Boolean);

  return (
    <>
      <PageHeader title="Nuevo elemento" back={{ href: "/inventory", label: "Inventario" }} />
      {missing.length > 0 ? (
        <Alert tone="warning" title="Falta configuración">
          Antes de crear elementos registra: {missing.join(", ")}.
        </Alert>
      ) : (
        <ElementForm {...data} />
      )}
    </>
  );
}

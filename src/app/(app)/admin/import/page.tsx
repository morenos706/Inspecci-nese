import { PageHeader } from "@/components/ui/page-header";
import { ImportWizard } from "@/components/import/import-wizard";
import { requirePagePermission } from "@/server/auth/current-user";

export const metadata = { title: "Carga masiva" };

export default async function ImportPage() {
  await requirePagePermission("elements.manage");
  return (
    <>
      <PageHeader
        title="Carga masiva"
        description="Crea o actualiza sedes, procesos, tipos de equipo con sus preguntas, zonas e inventario desde un archivo Excel."
        back={{ href: "/inventory", label: "Inventario" }}
      />
      <ImportWizard />
    </>
  );
}

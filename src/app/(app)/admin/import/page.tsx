import { PageHeader } from "@/components/ui/page-header";
import { ImportWizard } from "@/components/import/import-wizard";
import { requirePagePermission } from "@/server/auth/current-user";

export const metadata = { title: "Carga masiva" };

export default async function ImportPage() {
  await requirePagePermission("elements.manage");
  return (
    <>
      <PageHeader
        title="Carga masiva de zonas e inventario"
        description="Crea o actualiza zonas y elementos desde un archivo Excel."
        back={{ href: "/inventory", label: "Inventario" }}
      />
      <ImportWizard />
    </>
  );
}

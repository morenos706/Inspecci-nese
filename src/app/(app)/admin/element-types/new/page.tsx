import { PageHeader } from "@/components/ui/page-header";
import { ElementTypeForm } from "@/components/forms/element-type-form";
import { requirePagePermission } from "@/server/auth/current-user";

export const metadata = { title: "Nuevo tipo de elemento" };

export default async function NewElementTypePage() {
  await requirePagePermission("element_types.manage");
  return (
    <>
      <PageHeader
        title="Nuevo tipo de elemento"
        description="Después de crearlo podrás agregar sus preguntas de inspección."
        back={{ href: "/admin/element-types", label: "Tipos de elemento" }}
      />
      <ElementTypeForm />
    </>
  );
}

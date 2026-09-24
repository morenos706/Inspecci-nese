import { PageHeader } from "@/components/ui/page-header";
import { ElementForm } from "@/components/forms/element-form";
import { requirePagePermission } from "@/server/auth/current-user";
import { orNotFound } from "@/server/page-helpers";
import { getElementFormData } from "@/server/services/element-form-data";
import { getElement } from "@/server/services/elements.service";

export const metadata = { title: "Editar elemento" };

export default async function EditElementPage({ params }: PageProps<"/inventory/[id]/edit">) {
  const user = await requirePagePermission("elements.manage");
  const { id } = await params;
  const [element, data] = await Promise.all([orNotFound(getElement(id, user)), getElementFormData()]);

  // Si el tipo actual está inactivo, se incluye para que el select lo muestre.
  const types = data.types.some((t) => t.id === element.elementTypeId)
    ? data.types
    : [
        ...data.types,
        {
          id: element.elementTypeId,
          name: `${element.elementType.name} (inactivo)`,
          codePrefix: null,
          defaultFrequency: element.frequency,
          defaultFrequencyDays: element.frequencyDays,
        },
      ];

  return (
    <>
      <PageHeader title={`Editar ${element.code}`} back={{ href: `/inventory/${element.id}`, label: element.code }} />
      <ElementForm
        {...data}
        types={types}
        element={{
          id: element.id,
          code: element.code,
          name: element.name,
          description: element.description,
          elementTypeId: element.elementTypeId,
          processId: element.processId,
          siteId: element.siteId,
          zoneId: element.zoneId,
          location: element.location,
          responsibleId: element.responsibleId,
          frequency: element.frequency,
          frequencyDays: element.frequencyDays,
          lastInspectionAt: element.lastInspectionAt,
          nextInspectionAt: element.nextInspectionAt,
          status: element.status,
          inspectionCount: element._count.inspections,
        }}
      />
    </>
  );
}

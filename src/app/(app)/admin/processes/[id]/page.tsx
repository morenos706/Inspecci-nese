import { PageHeader } from "@/components/ui/page-header";
import { ProcessForm } from "@/components/forms/process-form";
import { formatDateTime } from "@/lib/utils";
import { requirePagePermission } from "@/server/auth/current-user";
import { orNotFound } from "@/server/page-helpers";
import { getProcess } from "@/server/services/processes.service";

export const metadata = { title: "Editar proceso" };

export default async function EditProcessPage({ params }: PageProps<"/admin/processes/[id]">) {
  await requirePagePermission("processes.manage");
  const { id } = await params;
  const process = await orNotFound(getProcess(id));
  return (
    <>
      <PageHeader
        title={process.name}
        description={`Última actualización ${formatDateTime(process.updatedAt)}`}
        back={{ href: "/admin/processes", label: "Procesos" }}
      />
      <ProcessForm process={process} />
    </>
  );
}

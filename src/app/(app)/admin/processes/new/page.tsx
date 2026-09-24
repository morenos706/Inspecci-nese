import { PageHeader } from "@/components/ui/page-header";
import { ProcessForm } from "@/components/forms/process-form";
import { requirePagePermission } from "@/server/auth/current-user";

export const metadata = { title: "Nuevo proceso" };

export default async function NewProcessPage() {
  await requirePagePermission("processes.manage");
  return (
    <>
      <PageHeader title="Nuevo proceso" back={{ href: "/admin/processes", label: "Procesos" }} />
      <ProcessForm />
    </>
  );
}

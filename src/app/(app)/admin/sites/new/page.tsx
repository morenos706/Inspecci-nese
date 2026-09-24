import { PageHeader } from "@/components/ui/page-header";
import { SiteForm } from "@/components/forms/site-forms";
import { requirePagePermission } from "@/server/auth/current-user";

export const metadata = { title: "Nueva sede" };

export default async function NewSitePage() {
  await requirePagePermission("sites.manage");
  return (
    <>
      <PageHeader title="Nueva sede" back={{ href: "/admin/sites", label: "Sedes" }} />
      <SiteForm />
    </>
  );
}

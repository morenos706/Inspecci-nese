import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { AreaForm, SiteForm } from "@/components/forms/site-forms";
import { AreaList } from "@/components/forms/area-list";
import { requirePagePermission } from "@/server/auth/current-user";
import { orNotFound } from "@/server/page-helpers";
import { getSite } from "@/server/services/sites.service";

export const metadata = { title: "Editar sede" };

export default async function EditSitePage({ params }: PageProps<"/admin/sites/[id]">) {
  await requirePagePermission("sites.manage");
  const { id } = await params;
  const site = await orNotFound(getSite(id));

  return (
    <>
      <PageHeader title={site.name} back={{ href: "/admin/sites", label: "Sedes" }} />
      <div className="space-y-6">
        <SiteForm site={site} />
        <Card>
          <CardHeader title="Áreas" description="Zonas dentro de la sede (bodega, oficinas, planta…)." />
          <CardBody className="border-b border-border">
            <AreaForm siteId={site.id} />
          </CardBody>
          <AreaList siteId={site.id} areas={site.areas} />
        </Card>
      </div>
    </>
  );
}

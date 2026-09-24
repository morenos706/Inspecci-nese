import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { ZoneForm, SiteForm } from "@/components/forms/site-forms";
import { ZoneList } from "@/components/forms/zone-list";
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
          <CardHeader title="Zonas" description="Zonas de inspección dentro de la sede. Cada elemento pertenece a una zona." />
          <CardBody className="border-b border-border">
            <ZoneForm siteId={site.id} />
          </CardBody>
          <ZoneList siteId={site.id} zones={site.zones} />
        </Card>
      </div>
    </>
  );
}

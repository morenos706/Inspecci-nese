import { redirect } from "next/navigation";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/page-header";
import { QrScanner } from "@/components/qr/qr-scanner";
import { requirePagePermission } from "@/server/auth/current-user";
import { findElementByCode } from "@/server/services/qr.service";

export const metadata = { title: "Escanear QR" };

export default async function ScanPage({ searchParams }: PageProps<"/scan">) {
  const user = await requirePagePermission("inspections.perform", "elements.read.all", "elements.read.process");
  const { code } = await searchParams;
  let notFoundCode: string | null = null;
  if (typeof code === "string" && code.trim()) {
    const element = await findElementByCode(code.slice(0, 40), user);
    if (element) redirect(`/q/${element.qrToken}`);
    notFoundCode = code.slice(0, 40);
  }

  return (
    <div className="mx-auto max-w-lg">
      <PageHeader title="Escanear QR" description="Apunta la cámara a la etiqueta del elemento." />
      <Card className="mb-4">
        <CardBody>
          <QrScanner />
        </CardBody>
      </Card>
      <Card>
        <CardHeader title="¿Sin cámara o etiqueta dañada?" description="Escribe el código del elemento." />
        <CardBody>
          {notFoundCode && (
            <Alert tone="warning" className="mb-3">
              No se encontró el elemento «{notFoundCode}» o no tienes acceso a él.
            </Alert>
          )}
          <form method="get" className="flex gap-2">
            <Input name="code" placeholder="Ej.: EXT-023" className="uppercase" aria-label="Código del elemento" autoComplete="off" />
            <Button type="submit">Buscar</Button>
          </form>
        </CardBody>
      </Card>
    </div>
  );
}

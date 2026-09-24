import { Building2, KeyRound, MapPin, Network, Users } from "lucide-react";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { StatCard } from "@/components/ui/stat-card";
import { hasPermission, requirePageUser } from "@/server/auth/current-user";
import { getFoundationSummary } from "@/server/services/dashboard.service";

export const metadata = { title: "Inicio" };

export default async function DashboardPage() {
  const user = await requirePageUser();
  const isAdmin = hasPermission(user, "users.manage");
  const summary = isAdmin ? await getFoundationSummary() : null;
  const firstName = user.name.split(" ")[0];

  return (
    <>
      <PageHeader title={`Hola, ${firstName}`} description="Resumen general del sistema de inspecciones." />

      {summary && (
        <section aria-label="Datos maestros" className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
          <StatCard label="Usuarios activos" value={summary.users} icon={Users} href="/admin/users" />
          <StatCard label="Roles" value={summary.roles} icon={KeyRound} tone="neutral" href="/admin/roles" />
          <StatCard label="Procesos" value={summary.processes} icon={Network} tone="success" href="/admin/processes" />
          <StatCard label="Sedes" value={summary.sites} icon={Building2} tone="warning" href="/admin/sites" />
          <StatCard label="Áreas" value={summary.areas} icon={MapPin} tone="neutral" href="/admin/sites" />
        </section>
      )}

      <Card>
        <CardHeader title="Indicadores de inspección" description="Disponible en la Fase 5 del proyecto." />
        <CardBody className="text-sm text-subtle">
          Aquí se mostrarán inspecciones pendientes, próximas a vencer y vencidas, hallazgos abiertos y críticos, planes de
          acción y cumplimiento por proceso y sede.
        </CardBody>
      </Card>
    </>
  );
}

import Link from "next/link";
import { AlertOctagon, BatteryWarning, Boxes, ClipboardList, Flame, ShieldCheck, Timer, Building2, CalendarCheck, CalendarClock, KeyRound, MapPin, Network, Users } from "lucide-react";
import { Alert } from "@/components/ui/alert";
import { ButtonLink } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { StatCard } from "@/components/ui/stat-card";
import { getReadScope, hasPermission, requirePageUser } from "@/server/auth/current-user";
import { scheduleSummary } from "@/server/services/elements.service";
import { countPendingReview, myActionPlanSummary } from "@/server/services/action-plans.service";
import { getFoundationSummary } from "@/server/services/dashboard.service";

export const metadata = { title: "Inicio" };

export default async function DashboardPage() {
  const user = await requirePageUser();
  const isAdmin = hasPermission(user, "users.manage");
  const canSeeElements = getReadScope(user, "elements") !== null;
  const hasPlans = getReadScope(user, "actions") !== null;
  const [summary, schedule, plans, toReview] = await Promise.all([
    isAdmin ? getFoundationSummary() : null,
    canSeeElements ? scheduleSummary(user) : null,
    hasPlans ? myActionPlanSummary(user) : null,
    countPendingReview(user),
  ]);
  const firstName = user.name.split(" ")[0];

  return (
    <>
      <PageHeader
        title={`Hola, ${firstName}`}
        description="Resumen general del sistema de inspecciones."
        actions={
          hasPermission(user, "inspections.perform") && (
            <ButtonLink href="/inspections" size="lg">
              Ir a mis inspecciones
            </ButtonLink>
          )
        }
      />

      {schedule && schedule.expired > 0 && (
        <Alert tone="danger" className="mb-4" title={`ALERTA CRÍTICA: ${schedule.expired} elemento(s) con vencimiento expirado`}>
          Por ejemplo, extintores con la recarga vencida. Requieren atención inmediata.{" "}
          <Link href="/inventory?expiry=EXPIRED" className="font-semibold underline">
            Ver elementos vencidos
          </Link>
        </Alert>
      )}

      {toReview > 0 && (
        <Alert tone="warning" className="mb-4" title={`${toReview} inspección(es) con hallazgos esperando revisión`}>
          Asigna el plan de acción y el responsable de cada hallazgo.{" "}
          <Link href="/review" className="font-semibold underline">
            Ir a Revisión
          </Link>
        </Alert>
      )}

      {plans && (plans.open > 0 || plans.toVerify > 0 || plans.overdue > 0) && (
        <section aria-label="Mis planes de acción" className="mb-6">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-subtle">Mis planes de acción</h2>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatCard label="Abiertos" value={plans.open} icon={ClipboardList} href="/action-plans?view=mine" />
            <StatCard label="Vencidos" value={plans.overdue} icon={Timer} tone="danger" href="/action-plans?view=mine&overdue=1" />
            {user.permissions.has("actions.verify") && (
              <StatCard label="Por verificar" value={plans.toVerify} icon={ShieldCheck} tone="warning" href="/action-plans?view=all&status=SOLVED" />
            )}
          </div>
        </section>
      )}

      {schedule && (
        <section aria-label="Vencimientos" className="mb-6">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-subtle">Vencimientos (recargas, caducidades)</h2>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatCard label="Vencidos · crítico" value={schedule.expired} icon={Flame} tone="danger" href="/inventory?expiry=EXPIRED" />
            <StatCard label="Por vencer (30 días)" value={schedule.expiring} icon={BatteryWarning} tone="warning" href="/inventory?expiry=EXPIRING" />
          </div>
        </section>
      )}

      {schedule && (
        <section aria-label="Programación de inspecciones" className="mb-6">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-subtle">Programación de inspecciones</h2>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatCard label="Elementos activos" value={schedule.active} icon={Boxes} tone="neutral" href="/inventory?status=ACTIVE" />
            <StatCard label="Vencidas" value={schedule.overdue} icon={AlertOctagon} tone="danger" href="/inventory?schedule=OVERDUE" />
            <StatCard label="Próximas a vencer" value={schedule.dueSoon} icon={CalendarClock} tone="warning" href="/inventory?schedule=DUE_SOON" />
            <StatCard label="Al día" value={schedule.onTime} icon={CalendarCheck} tone="success" href="/inventory?schedule=ON_TIME" />
          </div>
        </section>
      )}

      {summary && (
        <section aria-label="Datos maestros" className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
          <StatCard label="Usuarios activos" value={summary.users} icon={Users} href="/admin/users" />
          <StatCard label="Roles" value={summary.roles} icon={KeyRound} tone="neutral" href="/admin/roles" />
          <StatCard label="Procesos" value={summary.processes} icon={Network} tone="success" href="/admin/processes" />
          <StatCard label="Sedes" value={summary.sites} icon={Building2} tone="warning" href="/admin/sites" />
          <StatCard label="Zonas" value={summary.zones} icon={MapPin} tone="neutral" href="/admin/sites" />
        </section>
      )}

      {hasPermission(user, "dashboard.view") && (
        <Card>
          <CardHeader
            title="Dashboard gerencial"
            description="Cumplimiento por proceso y sede, hallazgos, planes de acción y tendencia mensual, con filtros."
            actions={<ButtonLink href="/indicators">Ver indicadores</ButtonLink>}
          />
        </Card>
      )}
    </>
  );
}

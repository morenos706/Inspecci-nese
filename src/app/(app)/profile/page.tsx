import { Badge } from "@/components/ui/badge";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { ChangePasswordForm } from "@/components/forms/password-forms";
import { EmailPreferenceToggle } from "@/components/notifications/notification-actions";
import { requirePageUser } from "@/server/auth/current-user";
import { getEmailPreference } from "@/server/services/notifications.service";

export const metadata = { title: "Mi cuenta" };

export default async function ProfilePage() {
  const user = await requirePageUser();
  const emailNotifications = await getEmailPreference(user.id);
  return (
    <>
      <PageHeader title="Mi cuenta" />
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title="Datos del usuario" />
          <CardBody>
            <dl className="space-y-3 text-sm">
              <div>
                <dt className="text-subtle">Nombre</dt>
                <dd className="font-medium">{user.name}</dd>
              </div>
              <div>
                <dt className="text-subtle">Correo</dt>
                <dd className="font-medium">{user.email}</dd>
              </div>
              {user.jobTitle && (
                <div>
                  <dt className="text-subtle">Cargo</dt>
                  <dd className="font-medium">{user.jobTitle}</dd>
                </div>
              )}
              <div>
                <dt className="text-subtle">Roles</dt>
                <dd className="mt-1 flex flex-wrap gap-1">
                  {user.roles.map((r) => (
                    <Badge key={r.code} tone="primary">
                      {r.name}
                    </Badge>
                  ))}
                </dd>
              </div>
            </dl>
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Notificaciones" description="Siempre verás tus avisos en la campana; elige si también quieres recibirlos por correo." />
          <CardBody>
            <EmailPreferenceToggle enabled={emailNotifications} />
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Cambiar contraseña" description="Al cambiarla se cerrarán tus sesiones en otros dispositivos." />
          <CardBody>
            <ChangePasswordForm />
          </CardBody>
        </Card>
      </div>
    </>
  );
}

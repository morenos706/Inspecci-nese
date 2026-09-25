import { KeyRound, LockOpen, Trash2 } from "lucide-react";
import { Alert } from "@/components/ui/alert";
import { ConfirmButton } from "@/components/ui/confirm-button";
import { PageHeader } from "@/components/ui/page-header";
import { UserForm } from "@/components/forms/user-form";
import { formatDateTime } from "@/lib/utils";
import { requirePagePermission } from "@/server/auth/current-user";
import { orNotFound } from "@/server/page-helpers";
import { deleteUserAction, sendUserPasswordResetAction, unlockUserAction } from "@/server/actions/users.actions";
import { listProcessOptions } from "@/server/services/processes.service";
import { listRoleOptions } from "@/server/services/roles.service";
import { getUser } from "@/server/services/users.service";

export const metadata = { title: "Editar usuario" };

export default async function EditUserPage({ params }: PageProps<"/admin/users/[id]">) {
  const me = await requirePagePermission("users.manage");
  const { id } = await params;
  const user = await orNotFound(getUser(id));
  const [roles, processes] = await Promise.all([listRoleOptions(), listProcessOptions()]);
  const locked = user.lockedUntil && user.lockedUntil > new Date();

  return (
    <>
      <PageHeader
        title={user.name}
        description={`Creado ${formatDateTime(user.createdAt)} · Último ingreso ${formatDateTime(user.lastLoginAt)}`}
        back={{ href: "/admin/users", label: "Usuarios" }}
        actions={
          <>
            {locked && (
              <ConfirmButton
                action={unlockUserAction.bind(null, user.id)}
                title="Desbloquear usuario"
                description="El usuario podrá volver a intentar iniciar sesión inmediatamente."
                confirmLabel="Desbloquear"
                confirmVariant="primary"
              >
                <LockOpen className="h-4 w-4" aria-hidden /> Desbloquear
              </ConfirmButton>
            )}
            {user.active && (
              <ConfirmButton
                action={sendUserPasswordResetAction.bind(null, user.id)}
                title="Enviar enlace de restablecimiento"
                description={`Se enviará un correo a ${user.email} con un enlace para crear una nueva contraseña.`}
                confirmLabel="Enviar"
                confirmVariant="primary"
              >
                <KeyRound className="h-4 w-4" aria-hidden /> Restablecer contraseña
              </ConfirmButton>
            )}
            {user.id !== me.id && (
              <ConfirmButton
                action={deleteUserAction.bind(null, user.id)}
                title={`Eliminar a ${user.name}`}
                description="Perderá el acceso de inmediato y su correo quedará libre. Si ya realizó inspecciones o gestionó hallazgos, su nombre se conserva en ese historial. Si tiene planes de acción abiertos, primero debes reasignarlos."
                confirmLabel="Eliminar usuario"
              >
                <Trash2 className="h-4 w-4" aria-hidden /> Eliminar
              </ConfirmButton>
            )}
          </>
        }
      />
      {locked && (
        <Alert tone="warning" className="mb-4" title="Usuario bloqueado temporalmente">
          Por intentos fallidos de inicio de sesión, hasta {formatDateTime(user.lockedUntil)}.
        </Alert>
      )}
      <UserForm
        user={{
          id: user.id,
          name: user.name,
          email: user.email,
          phone: user.phone,
          jobTitle: user.jobTitle,
          active: user.active,
          roleIds: user.roles.map((r) => r.role.id),
          processIds: user.processes.map((p) => p.process.id),
        }}
        roles={roles}
        processes={processes}
      />
    </>
  );
}

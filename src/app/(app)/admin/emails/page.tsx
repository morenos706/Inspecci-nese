import Link from "next/link";
import { EmailTemplatesEditor } from "@/components/admin/email-templates-editor";
import { PageHeader } from "@/components/ui/page-header";
import { requirePagePermission } from "@/server/auth/current-user";
import { mailConfigSummary } from "@/server/mail/mailer";
import { getEmailConfig } from "@/server/mail/templates";
import { Alert } from "@/components/ui/alert";

export const metadata = { title: "Correos" };

export default async function EmailTemplatesPage() {
  await requirePagePermission("settings.manage");
  const config = await getEmailConfig();
  const mail = mailConfigSummary();
  return (
    <>
      <PageHeader
        title="Correos del sistema"
        description="Personaliza el diseño y el texto de los correos: notificaciones, bienvenida de usuarios y restablecimiento de contraseña."
      />
      {!mail.configured && (
        <Alert tone="warning" className="mb-4" title="El envío de correos no está configurado">
          Falta SMTP_HOST en el servidor. Puedes editar las plantillas, pero no se enviarán hasta configurarlo (ver{" "}
          <Link href="/profile" className="font-semibold underline">
            Mi cuenta → Correo del sistema
          </Link>
          ).
        </Alert>
      )}
      {/* key: al guardar o restaurar, el editor se reinicia con lo guardado */}
      <EmailTemplatesEditor key={JSON.stringify(config)} initial={config} />
    </>
  );
}

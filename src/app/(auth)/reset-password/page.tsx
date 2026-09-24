import type { Metadata } from "next";
import Link from "next/link";
import { Alert } from "@/components/ui/alert";
import { ResetPasswordForm } from "@/components/forms/password-forms";
import { findValidResetToken } from "@/server/services/auth.service";

export const metadata: Metadata = { title: "Nueva contraseña" };

export default async function ResetPasswordPage({ searchParams }: PageProps<"/reset-password">) {
  const { token } = await searchParams;
  const valid = typeof token === "string" && token.length <= 200 ? await findValidResetToken(token) : null;

  if (!valid) {
    return (
      <div className="space-y-4">
        <Alert tone="danger" title="Enlace inválido o vencido">
          Solicita un nuevo enlace de recuperación.
        </Alert>
        <Link href="/forgot-password" className="block text-center text-sm text-primary hover:underline">
          Solicitar nuevo enlace
        </Link>
      </div>
    );
  }

  return (
    <>
      <h2 className="mb-4 text-lg font-semibold">Crear nueva contraseña</h2>
      <ResetPasswordForm token={token as string} />
    </>
  );
}

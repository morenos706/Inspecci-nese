import type { Metadata } from "next";
import { ForgotPasswordForm } from "@/components/forms/password-forms";

export const metadata: Metadata = { title: "Recuperar contraseña" };

export default function ForgotPasswordPage() {
  return (
    <>
      <h2 className="text-lg font-semibold">Recuperar contraseña</h2>
      <p className="mb-4 mt-1 text-sm text-subtle">Te enviaremos un enlace para crear una nueva contraseña.</p>
      <ForgotPasswordForm />
    </>
  );
}

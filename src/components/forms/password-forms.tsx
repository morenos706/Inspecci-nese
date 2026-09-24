"use client";

import Link from "next/link";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { useActionForm } from "@/hooks/use-action-form";
import { changePasswordAction, forgotPasswordAction, resetPasswordAction } from "@/server/actions/auth.actions";

const PASSWORD_HINT = "Mínimo 8 caracteres, con mayúscula, minúscula y número.";

export function ForgotPasswordForm() {
  const { state, onSubmit, pending, errors } = useActionForm(forgotPasswordAction, { successToast: false });

  if (state.ok) {
    return (
      <div className="space-y-4">
        <Alert tone="success">{state.message}</Alert>
        <Link href="/login" className="block text-center text-sm text-primary hover:underline">
          Volver al inicio de sesión
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      <FormField label="Correo electrónico" errors={errors("email")} required>
        <Input name="email" type="email" autoComplete="email" inputMode="email" autoFocus />
      </FormField>
      <Button type="submit" size="lg" className="w-full" loading={pending}>
        Enviar enlace
      </Button>
      <p className="text-center text-sm">
        <Link href="/login" className="text-primary hover:underline">
          Volver al inicio de sesión
        </Link>
      </p>
    </form>
  );
}

export function ResetPasswordForm({ token }: { token: string }) {
  const { onSubmit, pending, errors } = useActionForm(resetPasswordAction);
  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      <input type="hidden" name="token" value={token} />
      <FormField label="Nueva contraseña" errors={errors("password")} hint={PASSWORD_HINT} required>
        <Input name="password" type="password" autoComplete="new-password" autoFocus />
      </FormField>
      <FormField label="Confirmar contraseña" errors={errors("confirmPassword")} required>
        <Input name="confirmPassword" type="password" autoComplete="new-password" />
      </FormField>
      <Button type="submit" size="lg" className="w-full" loading={pending}>
        Guardar contraseña
      </Button>
    </form>
  );
}

export function ChangePasswordForm() {
  const { onSubmit, pending, errors } = useActionForm(changePasswordAction);
  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      <FormField label="Contraseña actual" errors={errors("currentPassword")} required>
        <Input name="currentPassword" type="password" autoComplete="current-password" />
      </FormField>
      <FormField label="Nueva contraseña" errors={errors("newPassword")} hint={PASSWORD_HINT} required>
        <Input name="newPassword" type="password" autoComplete="new-password" />
      </FormField>
      <FormField label="Confirmar nueva contraseña" errors={errors("confirmPassword")} required>
        <Input name="confirmPassword" type="password" autoComplete="new-password" />
      </FormField>
      <Button type="submit" loading={pending}>
        Cambiar contraseña
      </Button>
    </form>
  );
}

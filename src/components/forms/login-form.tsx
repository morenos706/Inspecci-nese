"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { useActionForm } from "@/hooks/use-action-form";
import { loginAction } from "@/server/actions/auth.actions";

export function LoginForm({ next }: { next: string }) {
  const { onSubmit, pending, errors } = useActionForm(loginAction);
  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      <input type="hidden" name="next" value={next} />
      <FormField label="Correo electrónico" errors={errors("email")} required>
        <Input name="email" type="email" autoComplete="username" inputMode="email" autoFocus />
      </FormField>
      <FormField label="Contraseña" errors={errors("password")} required>
        <Input name="password" type="password" autoComplete="current-password" />
      </FormField>
      <Button type="submit" size="lg" className="w-full" loading={pending}>
        Ingresar
      </Button>
      <p className="text-center text-sm">
        <Link href="/forgot-password" className="text-primary hover:underline">
          ¿Olvidaste tu contraseña?
        </Link>
      </p>
    </form>
  );
}

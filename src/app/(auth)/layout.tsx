import { redirect } from "next/navigation";
import { ShieldAlert } from "lucide-react";
import { getCurrentUser } from "@/server/auth/current-user";

export default async function AuthLayout({ children }: LayoutProps<"/">) {
  // Un usuario con sesión no necesita ver login / recuperación.
  if (await getCurrentUser()) redirect("/");

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center px-4 py-10">
      <div className="mb-6 flex flex-col items-center text-center">
        <span className="mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-brand text-white shadow-lg">
          <ShieldAlert className="h-8 w-8" aria-hidden />
        </span>
        <h1 className="text-xl font-semibold">Inspecciones de Emergencia</h1>
        <p className="text-sm text-subtle">Gestión de equipos y elementos de emergencia</p>
      </div>
      <div className="w-full max-w-sm rounded-2xl border border-border bg-surface p-6 shadow-sm">{children}</div>
    </div>
  );
}

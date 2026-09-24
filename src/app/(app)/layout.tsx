import { redirect } from "next/navigation";
import { AppShell } from "@/components/layout/app-shell";
import { getCurrentUser } from "@/server/auth/current-user";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  return (
    <AppShell
      user={{
        name: user.name,
        email: user.email,
        roles: user.roles.map((r) => r.name),
        permissions: [...user.permissions],
      }}
    >
      {user.mustChangePassword && (
        <div className="mb-4 rounded-lg border border-amber-200 bg-warning-soft p-3 text-sm text-warning" role="status">
          Estás usando una contraseña temporal.{" "}
          <a href="/profile" className="font-semibold underline">
            Cámbiala ahora
          </a>
          .
        </div>
      )}
      {children}
    </AppShell>
  );
}

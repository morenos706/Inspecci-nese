import type { Metadata } from "next";
import { LoginForm } from "@/components/forms/login-form";
import { safeRedirectPath } from "@/lib/safe-redirect";

export const metadata: Metadata = { title: "Iniciar sesión" };

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const { next } = await searchParams;
  return (
    <>
      <h2 className="mb-4 text-lg font-semibold">Iniciar sesión</h2>
      <LoginForm next={safeRedirectPath(typeof next === "string" ? next : undefined, "/")} />
    </>
  );
}

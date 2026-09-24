"use client";

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LogOut, Menu, ShieldAlert, UserCircle2, X } from "lucide-react";
import { cn, initials } from "@/lib/utils";
import { logoutAction } from "@/server/actions/auth.actions";
import { isActivePath, visibleNavigation, type NavSection } from "@/components/layout/navigation";
import { NotificationBell } from "@/components/notifications/notification-bell";

interface ShellUser {
  name: string;
  email: string;
  roles: string[];
  permissions: string[];
}

function Brand() {
  return (
    <Link href="/dashboard" className="flex items-center gap-2 font-semibold text-foreground">
      <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand text-white">
        <ShieldAlert className="h-5 w-5" aria-hidden />
      </span>
      <span className="leading-tight">
        Inspecciones
        <span className="block text-xs font-normal text-subtle">Elementos de emergencia</span>
      </span>
    </Link>
  );
}

function NavLinks({ sections, pathname, onNavigate }: { sections: NavSection[]; pathname: string; onNavigate?: () => void }) {
  return (
    <nav aria-label="Principal" className="space-y-6">
      {sections.map((section, i) => (
        <div key={section.title ?? i}>
          {section.title && (
            <p className="mb-2 px-3 text-xs font-semibold uppercase tracking-wide text-subtle">{section.title}</p>
          )}
          <ul className="space-y-1">
            {section.items.map((item) => {
              const active = isActivePath(pathname, item.href);
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    onClick={onNavigate}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "flex h-11 items-center gap-3 rounded-lg px-3 text-sm font-medium transition-colors",
                      active ? "bg-primary-soft text-primary" : "text-muted hover:bg-surface-muted hover:text-foreground",
                    )}
                  >
                    <item.icon className="h-5 w-5 shrink-0" aria-hidden />
                    {item.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}

function UserBox({ user }: { user: ShellUser }) {
  return (
    <div className="border-t border-border p-3">
      <Link href="/profile" className="flex items-center gap-3 rounded-lg p-2 hover:bg-surface-muted">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary-soft text-sm font-semibold text-primary">
          {initials(user.name)}
        </span>
        <span className="min-w-0 text-sm">
          <span className="block truncate font-medium text-foreground">{user.name}</span>
          <span className="block truncate text-xs text-subtle">{user.roles.join(", ")}</span>
        </span>
      </Link>
      <form action={logoutAction}>
        <button
          type="submit"
          className="mt-1 flex h-11 w-full items-center gap-3 rounded-lg px-3 text-sm font-medium text-muted hover:bg-surface-muted hover:text-foreground"
        >
          <LogOut className="h-5 w-5" aria-hidden />
          Cerrar sesión
        </button>
      </form>
    </div>
  );
}

export function AppShell({ user, children }: { user: ShellUser; children: ReactNode }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const sections = visibleNavigation(user.permissions);
  // Barra inferior: máximo 4 accesos (+ Mi cuenta); el resto queda en el menú.
  const mobileItems = sections
    .flatMap((s) => s.items)
    .filter((i) => i.mobile)
    .slice(0, 4);

  // Bloquea el scroll del fondo mientras el menú móvil está abierto.
  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  return (
    <div className="min-h-dvh lg:flex">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:m-2 focus:rounded focus:bg-surface focus:p-2">
        Saltar al contenido
      </a>

      {/* Sidebar escritorio */}
      <aside className="hidden w-64 shrink-0 flex-col border-r border-border bg-surface lg:sticky lg:top-0 lg:flex lg:h-dvh">
        <div className="flex items-center justify-between gap-2 p-4">
          <Brand />
          <NotificationBell variant="desktop" />
        </div>
        <div className="flex-1 overflow-y-auto px-3 py-2">
          <NavLinks sections={sections} pathname={pathname} />
        </div>
        <UserBox user={user} />
      </aside>

      {/* Barra superior móvil */}
      <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-border bg-surface/95 px-4 backdrop-blur lg:hidden">
        <Brand />
        <div className="flex items-center">
          <NotificationBell variant="mobile" />
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="flex h-11 w-11 items-center justify-center rounded-lg text-muted hover:bg-surface-muted"
            aria-label="Abrir menú"
            aria-expanded={open}
            aria-controls="mobile-menu"
          >
            <Menu className="h-6 w-6" aria-hidden />
          </button>
        </div>
      </header>

      {/* Drawer móvil */}
      {open && (
        <div className="fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal="true" aria-label="Menú" id="mobile-menu">
          <div className="absolute inset-0 bg-slate-900/50" onClick={() => setOpen(false)} aria-hidden />
          <div className="absolute inset-y-0 right-0 flex w-80 max-w-[85%] flex-col bg-surface shadow-xl">
            <div className="flex h-14 items-center justify-between border-b border-border px-4">
              <span className="font-semibold">Menú</span>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="flex h-11 w-11 items-center justify-center rounded-lg text-muted hover:bg-surface-muted"
                aria-label="Cerrar menú"
              >
                <X className="h-6 w-6" aria-hidden />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-3">
              <NavLinks sections={sections} pathname={pathname} onNavigate={() => setOpen(false)} />
            </div>
            <UserBox user={user} />
          </div>
        </div>
      )}

      <main id="main" className="min-w-0 flex-1 px-4 pb-24 pt-4 sm:px-6 lg:px-8 lg:pb-8 lg:pt-8">
        <div className="mx-auto max-w-6xl">{children}</div>
      </main>

      {/* Navegación inferior móvil: accesos de uso frecuente en campo */}
      <nav
        aria-label="Accesos rápidos"
        className="pb-safe fixed inset-x-0 bottom-0 z-30 border-t border-border bg-surface lg:hidden"
      >
        <ul className="flex">
          {mobileItems.map((item) => {
            const active = isActivePath(pathname, item.href);
            return (
              <li key={item.href} className="flex-1">
                <Link
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "flex h-16 flex-col items-center justify-center gap-1 text-xs font-medium",
                    active ? "text-primary" : "text-subtle",
                  )}
                >
                  <item.icon className="h-6 w-6" aria-hidden />
                  {item.label}
                </Link>
              </li>
            );
          })}
          <li className="flex-1">
            <Link
              href="/profile"
              aria-current={isActivePath(pathname, "/profile") ? "page" : undefined}
              className={cn(
                "flex h-16 flex-col items-center justify-center gap-1 text-xs font-medium",
                isActivePath(pathname, "/profile") ? "text-primary" : "text-subtle",
              )}
            >
              <UserCircle2 className="h-6 w-6" aria-hidden />
              Mi cuenta
            </Link>
          </li>
        </ul>
      </nav>
    </div>
  );
}

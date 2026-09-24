"use client";

import { useCallback, useEffect, useEffectEvent, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Bell } from "lucide-react";
import { cn } from "@/lib/utils";
import { notificationTone, timeAgo, type NotificationTone } from "@/lib/notifications";

interface Summary {
  unread: number;
  latest: { id: string; type: string; title: string; body: string; createdAt: string }[];
}

const POLL_MS = 60_000;

/** Evento para que otras vistas (p.ej. "Marcar todas como leídas") actualicen la campana. */
export const NOTIFICATIONS_CHANGED = "notifications:changed";

const DOT: Record<NotificationTone, string> = {
  danger: "bg-danger",
  warning: "bg-warning",
  primary: "bg-primary",
  success: "bg-success",
  neutral: "bg-slate-400",
};

/**
 * Campana con contador de no leídas. Consulta /api/notifications/summary cada
 * minuto, al volver a la pestaña y al navegar. En escritorio abre un panel
 * con las últimas; en móvil lleva directo a la bandeja.
 */
export function NotificationBell({ variant }: { variant: "desktop" | "mobile" }) {
  const pathname = usePathname();
  const [summary, setSummary] = useState<Summary | null>(null);
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/notifications/summary", { cache: "no-store" });
      if (!res.ok) return;
      const data = (await res.json()) as Summary;
      setSummary(data);
      // Contador en el ícono de la app instalada (PWA), donde el sistema lo soporte.
      const nav = navigator as Navigator & { setAppBadge?: (n?: number) => Promise<void>; clearAppBadge?: () => Promise<void> };
      if (data.unread > 0) nav.setAppBadge?.(data.unread).catch(() => {});
      else nav.clearAppBadge?.().catch(() => {});
    } catch {
      // sin conexión: se mantiene el último valor
    }
  }, []);

  const refresh = useEffectEvent(() => {
    if (document.visibilityState === "visible") void load();
  });

  // Consulta al montar, al navegar (p.ej. tras abrir una notificación), cada minuto y al volver a la pestaña.
  useEffect(() => {
    const kick = setTimeout(() => refresh(), 0);
    const timer = setInterval(() => refresh(), POLL_MS);
    const handler = () => refresh();
    document.addEventListener("visibilitychange", handler);
    window.addEventListener(NOTIFICATIONS_CHANGED, handler);
    return () => {
      clearTimeout(kick);
      clearInterval(timer);
      document.removeEventListener("visibilitychange", handler);
      window.removeEventListener(NOTIFICATIONS_CHANGED, handler);
    };
  }, [pathname]);

  // Cierra el panel al cambiar de página (ajuste de estado durante el render).
  const [lastPath, setLastPath] = useState(pathname);
  if (lastPath !== pathname) {
    setLastPath(pathname);
    setOpen(false);
  }

  const onOutside = useEffectEvent((e: MouseEvent | KeyboardEvent) => {
    if (e instanceof KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
      return;
    }
    if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
  });
  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent | KeyboardEvent) => onOutside(e);
    document.addEventListener("mousedown", h);
    document.addEventListener("keydown", h);
    return () => {
      document.removeEventListener("mousedown", h);
      document.removeEventListener("keydown", h);
    };
  }, [open]);

  const unread = summary?.unread ?? 0;
  const label = unread > 0 ? `Notificaciones: ${unread} sin leer` : "Notificaciones";
  const badge = unread > 0 && (
    <span
      className="absolute right-1 top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-danger px-1 text-[11px] font-semibold leading-none text-white ring-2 ring-surface"
      aria-hidden
    >
      {unread > 99 ? "99+" : unread}
    </span>
  );
  const buttonClass =
    "relative flex h-11 w-11 items-center justify-center rounded-lg text-muted hover:bg-surface-muted hover:text-foreground";

  if (variant === "mobile") {
    return (
      <Link href="/notifications" className={buttonClass} aria-label={label}>
        <Bell className="h-6 w-6" aria-hidden />
        {badge}
      </Link>
    );
  }

  return (
    <div className="relative" ref={boxRef}>
      <button
        type="button"
        className={buttonClass}
        aria-label={label}
        aria-expanded={open}
        aria-haspopup="true"
        onClick={() => {
          setOpen((v) => !v);
          void load();
        }}
      >
        <Bell className="h-5 w-5" aria-hidden />
        {badge}
      </button>
      {open && (
        <div
          className="absolute left-0 top-full z-50 mt-2 w-80 overflow-hidden rounded-xl border border-border bg-surface shadow-xl"
          role="region"
          aria-label="Últimas notificaciones"
        >
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <p className="text-sm font-semibold">Notificaciones</p>
            {unread > 0 && <span className="text-xs text-subtle">{unread} sin leer</span>}
          </div>
          {summary && summary.latest.length > 0 ? (
            <ul className="max-h-96 divide-y divide-border overflow-y-auto">
              {summary.latest.map((n) => (
                <li key={n.id}>
                  <a href={`/api/notifications/${n.id}/open`} className="flex gap-3 px-4 py-3 hover:bg-surface-muted">
                    <span className={cn("mt-1.5 h-2 w-2 shrink-0 rounded-full", DOT[notificationTone(n.type, n.title)])} aria-hidden />
                    <span className="min-w-0 text-sm">
                      <span className="block font-medium text-foreground">{n.title}</span>
                      <span className="line-clamp-2 text-muted">{n.body}</span>
                      <span className="mt-0.5 block text-xs text-subtle">{timeAgo(new Date(n.createdAt))}</span>
                    </span>
                  </a>
                </li>
              ))}
            </ul>
          ) : (
            <p className="px-4 py-8 text-center text-sm text-subtle">No tienes notificaciones sin leer.</p>
          )}
          <Link
            href="/notifications"
            className="block border-t border-border px-4 py-3 text-center text-sm font-medium text-primary hover:bg-surface-muted"
          >
            Ver todas
          </Link>
        </div>
      )}
    </div>
  );
}

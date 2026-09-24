import Link from "next/link";
import { Bell } from "lucide-react";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { Pagination } from "@/components/ui/pagination";
import { MarkAllReadButton } from "@/components/notifications/notification-actions";
import { notificationTone, timeAgo, type NotificationTone } from "@/lib/notifications";
import { cn, formatDateTime } from "@/lib/utils";
import { requirePageUser } from "@/server/auth/current-user";
import { listNotifications, notificationsQuerySchema } from "@/server/services/notifications.service";

export const metadata = { title: "Notificaciones" };

const DOT: Record<NotificationTone, string> = {
  danger: "bg-danger",
  warning: "bg-warning",
  primary: "bg-primary",
  success: "bg-success",
  neutral: "bg-slate-400",
};

export default async function NotificationsPage({ searchParams }: PageProps<"/notifications">) {
  const user = await requirePageUser();
  const query = notificationsQuerySchema.parse(await searchParams);
  const result = await listNotifications(user.id, query);
  const now = new Date();

  const tab = (filter: "all" | "unread", label: string) => (
    <Link
      href={filter === "all" ? "/notifications" : "/notifications?filter=unread"}
      aria-current={query.filter === filter ? "page" : undefined}
      className={cn(
        "flex-1 rounded-lg px-3 py-2 text-center text-sm font-medium sm:flex-none",
        query.filter === filter ? "bg-surface text-foreground shadow-sm" : "text-subtle hover:text-foreground",
      )}
    >
      {label}
    </Link>
  );

  return (
    <>
      <PageHeader
        title="Notificaciones"
        description="Asignaciones, recordatorios y alertas. También llegan a tu correo si lo tienes activado en Mi cuenta."
        actions={<MarkAllReadButton disabled={result.unread === 0} />}
      />
      <div className="mb-4 flex gap-1 rounded-xl bg-surface-muted p-1 sm:inline-flex">
        {tab("all", "Todas")}
        {tab("unread", `No leídas (${result.unread})`)}
      </div>
      <Card>
        {result.items.length === 0 ? (
          <EmptyState
            icon={Bell}
            title={query.filter === "unread" ? "Estás al día" : "Aún no tienes notificaciones"}
            description="Aquí verás los planes que te asignen, los recordatorios de vencimiento y las alertas críticas."
          />
        ) : (
          <ul className="divide-y divide-border">
            {result.items.map((n) => (
              <li key={n.id}>
                <a
                  href={`/api/notifications/${n.id}/open`}
                  className={cn("flex gap-3 px-4 py-4 hover:bg-surface-muted sm:px-5", !n.readAt && "bg-primary-soft/40")}
                >
                  <span
                    className={cn("mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full", n.readAt ? "bg-slate-300" : DOT[notificationTone(n.type, n.title)])}
                    aria-hidden
                  />
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-baseline justify-between gap-x-3">
                      <span className={cn("text-sm text-foreground", !n.readAt && "font-semibold")}>
                        {n.title}
                        {!n.readAt && <span className="sr-only"> (sin leer)</span>}
                      </span>
                      <time dateTime={n.createdAt.toISOString()} title={formatDateTime(n.createdAt)} className="text-xs text-subtle">
                        {timeAgo(n.createdAt, now)}
                      </time>
                    </span>
                    <span className="mt-0.5 block whitespace-pre-line text-sm text-muted">{n.body}</span>
                  </span>
                </a>
              </li>
            ))}
          </ul>
        )}
        {result.total > 0 && (
          <Pagination
            page={result.page}
            pageCount={result.pages}
            total={result.total}
            basePath="/notifications"
            searchParams={{ filter: query.filter === "unread" ? "unread" : undefined }}
          />
        )}
      </Card>
    </>
  );
}

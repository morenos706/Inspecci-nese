"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CheckCheck, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { NOTIFICATIONS_CHANGED } from "@/components/notifications/notification-bell";
import { markAllNotificationsReadAction, sendTestEmailAction, setEmailNotificationsAction } from "@/server/actions/notifications.actions";

export function MarkAllReadButton({ disabled }: { disabled?: boolean }) {
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  return (
    <Button
      variant="outline"
      disabled={disabled || pending}
      onClick={() =>
        startTransition(async () => {
          const result = await markAllNotificationsReadAction();
          if (result.ok) toast.success(result.message);
          else toast.error(result.message ?? "No se pudo completar la acción.");
          window.dispatchEvent(new Event(NOTIFICATIONS_CHANGED));
          router.refresh();
        })
      }
    >
      <CheckCheck className="h-4 w-4" aria-hidden />
      Marcar todas como leídas
    </Button>
  );
}

export function EmailPreferenceToggle({ enabled }: { enabled: boolean }) {
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  return (
    <Checkbox
      name="emailNotifications"
      defaultChecked={enabled}
      disabled={pending}
      label="Recibir notificaciones por correo"
      description="Asignaciones, planes por vencer o vencidos, alertas críticas y el resumen diario de inspecciones. En la campana siempre las verás."
      onChange={(e) => {
        const value = e.currentTarget.checked;
        startTransition(async () => {
          const result = await setEmailNotificationsAction(value);
          if (result.ok) toast.success(result.message);
          else toast.error(result.message ?? "No se pudo guardar la preferencia.");
          router.refresh();
        });
      }}
    />
  );
}

export function TestEmailButton() {
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);
  return (
    <div className="space-y-3">
      <Button
        variant="outline"
        loading={pending}
        onClick={() =>
          startTransition(async () => {
            const r = await sendTestEmailAction();
            setResult({ ok: r.ok, message: r.message ?? "" });
            if (r.ok) toast.success("Correo de prueba enviado");
            else toast.error("No se pudo enviar el correo de prueba");
          })
        }
      >
        <Send className="h-4 w-4" aria-hidden />
        Enviar correo de prueba
      </Button>
      {result && (
        <p role="status" className={result.ok ? "text-sm text-success" : "text-sm text-danger"}>
          {result.message}
        </p>
      )}
    </div>
  );
}

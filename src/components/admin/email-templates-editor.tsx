"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { RotateCcw, Save, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { ConfirmButton } from "@/components/ui/confirm-button";
import { FormField } from "@/components/ui/form-field";
import { Input, Textarea } from "@/components/ui/input";
import {
  EMAIL_TEMPLATE_INFO,
  emailConfigSchema,
  renderEmail,
  SAMPLE_VARS,
  VARIABLE_HELP,
  type EmailConfig,
  type EmailTemplateKey,
} from "@/lib/email-templates";
import { cn } from "@/lib/utils";
import { resetEmailTemplatesAction, saveEmailTemplatesAction, sendTestEmailAction } from "@/server/actions/notifications.actions";

type Tab = "brand" | EmailTemplateKey;

/**
 * Editor de los correos del sistema: diseño general y, por plantilla, asunto,
 * contenido HTML y texto del botón, con vista previa en vivo (datos de ejemplo).
 * La vista previa se muestra en un iframe aislado (sandbox, sin scripts).
 */
export function EmailTemplatesEditor({ initial }: { initial: EmailConfig }) {
  const [config, setConfig] = useState<EmailConfig>(initial);
  const [tab, setTab] = useState<Tab>("notification");
  const [saving, startSave] = useTransition();
  const [testing, startTest] = useTransition();
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const router = useRouter();

  const previewKey: EmailTemplateKey = tab === "brand" ? "notification" : tab;
  const preview = useMemo(() => renderEmail(config, previewKey, SAMPLE_VARS[previewKey]), [config, previewKey]);
  const validation = emailConfigSchema.safeParse(config);
  const dirty = JSON.stringify(config) !== JSON.stringify(initial);

  const setBrand = (patch: Partial<EmailConfig["brand"]>) => setConfig((c) => ({ ...c, brand: { ...c.brand, ...patch } }));
  const setTemplate = (key: EmailTemplateKey, patch: Partial<EmailConfig["templates"][EmailTemplateKey]>) =>
    setConfig((c) => ({ ...c, templates: { ...c.templates, [key]: { ...c.templates[key], ...patch } } }));

  function insertVariable(key: EmailTemplateKey, name: string) {
    const el = bodyRef.current;
    const token = `{{${name}}}`;
    const value = config.templates[key].bodyHtml;
    const start = el?.selectionStart ?? value.length;
    const end = el?.selectionEnd ?? value.length;
    setTemplate(key, { bodyHtml: value.slice(0, start) + token + value.slice(end) });
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(start + token.length, start + token.length);
    });
  }

  function save() {
    startSave(async () => {
      const result = await saveEmailTemplatesAction(config);
      if (result.ok) {
        toast.success(result.message);
        router.refresh();
      } else toast.error(result.message ?? "No se pudo guardar.");
    });
  }

  function sendTest() {
    startTest(async () => {
      if (dirty) {
        const saved = await saveEmailTemplatesAction(config);
        if (!saved.ok) return void toast.error(saved.message ?? "No se pudo guardar.");
        router.refresh();
      }
      const result = await sendTestEmailAction(previewKey);
      if (result.ok) toast.success(result.message);
      else toast.error(result.message ?? "No se pudo enviar el correo de prueba.");
    });
  }

  const tabs: [Tab, string][] = [
    ["notification", EMAIL_TEMPLATE_INFO.notification.label],
    ["welcome", EMAIL_TEMPLATE_INFO.welcome.label],
    ["password_reset", EMAIL_TEMPLATE_INFO.password_reset.label],
    ["brand", "Diseño general"],
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-1 rounded-xl bg-surface-muted p-1" role="tablist" aria-label="Plantillas">
        {tabs.map(([key, label]) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={tab === key}
            onClick={() => setTab(key)}
            className={cn(
              "flex-1 rounded-lg px-3 py-2 text-sm font-medium sm:flex-none",
              tab === key ? "bg-surface text-foreground shadow-sm" : "text-subtle hover:text-foreground",
            )}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="min-w-0">
          {tab === "brand" ? (
            <>
              <CardHeader title="Diseño general" description="Se aplica a todos los correos." />
              <CardBody className="space-y-4">
                <FormField label="Nombre de la empresa" required hint="Aparece en el encabezado y en la variable {{empresa}}.">
                  <Input id="brand-name" value={config.brand.companyName} onChange={(e) => setBrand({ companyName: e.target.value })} maxLength={120} />
                </FormField>
                <div className="grid gap-4 sm:grid-cols-2">
                  <FormField label="Color de la marca" hint="Franja superior y nombre de la empresa.">
                    <div className="flex items-center gap-2">
                      <input
                        id="brand-color"
                        type="color"
                        value={config.brand.primaryColor}
                        onChange={(e) => setBrand({ primaryColor: e.target.value })}
                        className="h-11 w-14 rounded border border-border"
                        aria-label="Color de la marca"
                      />
                      <Input value={config.brand.primaryColor} onChange={(e) => setBrand({ primaryColor: e.target.value })} maxLength={7} aria-label="Código del color de la marca" />
                    </div>
                  </FormField>
                  <FormField label="Color del botón">
                    <div className="flex items-center gap-2">
                      <input
                        id="brand-accent"
                        type="color"
                        value={config.brand.accentColor}
                        onChange={(e) => setBrand({ accentColor: e.target.value })}
                        className="h-11 w-14 rounded border border-border"
                        aria-label="Color del botón"
                      />
                      <Input value={config.brand.accentColor} onChange={(e) => setBrand({ accentColor: e.target.value })} maxLength={7} aria-label="Código del color del botón" />
                    </div>
                  </FormField>
                </div>
                <FormField label="Logo (dirección https://)" hint="Imagen publicada en internet (por ejemplo la del sitio web de la empresa). Vacío = sin logo.">
                  <Input
                    id="brand-logo"
                    value={config.brand.logoUrl}
                    onChange={(e) => setBrand({ logoUrl: e.target.value })}
                    placeholder="https://www.miempresa.com/logo.png"
                    maxLength={500}
                  />
                </FormField>
                <FormField label="Pie de página (HTML)" hint="Texto legal, datos de contacto, etc.">
                  <Textarea id="brand-footer" rows={3} value={config.brand.footerHtml} onChange={(e) => setBrand({ footerHtml: e.target.value })} maxLength={2000} />
                </FormField>
              </CardBody>
            </>
          ) : (
            <>
              <CardHeader title={EMAIL_TEMPLATE_INFO[tab].label} description={EMAIL_TEMPLATE_INFO[tab].description} />
              <CardBody className="space-y-4">
                <FormField label="Asunto" required>
                  <Input id={`subject-${tab}`} value={config.templates[tab].subject} onChange={(e) => setTemplate(tab, { subject: e.target.value })} maxLength={200} />
                </FormField>
                <FormField label="Contenido (HTML)" required hint="Puedes usar etiquetas como <p>, <strong>, <br>, <ul><li>, <a href> y estilos en línea.">
                  <Textarea
                    ref={bodyRef}
                    id={`body-${tab}`}
                    rows={10}
                    value={config.templates[tab].bodyHtml}
                    onChange={(e) => setTemplate(tab, { bodyHtml: e.target.value })}
                    className="font-mono text-xs"
                    spellCheck={false}
                  />
                </FormField>
                <div>
                  <p className="mb-1.5 text-sm font-medium">Variables (clic para insertar)</p>
                  <div className="flex flex-wrap gap-1.5">
                    {EMAIL_TEMPLATE_INFO[tab].variables.map((v) => (
                      <button
                        key={v}
                        type="button"
                        onClick={() => insertVariable(tab, v)}
                        title={VARIABLE_HELP[v]}
                        className="rounded-full border border-border bg-surface-muted px-2.5 py-1 font-mono text-xs hover:border-primary hover:text-primary"
                      >
                        {`{{${v}}}`}
                      </button>
                    ))}
                  </div>
                  <p className="mt-1.5 text-xs text-subtle">
                    {EMAIL_TEMPLATE_INFO[tab].variables.map((v) => `{{${v}}} = ${VARIABLE_HELP[v]}`).join(" · ")}
                  </p>
                </div>
                <FormField label="Texto del botón" required hint="El botón lleva al enlace del aviso ({{enlace}}).">
                  <Input id={`button-${tab}`} value={config.templates[tab].buttonLabel} onChange={(e) => setTemplate(tab, { buttonLabel: e.target.value })} maxLength={60} />
                </FormField>
              </CardBody>
            </>
          )}
        </Card>

        <Card className="min-w-0">
          <CardHeader title="Vista previa" description={`Asunto: ${preview.subject}`} />
          <CardBody>
            <iframe
              title="Vista previa del correo"
              sandbox=""
              srcDoc={preview.html}
              className="h-[560px] w-full rounded-lg border border-border bg-white"
            />
            <p className="mt-2 text-xs text-subtle">Con datos de ejemplo. Al enviarse, las variables toman los datos reales de cada aviso.</p>
          </CardBody>
        </Card>
      </div>

      {!validation.success && (
        <p role="alert" className="text-sm text-danger">
          {validation.error.issues[0]?.message}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <Button onClick={save} loading={saving} disabled={!validation.success || !dirty}>
          <Save className="h-4 w-4" aria-hidden /> Guardar
        </Button>
        <Button variant="outline" onClick={sendTest} loading={testing} disabled={!validation.success}>
          <Send className="h-4 w-4" aria-hidden /> Enviarme una prueba de «{EMAIL_TEMPLATE_INFO[previewKey].label}»
        </Button>
        <ConfirmButton
          action={resetEmailTemplatesAction}
          title="Restaurar plantillas predeterminadas"
          description="Se perderán los cambios de diseño y de todas las plantillas."
          confirmLabel="Restaurar"
          variant="ghost"
        >
          <RotateCcw className="h-4 w-4" aria-hidden /> Restaurar predeterminadas
        </ConfirmButton>
      </div>
    </div>
  );
}

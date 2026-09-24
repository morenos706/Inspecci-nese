"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { CheckCircle2, Download, FileSpreadsheet, Upload } from "lucide-react";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";

interface RowIssue {
  row: number;
  code: string;
  action: "create" | "update" | "error";
  errors: string[];
  warnings: string[];
}
interface Section {
  key: string;
  title: string;
  rows: RowIssue[];
}
interface Summary {
  create: number;
  update: number;
  errors: number;
  rows: number;
}
interface Preview {
  sections: Section[];
  summary: Summary;
}

const count = (rows: RowIssue[], action: RowIssue["action"]) => rows.filter((r) => r.action === action).length;

const ACTION = {
  create: { label: "Crear", tone: "success" as const },
  update: { label: "Actualizar", tone: "info" as const },
  error: { label: "Error", tone: "danger" as const },
};

function IssueTable({ title, rows }: { title: string; rows: RowIssue[] }) {
  if (rows.length === 0) return null;
  const sorted = [...rows].sort((a, b) => Number(b.action === "error") - Number(a.action === "error") || a.row - b.row);
  return (
    <div>
      <h3 className="mb-2 text-sm font-semibold">
        Hoja «{title}» · {rows.length} fila(s)
      </h3>
      <div className="max-h-96 overflow-auto rounded-lg border border-border">
        <table className="w-full text-left text-sm">
          <caption className="sr-only">Resultado de la hoja {title}</caption>
          <thead className="sticky top-0 bg-surface-muted text-xs uppercase text-subtle">
            <tr>
              <th scope="col" className="px-3 py-2">Fila</th>
              <th scope="col" className="px-3 py-2">Código</th>
              <th scope="col" className="px-3 py-2">Resultado</th>
              <th scope="col" className="px-3 py-2">Detalle</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {sorted.slice(0, 500).map((r) => (
              <tr key={r.row} className={r.action === "error" ? "bg-danger-soft/40" : undefined}>
                <td className="px-3 py-2 tabular-nums">{r.row}</td>
                <td className="px-3 py-2 font-medium">{r.code || "—"}</td>
                <td className="px-3 py-2">
                  <Badge tone={ACTION[r.action].tone}>{ACTION[r.action].label}</Badge>
                </td>
                <td className="px-3 py-2 text-xs">
                  {r.errors.map((e) => (
                    <p key={e} className="text-danger">
                      {e}
                    </p>
                  ))}
                  {r.warnings.map((w) => (
                    <p key={w} className="text-warning">
                      {w}
                    </p>
                  ))}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function ImportWizard() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [done, setDone] = useState<Section[] | null>(null);
  const [busy, setBusy] = useState<"preview" | "apply" | null>(null);

  async function send(mode: "preview" | "apply", f: File) {
    setBusy(mode);
    try {
      const form = new FormData();
      form.set("file", f);
      form.set("mode", mode);
      const res = await fetch("/api/import", { method: "POST", body: form });
      const data = await res.json().catch(() => ({ ok: false, message: "Respuesta inválida del servidor" }));
      if (!res.ok || !data.ok) throw new Error(data.message ?? "No se pudo procesar el archivo");
      if (mode === "preview") setPreview(data.preview);
      else {
        setDone(preview?.sections ?? []);
        toast.success("Carga masiva completada");
      }
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setBusy(null);
    }
  }

  if (done) {
    return (
      <Card>
        <CardBody className="flex flex-col items-center gap-3 py-10 text-center">
          <CheckCircle2 className="h-12 w-12 text-success" aria-hidden />
          <p className="text-lg font-semibold">Carga completada</p>
          <ul className="text-sm text-muted">
            {done.map((sec) => (
              <li key={sec.key}>
                {sec.title}: {count(sec.rows, "create")} nuevos, {count(sec.rows, "update")} actualizados
              </li>
            ))}
          </ul>
          <div className="flex gap-2">
            <Link href="/inventory" className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white">
              Ver inventario
            </Link>
            <Button
              variant="outline"
              onClick={() => {
                setDone(null);
                setPreview(null);
                setFile(null);
              }}
            >
              Cargar otro archivo
            </Button>
          </div>
        </CardBody>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader
          title="1. Descarga la plantilla"
          description="Incluye instrucciones, listas desplegables y hojas para sedes, procesos, tipos de equipo con sus preguntas, zonas e inventario."
        />
        <CardBody>
          <a href="/api/import/template" className="inline-flex h-11 items-center gap-2 rounded-lg bg-primary-soft px-4 text-sm font-medium text-primary hover:bg-blue-200">
            <Download className="h-4 w-4" aria-hidden /> Descargar plantilla Excel
          </a>
          <p className="mt-2 text-xs text-subtle">
            Llena solo las hojas que necesites: un solo archivo puede crear sedes, procesos, tipos de equipo con su cuestionario de
            inspección, zonas y el inventario. Los responsables deben existir como usuarios.
          </p>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="2. Sube el archivo y revisa" description="Primero se valida cada fila; no se guarda nada hasta que confirmes." />
        <CardBody className="space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <Button variant="outline" onClick={() => inputRef.current?.click()}>
              <FileSpreadsheet className="h-4 w-4" aria-hidden /> {file ? "Cambiar archivo" : "Elegir archivo .xlsx"}
            </Button>
            {file && <span className="text-sm text-muted">{file.name}</span>}
            <input
              ref={inputRef}
              type="file"
              accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0] ?? null;
                setFile(f);
                setPreview(null);
                if (f) void send("preview", f);
                e.target.value = "";
              }}
            />
          </div>
          {busy === "preview" && <p className="text-sm text-subtle">Validando…</p>}

          {preview && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {preview.sections.map((sec) => (
                  <div key={sec.key} className="rounded-lg border border-border p-3">
                    <p className="text-2xl font-semibold tabular-nums">{sec.rows.length}</p>
                    <p className="text-xs text-subtle">
                      {sec.title}: {count(sec.rows, "create")} nuevos · {count(sec.rows, "update")} a actualizar
                    </p>
                  </div>
                ))}
                <div className="rounded-lg border border-border p-3">
                  <p className={`text-2xl font-semibold tabular-nums ${preview.summary.errors > 0 ? "text-danger" : ""}`}>{preview.summary.errors}</p>
                  <p className="text-xs text-subtle">Filas con error</p>
                </div>
              </div>
              {preview.summary.errors > 0 ? (
                <Alert tone="danger" title="Corrige las filas con error y vuelve a subir el archivo">
                  Se muestran primero las filas con error, con el número de fila de Excel.
                </Alert>
              ) : (
                <Alert tone="success" title="Todo listo para importar" />
              )}
              {preview.sections.map((sec) => (
                <IssueTable key={sec.key} title={sec.title} rows={sec.rows} />
              ))}
            </div>
          )}
        </CardBody>
      </Card>

      {preview && preview.summary.errors === 0 && file && (
        <Card>
          <CardHeader title="3. Importar" description="Crea o actualiza todo en una sola operación (si algo falla, no se guarda nada)." />
          <CardBody>
            <Button size="lg" loading={busy === "apply"} onClick={() => void send("apply", file)}>
              <Upload className="h-4 w-4" aria-hidden /> Importar {preview.summary.rows} fila(s)
            </Button>
          </CardBody>
        </Card>
      )}
    </div>
  );
}

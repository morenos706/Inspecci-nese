"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Camera, FileText, ImagePlus, Loader2, X } from "lucide-react";
import { compressImage } from "@/lib/image-compress";
import { deleteEvidenceAction } from "@/server/actions/action-plans.actions";

export interface EvidenceThumb {
  id: string;
  fileName: string;
  mimeType?: string;
}

type Target =
  | { kind: "answer"; inspectionId: string; questionId: string }
  | { kind: "finding"; findingId: string }
  | { kind: "actionPlan"; actionPlanId: string };

/**
 * Evidencias: en el celular "Tomar foto" abre la cámara trasera y
 * "Galería" permite elegir existentes (y PDF si `allowDocuments`).
 * Las fotos se comprimen antes de subir.
 */
export function PhotoUploader({
  target,
  photos,
  label = "Fotografías",
  allowDocuments = false,
  readOnly = false,
  onUploaded,
}: {
  target: Target;
  photos: EvidenceThumb[];
  label?: string;
  allowDocuments?: boolean;
  readOnly?: boolean;
  onUploaded?: () => void;
}) {
  const cameraRef = useRef<HTMLInputElement>(null);
  const galleryRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(0);
  const [removing, setRemoving] = useState<string | null>(null);
  const router = useRouter();

  async function upload(files: FileList | null) {
    if (!files?.length) return;
    const list = Array.from(files);
    setUploading((n) => n + list.length);
    for (const file of list) {
      try {
        const isPdf = file.type === "application/pdf";
        const form = new FormData();
        if (isPdf) {
          form.set("file", file, file.name);
        } else {
          const blob = await compressImage(file);
          form.set("file", blob, file.name.replace(/\.[^.]+$/, "") + ".jpg");
        }
        for (const [k, v] of Object.entries(target)) form.set(k, v);
        const res = await fetch("/api/evidences", { method: "POST", body: form });
        const data = (await res.json().catch(() => ({}))) as { ok?: boolean; message?: string };
        if (!res.ok || !data.ok) throw new Error(data.message ?? "No se pudo subir la foto");
        toast.success(isPdf ? "Documento agregado" : "Foto agregada");
      } catch (error) {
        toast.error(navigator.onLine ? (error as Error).message : "Sin conexión: la foto no se pudo subir");
      } finally {
        setUploading((n) => n - 1);
      }
    }
    onUploaded?.();
    router.refresh();
  }

  async function remove(id: string) {
    setRemoving(id);
    const result = await deleteEvidenceAction(id);
    setRemoving(null);
    if (!result.ok) toast.error(result.message ?? "No se pudo eliminar");
    router.refresh();
  }

  return (
    <div>
      <p className="mb-2 text-sm font-medium text-foreground">{label}</p>
      <div className="flex flex-wrap gap-2">
        {photos.map((p) => (
          <div key={p.id} className="relative h-20 w-20 overflow-hidden rounded-lg border border-border bg-surface-muted">
            {p.mimeType === "application/pdf" ? (
              <a
                href={`/api/evidences/${p.id}`}
                className="flex h-full w-full flex-col items-center justify-center gap-1 p-1 text-center text-[10px] text-muted"
              >
                <FileText className="h-6 w-6 text-danger" aria-hidden />
                <span className="line-clamp-2 break-all">{p.fileName}</span>
              </a>
            ) : (
              <a href={`/api/evidences/${p.id}`} target="_blank" rel="noopener">
                {/* eslint-disable-next-line @next/next/no-img-element -- archivo privado servido por la app con control de acceso */}
                <img src={`/api/evidences/${p.id}`} alt={p.fileName} className="h-full w-full object-cover" loading="lazy" />
              </a>
            )}
            {!readOnly && (
              <button
                type="button"
                onClick={() => remove(p.id)}
                disabled={removing === p.id}
                className="absolute right-0.5 top-0.5 flex h-7 w-7 items-center justify-center rounded-full bg-slate-900/70 text-white"
                aria-label={`Quitar ${p.fileName}`}
              >
                {removing === p.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <X className="h-4 w-4" />}
              </button>
            )}
          </div>
        ))}
        {Array.from({ length: uploading }).map((_, i) => (
          <div key={`up-${i}`} className="flex h-20 w-20 items-center justify-center rounded-lg border border-dashed border-border-strong">
            <Loader2 className="h-5 w-5 animate-spin text-subtle" aria-label="Subiendo foto" />
          </div>
        ))}
      </div>
      {!readOnly && (
        <div className="mt-2 grid grid-cols-2 gap-2 sm:flex">
          <button
            type="button"
            onClick={() => cameraRef.current?.click()}
            className="flex h-12 items-center justify-center gap-2 rounded-lg border border-border-strong bg-surface px-4 text-sm font-medium hover:bg-surface-muted"
          >
            <Camera className="h-5 w-5" aria-hidden /> Tomar foto
          </button>
          <button
            type="button"
            onClick={() => galleryRef.current?.click()}
            className="flex h-12 items-center justify-center gap-2 rounded-lg border border-border-strong bg-surface px-4 text-sm font-medium hover:bg-surface-muted"
          >
            <ImagePlus className="h-5 w-5" aria-hidden /> {allowDocuments ? "Galería / PDF" : "Galería"}
          </button>
        </div>
      )}
      <input
        ref={cameraRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => {
          void upload(e.target.files);
          e.target.value = "";
        }}
      />
      <input
        ref={galleryRef}
        type="file"
        accept={allowDocuments ? "image/jpeg,image/png,image/webp,image/*,application/pdf" : "image/jpeg,image/png,image/webp,image/*"}
        multiple
        className="hidden"
        onChange={(e) => {
          void upload(e.target.files);
          e.target.value = "";
        }}
      />
    </div>
  );
}

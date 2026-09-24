"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Camera, Loader2 } from "lucide-react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

// Lector nativo (Chrome/Android). En iPhone no existe: se decodifica con jsQR sobre un canvas.
interface BarcodeDetectorLike {
  detect(source: HTMLVideoElement): Promise<{ rawValue: string }[]>;
}
declare global {
  interface Window {
    BarcodeDetector?: new (options: { formats: string[] }) => BarcodeDetectorLike;
  }
}

/** Solo se aceptan QR del propio sistema (misma dirección, ruta /q/…). */
function internalPath(raw: string): string | null {
  try {
    const url = new URL(raw, window.location.origin);
    if (url.origin !== window.location.origin) return null;
    return /^\/q\/[A-Za-z0-9_-]{10,64}$/.test(url.pathname) ? url.pathname : null;
  } catch {
    return null;
  }
}

/**
 * Escáner de QR dentro de la app: abre la cámara trasera, detecta la
 * etiqueta y abre la ficha del elemento con "Realizar inspección".
 */
export function QrScanner() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [state, setState] = useState<"idle" | "starting" | "scanning" | "found" | "denied" | "unsupported" | "foreign">("idle");
  const router = useRouter();

  function stop() {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }
  useEffect(() => stop, []);

  async function start() {
    if (!navigator.mediaDevices?.getUserMedia) {
      setState("unsupported");
      return;
    }
    setState("starting");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      });
      streamRef.current = stream;
      const video = videoRef.current!;
      video.srcObject = stream;
      await video.play();
      setState("scanning");

      const native = window.BarcodeDetector ? new window.BarcodeDetector({ formats: ["qr_code"] }) : null;
      const jsQR = native ? null : (await import("jsqr")).default;
      canvasRef.current ??= document.createElement("canvas");
      const canvas = canvasRef.current;
      const ctx = canvas.getContext("2d", { willReadFrequently: true });

      const read = async (): Promise<string | null> => {
        if (native) {
          const codes = await native.detect(video);
          return codes[0]?.rawValue ?? null;
        }
        if (!ctx || !jsQR || video.videoWidth === 0) return null;
        // Se reduce el cuadro para decodificar rápido en celulares modestos.
        const scale = Math.min(1, 640 / video.videoWidth);
        canvas.width = Math.round(video.videoWidth * scale);
        canvas.height = Math.round(video.videoHeight * scale);
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const image = ctx.getImageData(0, 0, canvas.width, canvas.height);
        return jsQR(image.data, image.width, image.height, { inversionAttempts: "dontInvert" })?.data ?? null;
      };

      const loop = async () => {
        if (!streamRef.current) return;
        try {
          const raw = await read();
          if (raw) {
            const path = internalPath(raw);
            if (path) {
              setState("found");
              navigator.vibrate?.(80);
              stop();
              router.push(path);
              return;
            }
            setState("foreign");
          }
        } catch {
          /* cuadro no disponible todavía */
        }
        setTimeout(() => void loop(), native ? 120 : 200);
      };
      void loop();
    } catch {
      stop();
      setState("denied");
    }
  }

  return (
    <div className="space-y-3">
      <div className="relative aspect-square overflow-hidden rounded-xl bg-slate-900">
        <video ref={videoRef} className="h-full w-full object-cover" playsInline muted aria-label="Vista de la cámara" />
        {(state === "scanning" || state === "foreign") && (
          <div className="pointer-events-none absolute inset-10 rounded-2xl border-4 border-white/80 shadow-[0_0_0_9999px_rgba(15,23,42,0.35)]" aria-hidden />
        )}
        {(state === "idle" || state === "denied" || state === "unsupported") && (
          <div className="absolute inset-0 flex items-center justify-center p-6">
            <Button size="lg" onClick={() => void start()}>
              <Camera className="h-5 w-5" aria-hidden /> Activar cámara
            </Button>
          </div>
        )}
        {(state === "starting" || state === "found") && (
          <div className="absolute inset-0 flex items-center justify-center text-white">
            <Loader2 className="h-8 w-8 animate-spin" aria-label={state === "found" ? "Abriendo elemento" : "Iniciando cámara"} />
          </div>
        )}
      </div>
      <p className="text-center text-sm text-subtle" aria-live="polite">
        {state === "scanning" && "Centra la etiqueta QR dentro del recuadro."}
        {state === "found" && "Código leído. Abriendo el elemento…"}
      </p>
      {state === "denied" && (
        <Alert tone="warning" title="No se pudo usar la cámara">
          Permite el acceso a la cámara para este sitio (en iPhone: Ajustes → Safari → Cámara) y vuelve a intentarlo.
        </Alert>
      )}
      {state === "unsupported" && <Alert tone="warning">Este navegador no permite usar la cámara. Escribe el código del elemento abajo.</Alert>}
      {state === "foreign" && <Alert tone="warning">Ese código QR no pertenece a este sistema. Sigue apuntando a una etiqueta del sistema.</Alert>}
    </div>
  );
}

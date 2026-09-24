import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV !== "production";

// Orígenes externos permitidos para imágenes/archivos (almacenamiento S3-compatible).
const storageOrigin = (() => {
  try {
    return process.env.S3_PUBLIC_ORIGIN ?? (process.env.S3_ENDPOINT ? new URL(process.env.S3_ENDPOINT).origin : "");
  } catch {
    return "";
  }
})();

/**
 * Content Security Policy. 'unsafe-inline' en scripts es necesario para los
 * scripts de hidratación de Next sin nonces; el resto de directivas limita
 * orígenes externos, frames y envío de formularios.
 */
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  `img-src 'self' data: blob: ${storageOrigin}`.trim(),
  "font-src 'self' data:",
  `connect-src 'self' ${storageOrigin}${isDev ? " ws:" : ""}`.trim(),
  "media-src 'self' blob:",
  "worker-src 'self' blob:",
  "manifest-src 'self'",
  "frame-ancestors 'none'",
  "form-action 'self'",
  "base-uri 'self'",
  "object-src 'none'",
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // La cámara se usa para fotografías de inspección (solo mismo origen).
  { key: "Permissions-Policy", value: "camera=(self), microphone=(), geolocation=(self)" },
  ...(isDev ? [] : [{ key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" }]),
];

const nextConfig: NextConfig = {
  output: "standalone",
  poweredByHeader: false,
  experimental: {
    serverActions: {
      // Límite del cuerpo de Server Actions (las fotos se suben directo al bucket con URL firmada).
      bodySizeLimit: "2mb",
    },
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;

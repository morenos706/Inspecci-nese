import type { MetadataRoute } from "next";

// Web App Manifest: permite instalar la app en el celular (PWA).
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Inspecciones de Emergencia",
    short_name: "Inspecciones",
    description: "Inspección de extintores, botiquines y elementos de emergencia",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#f1f5f9",
    theme_color: "#b91c1c",
    lang: "es-CO",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}

import type { MetadataRoute } from "next";
import { BRAND_GREEN } from "@/lib/app_icon";

// Web app manifest: lets the platform be installed as an app (Chrome / Edge: "Install").
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "Som Llar - Justificacions",
    short_name: "Justificacions",
    description: "Gestió, control i imputació de justificacions de subvencions i licitacions de Som Llar.",
    lang: "ca",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#f8fafc",
    theme_color: BRAND_GREEN,
    icons: [
      { src: "/pwa-icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/pwa-icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/pwa-icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}

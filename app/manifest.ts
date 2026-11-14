import type { MetadataRoute } from "next";

/** Web app manifest: lets people install VEIL AI to their home screen. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "VEIL AI — Confidential financial intelligence",
    short_name: "VEIL AI",
    description: "Private AI analysis of your NEAR portfolio, verified inside hardware enclaves, with a wallet you control.",
    start_url: "/dashboard",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#6F9386",
    theme_color: "#6F9386",
    categories: ["finance", "productivity"],
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "Wallet", url: "/dashboard/wallet", icons: [{ src: "/icon-192.png", sizes: "192x192" }] },
      { name: "AI Analyst", url: "/dashboard/analyst", icons: [{ src: "/icon-192.png", sizes: "192x192" }] },
    ],
  };
}

import type { MetadataRoute } from "next";

/** Web app manifest: lets phones and desktops install FocusLog like an app (no app store). */
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "FocusLog",
    short_name: "FocusLog",
    description: "Track your day honestly — every focus block, break and distraction.",
    start_url: "/dashboard",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#F4F6F3",
    theme_color: "#2D5F4F",
    categories: ["productivity", "education"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    // Long-press the app icon on Android to jump straight in.
    shortcuts: [
      { name: "Timer", short_name: "Timer", url: "/timer", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
      { name: "Analytics", short_name: "Analytics", url: "/analytics", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
    ],
  };
}

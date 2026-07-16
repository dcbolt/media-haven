import type { MetadataRoute } from "next";

/** PWA manifest: guests add the portal to their home screen from the QR —
 *  no app-store download barrier (the whole point vs a native app). */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "The Florida Havens",
    short_name: "Fla Havens",
    description: "Your stay, your beach, your screen — guest portal",
    start_url: "/welcome",
    display: "standalone",
    background_color: "#fbf7f0",
    theme_color: "#2e7d9a",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      {
        src: "/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
    ],
  };
}

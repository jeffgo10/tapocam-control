import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Tapo cameras",
    short_name: "Tapo",
    description: "Local WebRTC and PTZ controller for TP-Link Tapo cameras.",
    start_url: "/",
    display: "standalone",
    background_color: "#101418",
    theme_color: "#101418",
    icons: [
      {
        src: "/icon-192.png",
        sizes: "192x192",
        type: "image/png",
      },
      {
        src: "/icon-512.png",
        sizes: "512x512",
        type: "image/png",
      },
    ],
  };
}

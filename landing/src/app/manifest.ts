import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Renewly",
    short_name: "Renewly",
    description: "Never miss a license renewal.",
    start_url: "/",
    display: "standalone",
    background_color: "#f4f7fc",
    theme_color: "#1d4ed8",
    icons: [
      { src: "/brand/renewly-mark-192.png", sizes: "192x192", type: "image/png" },
      { src: "/brand/renewly-mark-512.png", sizes: "512x512", type: "image/png" },
      { src: "/brand/renewly-mark.svg", sizes: "any", type: "image/svg+xml" },
    ],
  };
}

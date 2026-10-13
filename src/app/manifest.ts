import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Goodwhilly",
    short_name: "Goodwhilly",
    description:
      "Track sealed product and bulk inventory, scan barcodes, view eBay listings, and generate random value bundles.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#f1f5f9",
    theme_color: "#1d4ed8",
    categories: ["business", "productivity"],
    icons: [
      {
        src: "/icons/goodwhilly-circle-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/goodwhilly-circle-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/goodwhilly-square-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "maskable",
      },
      {
        src: "/icons/goodwhilly-square-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
      {
        src: "/goodwhilly-gwh-icon-v1.svg",
        sizes: "any",
        type: "image/svg+xml",
        purpose: "any",
      },
    ],
  };
}

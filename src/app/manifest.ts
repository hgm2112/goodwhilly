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
    background_color: "#1d4ed8",
    theme_color: "#0080ff",
    categories: ["business", "productivity"],
    icons: [
      {
        src: "/icons/goodwhilly-v4-icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/goodwhilly-v4-icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/goodwhilly-v4-maskable-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "maskable",
      },
      {
        src: "/icons/goodwhilly-v4-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}

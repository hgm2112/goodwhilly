import type { Metadata, Viewport } from "next";
import "./globals.css";
import { ServiceWorkerRegister } from "@/components/ServiceWorkerRegister";

const APP_URL = process.env.APP_URL?.trim() || "https://goodwhilly.vercel.app";

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#1d4ed8",
  colorScheme: "light dark",
};

export const metadata: Metadata = {
  metadataBase: new URL(APP_URL),
  title: "goodwhilly — eBay inventory & bundles",
  description:
    "Track MTG sealed product and bulk inventory, scan barcodes, view your eBay listings, and generate random value bundles.",
  icons: {
    icon: [
      { url: "/icons/goodwhilly-icon-circle-16.png", sizes: "16x16", type: "image/png" },
      { url: "/icons/goodwhilly-icon-circle-32.png", sizes: "32x32", type: "image/png" },
      { url: "/icons/goodwhilly-icon-circle-48.png", sizes: "48x48", type: "image/png" },
    ],
    apple: "/icons/goodwhilly-mobile-circle-180.png",
  },
  appleWebApp: {
    capable: true,
    title: "Goodwhilly",
    statusBarStyle: "default",
  },
};

/**
 * Applies the persisted theme before first paint so the page never flashes
 * light-then-dark (or vice versa). Falls back to the OS preference when the
 * user has never picked; ThemeToggle keeps localStorage("gw_theme") in sync.
 */
const THEME_INIT = `(function(){try{var t=localStorage.getItem("gw_theme");var d=t?t==="dark":window.matchMedia("(prefers-color-scheme: dark)").matches;if(d)document.documentElement.classList.add("dark");}catch(e){}})();`;

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT }} />
      </head>
      <body className="min-h-dvh bg-slate-100 text-slate-900 antialiased dark:bg-slate-950 dark:text-slate-100">
        <ServiceWorkerRegister />
        {children}
      </body>
    </html>
  );
}

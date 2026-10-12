import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "goodwhilly — eBay inventory & bundles",
  description:
    "Track MTG sealed product and bulk inventory, scan barcodes, view your eBay listings, and generate random value bundles.",
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
        {children}
      </body>
    </html>
  );
}

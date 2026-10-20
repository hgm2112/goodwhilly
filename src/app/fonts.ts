import localFont from "next/font/local";

/**
 * Acephimere — the app-wide typeface.
 *
 * The shipped files are subsets of the original Acephimere faces, converted
 * to WOFF2 and limited to the character set the app can render (see
 * `scripts/font-charset.txt`). Rebuild them with
 * `scripts/build-fonts.sh acephimere`.
 *
 * Only the uprights are shipped — the app has no `italic` utility, so the
 * italic faces are not part of this family and italic text falls back to the
 * system font.
 *
 * Acephimere ships only three weights (Thin 100, Regular 400, Bold 700), so
 * Tailwind's scale is remapped in `globals.css`: everything from `font-medium`
 * up lands on Bold. Every `font-*` utility still renders a real face — none
 * are synthesised by the browser.
 *
 * Acephimere covers Δ, ±, ×, ÷, –, —, •, … and the math signs, but it has no
 * ↑ ↓ ← ⇅ or the ★/👁 symbols — those fall through to the system/emoji fonts
 * via the `--font-sans` fallback stack (the inventory sort arrows, the
 * dashboard trend chips, "← Back to bundles", the listings chips).
 */
export const acephimere = localFont({
  src: [
    { path: "../fonts/Acephimere-Thin.woff2", weight: "100", style: "normal" },
    { path: "../fonts/Acephimere-Regular.woff2", weight: "400", style: "normal" },
    { path: "../fonts/Acephimere-Bold.woff2", weight: "700", style: "normal" },
  ],
  variable: "--font-acephimere",
  display: "swap",
  // Every weight is a separate file — preloading all three would pull ~45 KB
  // on first paint. The browser fetches only the weights a page actually uses.
  preload: false,
  fallback: ["ui-sans-serif", "system-ui", "sans-serif"],
});

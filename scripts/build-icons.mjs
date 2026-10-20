#!/usr/bin/env node
/**
 * Regenerates the v4 app icons in `public/icons/` from the source mark
 * `public/goodwhilly-icon-v4.svg` (the striped ball — already circular,
 * transparent outside, so every PNG is a straight render of it).
 *
 * This is a one-off build step, so @resvg/resvg-js is NOT a repo dependency.
 * Install it on the fly:
 *   npm i --no-save @resvg/resvg-js
 *   node scripts/build-icons.mjs
 * or point RESVG_MODULE_PATH at an out-of-repo install:
 *   RESVG_MODULE_PATH=/tmp/opencode/node_modules node scripts/build-icons.mjs
 *
 * Outputs:
 *   goodwhilly-v4-icon-{16,32,48}.png    favicon fallbacks (transparent — the
 *                                         browser composites them on the tab bar)
 *   goodwhilly-v4-icon-180.png            apple-touch-icon (opaque brand blue)
 *   goodwhilly-v4-icon-{192,512}.png      PWA "any" (opaque brand blue)
 *   goodwhilly-v4-maskable-{192,512}.png PWA "maskable" (opaque brand blue, ball
 *                                         inset into the 80% safe zone)
 *
 * The install icons MUST be opaque: the mark itself is fully transparent
 * outside its orange stripes, and iOS/Android paint a transparent home-screen
 * icon on an opaque BLACK backing before masking it into a circle/squircle —
 * which renders as "orange stripes on a black disc" (the bug this fixes).
 * Browser favicons stay transparent on purpose.
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { execSync } from "node:child_process";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SRC = join(ROOT, "public/goodwhilly-icon-v4.svg");
const OUT = join(ROOT, "public/icons");
const PREFIX = "goodwhilly-v4";

/** Resolve @resvg/resvg-js from the repo, then the global npm root, then $RESVG_MODULE_PATH. */
function loadResvg() {
  const require = createRequire(import.meta.url);
  const searchPaths = [];
  if (process.env.RESVG_MODULE_PATH) {
    // Accept either a node_modules dir or the project dir that contains it.
    searchPaths.push(process.env.RESVG_MODULE_PATH.replace(/[/\\]node_modules[/\\]?$/, ""));
  }
  try {
    searchPaths.push(execSync("npm root -g").toString().trim());
  } catch {
    /* npm not on PATH — skip the global lookup */
  }
  for (const paths of [null, ...searchPaths]) {
    try {
      const resolved = paths
        ? require.resolve("@resvg/resvg-js", { paths: [paths] })
        : require.resolve("@resvg/resvg-js");
      return require(resolved);
    } catch {
      /* try the next location */
    }
  }
  return null;
}

const resvg = loadResvg();
if (!resvg) {
  console.error(
    "@resvg/resvg-js is not installed. Run:\n  npm i --no-save @resvg/resvg-js\nthen re-run this script.",
  );
  process.exit(1);
}
const { Resvg } = resvg;

const source = readFileSync(SRC, "utf8");
const inner = source.slice(source.indexOf(">", source.indexOf("<svg")) + 1, source.lastIndexOf("</svg>"));

// The mark's own coordinate box — read it from the file so a re-designed
// source with a different viewBox needs no script change.
const vbMatch = source.match(/viewBox="([^"]+)"/);
if (!vbMatch) throw new Error(`No viewBox in ${SRC}`);
const [vx, vy, vw, vh] = vbMatch[1].trim().split(/\s+/).map(Number);
if (vw !== vh) throw new Error(`Expected a square viewBox in ${SRC}, got ${vw}x${vh}`);

const SAFE_ZONE = 0.72; // maskable: keep the art inside the inner 80% circle
const ICON_BG = "#1d4ed8"; // install icons: opaque = the PWA theme/background color

/** Wrap the mark's paths in a square canvas, optionally scaled about the centre. */
function wrap(size, scale) {
  const cx = vw / 2;
  const cy = vh / 2;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${vw} ${vh}">
  <g transform="translate(${cx} ${cy}) scale(${scale}) translate(${-cx} ${-cy}) translate(${-vx} ${-vy})">${inner}</g>
</svg>`;
}

mkdirSync(OUT, { recursive: true });

function render(name, size, { scale = 1, background } = {}) {
  const opts = { fitTo: { mode: "width", value: size } };
  if (background) opts.background = background;
  const png = new Resvg(wrap(size, scale), opts).render().asPng();
  writeFileSync(join(OUT, name), png);
  console.log(`${name.padEnd(36)} ${size}x${size}  ${(png.length / 1024).toFixed(1)} KB`);
}

console.log(`source: ${SRC}\n`);
render(`${PREFIX}-icon-16.png`, 16);
render(`${PREFIX}-icon-32.png`, 32);
render(`${PREFIX}-icon-48.png`, 48);
render(`${PREFIX}-icon-180.png`, 180, { background: ICON_BG });
render(`${PREFIX}-icon-192.png`, 192, { background: ICON_BG });
render(`${PREFIX}-icon-512.png`, 512, { background: ICON_BG });
render(`${PREFIX}-maskable-192.png`, 192, { scale: SAFE_ZONE, background: ICON_BG });
render(`${PREFIX}-maskable-512.png`, 512, { scale: SAFE_ZONE, background: ICON_BG });

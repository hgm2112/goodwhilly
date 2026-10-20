#!/usr/bin/env bash
# Rebuild the shipped webfonts in src/fonts/ from the untracked originals in fonts/.
#
# The originals (fonts/*.otf, fonts/*.ttf) are NOT committed — they are the
# source of truth on this machine only. What ships is src/fonts/*.woff2:
# the same faces, subsetted to scripts/font-charset.txt and compressed to
# WOFF2.
#
# Two families live in src/fonts/:
#   Acephimere-* the app's typeface (3 upright faces) — see src/app/fonts.ts
#   Ashby-* / Geoform-* earlier typefaces, kept but unused (rebuildable here)
#
# Requires fontTools + brotli:
#   python3 -m pip install --user fonttools brotli
#   (or a venv: python3 -m venv --without-pip /tmp/fontvenv && \
#                /tmp/fontvenv/bin/python get-pip.py && \
#                /tmp/fontvenv/bin/python -m pip install fonttools brotli)
# Then run with that interpreter's bin on PATH, or set PYFT_SUBSET.
#
# Usage: scripts/build-fonts.sh [ashby|geoform|all]   (default: all)
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SRC="$ROOT/fonts"
OUT="$ROOT/src/fonts"
CHARSET="$ROOT/scripts/font-charset.txt"
TARGET="${1:-all}"

PYFT="${PYFT_SUBSET:-}"
if [ -z "$PYFT" ]; then
  if command -v pyftsubset >/dev/null 2>&1; then
    PYFT="pyftsubset"
  elif [ -x "/tmp/opencode/geoform-venv/bin/pyftsubset" ]; then
    PYFT="/tmp/opencode/geoform-venv/bin/pyftsubset"
  else
    echo "pyftsubset not found — install fontTools + brotli (see the header of this script)." >&2
    exit 1
  fi
fi

if [ ! -d "$SRC" ]; then
  echo "Missing source dir $SRC — restore the font originals there first." >&2
  exit 1
fi

mkdir -p "$OUT"

# subset <source file> <output name>
subset() {
  local src="$1" name="$2"
  [ -f "$src" ] || { echo "missing $src — skipping" >&2; return 0; }
  "$PYFT" "$src" \
    --output-file="$OUT/$name.woff2" \
    --flavor=woff2 \
    --unicodes-file="$CHARSET" \
    --layout-features='*' \
    --no-hinting \
    --name-IDs='*' \
    --notdef-outline
  printf '%-30s %6s KB\n' "$name.woff2" "$(( $(stat -c%s "$OUT/$name.woff2") / 1024 ))"
}

# ── Acephimere (the app's typeface) ─────────────────────────────────────────
# Only the uprights are shipped: the app has no `italic` utility, so the
# italic faces would be dead weight. Add them here if that ever changes.
build_acephimere() {
  echo "── Acephimere ──"
  subset "$SRC/Acephimere Thin.otf"  "Acephimere-Thin"
  subset "$SRC/Acephimere.otf"       "Acephimere-Regular"
  subset "$SRC/Acephimere Bold.otf"  "Acephimere-Bold"
}

# ── Ashby (earlier typeface, kept in src/fonts/ but unused) ────────────────
build_ashby() {
  echo "── Ashby ──"
  subset "$SRC/ASHBL___.ttf"   "Ashby-Light"
  subset "$SRC/ASHBW___.ttf"   "Ashby-Book"
  subset "$SRC/ASHBM___.ttf"   "Ashby-Medium"
  subset "$SRC/ASHBB___.ttf"   "Ashby-Bold"
  subset "$SRC/ASHBEB__.ttf"   "Ashby-ExtraBold"
  subset "$SRC/ASHBBL__.ttf"   "Ashby-Black"
}

# ── Geoform (previous typeface, kept in src/fonts/ but unused) ─────────────
build_geoform() {
  echo "── Geoform ──"
  subset "$SRC/Geoform-Thin.otf"         "Geoform-Thin"
  subset "$SRC/Geoform-ExtraLight.otf"   "Geoform-ExtraLight"
  subset "$SRC/Geoform-Light.otf"        "Geoform-Light"
  subset "$SRC/Geoform.otf"              "Geoform-Regular"
  subset "$SRC/Geoform-Medium.otf"       "Geoform-Medium"
  subset "$SRC/Geoform-Bold.otf"         "Geoform-Bold"
  subset "$SRC/Geoform-ExtraBold.otf"    "Geoform-ExtraBold"
  subset "$SRC/Geoform-Heavy.otf"        "Geoform-Heavy"
}

echo "subsetting with: $PYFT"
case "$TARGET" in
  acephimere) build_acephimere ;;
  ashby)  build_ashby ;;
  geoform) build_geoform ;;
  all)    build_acephimere; build_ashby; build_geoform ;;
  *) echo "usage: $0 [acephimere|ashby|geoform|all]" >&2; exit 1 ;;
esac

echo "total: $(( $(du -cb "$OUT"/*.woff2 | tail -1 | cut -f1) / 1024 )) KB in $OUT"

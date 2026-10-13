# SESSION.md — handoff for the next agent

Last session: 2026-10-12 (later 3: Adjust Stock dialog → target-quantity model `91f9117`; earlier same day: Adjust Stock dialog redesign `dacf685`, price/integer input digit-deletion fix `9d93b0b`, sealed price lookup for Bundle + individual pack subcategories); prior 2026-10-11 (new day; 2026-10-05, 2026-10-01,
2026-09-30, 2026-09-26, 2026-09-25 and 2026-09-24).
Repo: goodwhilly (Next.js 15 + Supabase inventory app
for an MTG/eBay reseller). Read `AGENTS.md` first for full operating context;
this file records where the previous session left off.

## What We Did (2026-10-12, later 3 — Adjust Stock dialog → target-quantity model — COMMITTED `91f9117`)

**Adjust Stock now edits the FINAL stock total** (user feedback on `dacf685`'s direction-segmented design) — only `src/components/InventoryClient.tsx`, +/−43 lines; typecheck + lint + probe 46/46 green.

- **Segmented Add Stock / Remove Stock removed entirely** (no replacement selector) — direction is now the sign of `delta = target − current`, sent as `reason: delta > 0 ? "add" : "remove"` (the original ledger mapping; `/api/inventory/adjust`, `item_movements` and all accounting untouched). The `adjustDir` state is gone.
- **Quantity defaults to the item's actual stock** (`setAdjustQty(item.quantity)` on open, init state `null`) — a 60-unit item opens showing `60`, not 3. The displayed number is the desired final total: 60 → no change, 59 → remove 1, 61 → add 1, 100 → add 40, 0 → remove all (server allows `newQuantity = 0`, only rejects `< 0`).
- **Validation** = `adjustQtyInvalid` (null / non-integer / `< 0`; 0 is VALID now) → inline red "Enter a whole number of 0 or more."; `adjustUnchanged` (`qty === adjusting.quantity`) → **Update Stock disabled, silent** (plus a belt-and-braces `if (delta === 0) return` since the server 400s zero deltas — never reachable via the disabled button). `adjustOverRemove` deleted: impossible by construction (target ≥ 0 ⇒ `newQuantity = qty ≥ 0`); the server 409 remains the cross-tab-race backstop via `adjustError`.
- Stepper unchanged from `dacf685`: big −/+ (− disabled at 0/empty, + does `(q ?? 0) + 1`, both busy-gated), editable `NumberInt min={0}` center (`inputMode="numeric"`, blur-empty → "0"), reset via the open handler (no post-success reset needed — next open overwrites). Cancel / **Update Stock** "Updating…" / blocked `onClose` / defensive json + try-catch-finally all preserved; caption "currently N units" kept as the current-vs-target reference.

Committed `91f9117`. Browser checklist (user's test list): open a 60-unit item → shows 60 + Update disabled; − to 59 saves −1 `remove`; + to 61 saves +1 `add`; type 100 → +40 `add`; type 0 → removes all 60; clear field → disabled + message (blur → "0"); Cancel = no POST; double-click = one POST; mobile keypad + dark mode.

## What We Did (2026-10-12, later 2 — Adjust Stock dialog redesign — COMMITTED `dacf685`)

**Adjust Stock dialog simplified** — only `src/components/InventoryClient.tsx`; typecheck + lint + `probe-number-inputs` (46/46, helpers unchanged) green. The old signed `NumberInt` ("positive = add, negative = remove", Apply, no busy state, errors only in the toast) became:

- **Add Stock / Remove Stock segmented pair** (BundleBuilder mode-button styling — selected = `border-blue-600 bg-blue-50 text-blue-700` + dark variants, `aria-pressed`, default Add). Direction no longer lives in the sign: `confirmAdjust` sends `delta = dir === "add" ? qty : -qty` and `reason = adjustDir` — byte-identical to the old sign mapping, so the API, `item_movements` reasons and ledger are untouched.
- **Centered `[−] [3] [+]` stepper**: big `btn btn-secondary px-4 py-3` buttons (− disabled at 0/empty; + does `(q ?? 0) + 1` so empty → 1; both disabled while busy) around an EDITABLE `NumberInt min={0}` (`w-24 text-center text-lg`, `inputMode="numeric"` — the text-draft input: digits delete correctly, empty allowed mid-edit, blur normalizes empty → "0", old value never resurrects). State resets to qty 3 + Add on open and after success.
- **Validation** = derived consts `adjustQtyInvalid` / `adjustOverRemove` / `adjustValidation`: Update Stock disabled + inline red message (`bg-red-50 dark:bg-red-950 text-red-700 dark:text-red-300`, ItemForm style) for qty null/0/non-integer ("Enter a quantity of 1 or more.") or remove > stock ("Only N in stock — can't remove M."). Server 409/network failures go to `adjustError` state in the same slot; only validation disables the button (retry after a server error stays possible).
- **Busy** = `adjustBusy` guards `confirmAdjust` (no duplicate POSTs), renders "Updating…", disables Cancel/stepper/submit; Modal `onClose` is blocked while busy. Defensive `res.json().catch(() => null)` + try/catch per repo convention. Success → close + `load()`; Cancel stays a plain no-fetch close.
- Dropped the signed-input label and the "deletable territory" hint; Apply → **Update Stock**; kept the name + "currently N units" caption.

Committed `dacf685`. Browser-verify: stepper floors (− disabled at 0), select-replace typing (25/100/500), clear → empty → blur → 0 + message, add/remove apply correct ± and movement reasons, over-remove blocked client-side, Cancel does no POST, double-click = one POST, dark mode + mobile keypad; then commit.

## What We Did (2026-10-12, later — price/integer input digit-deletion fix)

**Cannot delete digits in price fields — COMMITTED `9d93b0b`** — typecheck + lint + production build green (dev stopped for the build, restarted after); new `probe-number-inputs.ts` → **46/46 assertions**.

- Root cause: `NumberDollars` (`src/components/ui/Modal.tsx`) was fully
  controlled from the cents prop — `value` re-derived as
  `(cents / 100).toFixed(2)` on EVERY render, `onChange` re-parsed text →
  cents each keystroke. Backspace inside the decimals ("12.50" → "12.5" is
  still 1250 cents) left state unchanged, so the controlled input
  re-rendered `"12.50"` and **the deleted digit came back** — the field was
  permanently `N.NN`. Same mechanism swallowed `.`, dropped/rounded a 3rd
  decimal digit, jumped the caret, and stripped the mobile locale comma
  (→ 100× value jumps). Ruled out: remount/state-reset-from-props (ItemForm
  has no `useEffect`; `Modal` unmounts only on close; the inventory
  debounced refetch only touches the item list).
- Fix: each input keeps a raw **text draft** while focused (parse to
  cents/int per keystroke, `NN.NN` / integer format re-applied **on blur
  only**), so Backspace/Delete/select-all/caret behave like a normal text
  field and intermediates (`""`, `"."`, `"12."`, `"12.5"`, `"-"`) are valid.
  New pure helpers `src/lib/number-input.ts` (`sanitizeMoneyDraft` — single
  dot, comma = decimal only when no dot yet + ≤2-digit group, else it's a
  thousands sep; `parseMoneyCents` — exact integer math, half-up third
  decimal with carry, int4 clamp; `formatCents`; `sanitizeIntDraft` /
  `parseIntDraft` / `formatInt`). Prop sync via **echo check**: external
  changes (Info&price autofill, card pick, sale bundle prefill, eBay fill,
  prebuilt derived price) replace the draft; our own emissions never do
  (incl. `BundleBuilder`'s null→0 target-price coercion).
- **Same fix for integer fields** (user's scope pick): new `NumberInt`
  (unsigned `inputMode="numeric"`; `signed` omits inputMode so the `-` key
  is reachable on mobile; blur empty normalizes to `min`). Wired item-form
  Quantity (state `number | null`, save `Math.max(0, quantity ?? 0)`), sale
  Quantity (min 1, submit `Math.max(1, quantity ?? 1)`), and the adjust-stock
  delta (signed — the old `Number(...) || 0` wiped a typed minus, so
  negative adjustments were likely unenterable).
- **Problem 9 RESOLVED**: `PATCH /api/inventory/[id]` now accepts
  `quantity` (integer ≥ 0, else 400) and, when it differs, logs the delta
  as an `item_movements` row (reason `adjust`, note "Edit form") — the edit
  form's Quantity finally persists, and DELETE's "Set quantity to 0 first"
  is now reachable from the form. No migration (next remains `0013`).
- All `NumberDollars` consumers fixed with ZERO consumer-code changes:
  item Cost/Value, sale Gross/Fee/Shipping, bundle target + prebuilt price,
  Actual Listing Price / Shipping Fee.
- New `scripts/probe-number-inputs.ts` (46 assertions: draft sanitizing
  incl. locale comma + thousands sep, intermediates, exact rounding/carry,
  clamps, the old deletion chain). Docs: AGENTS.md (money-input draft rule
  under API conventions + PATCH quantity in the `quantity` gotcha).
- **Not browser-verified — see new Problem 19.**

The earlier 2026-10-12 sealed-price work (`ee8b720`) remains as below.

## What We Did (2026-10-12)

**Sealed price lookup improvements for subcategories — COMMITTED `ee8b720`** — typecheck + lint + production build green; new `probe-pricing-filters.ts` all green.

- Root cause for "Bundle" in subcategory (e.g. "Super Heroes Marvel Age: Gift Bundle" failing while "Play Booster Pack" and bare names succeeded): `nameHasVariant` (via `:`) + `keepClean` applying `VARIANT_MULTI_PATTERNS` (`/\bbundle\b/i`) for all variants, even when the sub *was* the legitimate "bundle" product descriptor. Titles containing "bundle" were dropped before `requiredTokens`/`titleMatches` could keep the good ones. GTIN/keyword paths were affected via `keepMatching`.

- Extended to better general method for MTG *individual pack* subcategories ("Play Booster Pack", "Hanger Booster", "Set Booster Pack" = one single pack):
  - `titleMatches` gained selective plural tolerance (pack/packs, box/boxes, booster/boosters, deck/decks; "hanger" kept singular-only).
  - New `isSinglePackVariant(name)`: triggers on variant containing `\bpack\b` **or** ("hanger" && "booster") — even without "pack" word in the sub-name (per clarification that Hanger Booster titles typically include "pack" but detection must succeed anyway). Exempts if the sub itself contains box-like terms.
  - New `PACK_UNIT_EXCLUSION_PATTERNS` (box(es)?, case, display, \d+ packs, booster box, ...) applied in `keepClean` *only* for such variants (symmetric to the bundle case).
  - QUANTITY_PATTERNS extended with common pack-multi forms.
  - `searchActive`/`matchingPool` + top docstring updated to mention pack-format variants alongside decks.
  - "Hanger Booster" now treated as pack-like.

- Added `scripts/probe-pricing-filters.ts` (new): pure regression tests using `keepMatching` + mock `BrowseEntry[]` for the exact user examples + counters (regular variant + bundle title still drops; box subs keep box titles; plural titles now match). All 12 assertions pass.

- Updated AGENTS.md (eBay pricing section) to document the new behavior, plural rules, Hanger Booster handling, and new probe.

- Working tree clean after `ee8b720`. (Follow-up to the Bundle sub fix request + "needs a better method" for pack subs.)

The prior 2026-10-11 work remains as below (browser verification for dashboard etc. still pending per Problem 18).

## Current Objective (prior session)

**App-wide dark mode + blue-700 primary + dashboard redesign + official
release artwork — DONE and COMMITTED (2026-10-11)** — typecheck + lint +
production build green (build ran with the dev server STOPPED); release
artwork verified live (probe 14/14 rows). Browser verification of the
whole redesign still pending (Problem 18). User decisions implemented:

1. **Full app-wide dark mode** — class-based (`dark` class on `<html>`,
   `@custom-variant dark (&:where(.dark, .dark *))` in globals.css,
   `color-scheme` per theme, no-flash inline script in `layout.tsx` reading
   `localStorage("gw_theme")` else `prefers-color-scheme`, and a
   `ThemeToggle` sun/moon button in the sticky Nav (sun shown in light
   mode, moon in dark; tooltips stay the action text). Every shared
   component class (`.input`, `.btn*`, `.card`, `.badge-*`, `.table-*`)
   plus ~19 page/client files gained `dark:` variants via a one-shot sweep
   script + manual ternary fixes (light indigo leftovers fixed by a
   second pass).
2. **Primary interaction color indigo → blue-700** across the whole app
   (`.btn-primary` light = blue-700 / dark = blue-600, focus rings, all
   indigo utilities swapped; `badge-indigo` renamed `badge-blue`).
3. **Dashboard redesigned to `dashboardpagetemplate.png`** — client
   `Greeting` (time-of-day + name + browser-timezone date), 4 metric
   cards (Inventory Value with trend chip + sparkline, eBay Listings,
   Bundles to finish, Net from sales — 30-day window), and a 3-column
   layout: Left = **Needs Attention** + **Inventory by Game** (SVG
   donut, legend % from the same slices) + **Inventory health** gradient
   card · Center = **Recently Added** (6 artwork tiles, lightbox thumbs,
   last-colon name split) + **Market Pulse** (value + trend, this-week
   delta, biggest gainer/dropper with item art, average item value) ·
   Right = **Upcoming Releases** (featured panel with the release's OWN
   official artwork + Scryfall fallback, see below) + **Recent Sales**
   (rows or an empty state that links to the 17 active listings). All
   figures come from existing DB rows — honesty rules live in
   `src/lib/dashboard-metrics.ts` (`portfolioTrend`
   reconstructs value(T) from price history × current qty, clips the
   window to available data, returns null under a 3-day span;
   `topMovers`, `attentionTasks`, `gameBreakdown`, `listingStats`,
   `inventoryTotals`). The old dashboard is fully replaced. Header logos:
   `public/goodwhilly-logo-v1.svg` (light) / `-v2.svg` (dark), toggled
   with `dark:hidden` / `hidden dark:block`, sized **`h-12`** (48px, the
   user's second bump from `h-10`).
4. **Official release artwork** (user follow-up, same day): every
   `UpcomingRelease` now carries `imageUrl` resolved WITH the 6h calendar
   fetch — MTG/Secret Lair from the infobox `|image =` file (same
   wikitext already fetched; one batched `prop=imageinfo` call →
   `files.mtg.wiki` thumbnails) and Pokémon from each product page's
   official gamespress `productLogo` (signed URL, verbatim, 6h per-URL
   cache) — **probe: 14/14 rows have images**. `page.tsx` priority =
   `featured.imageUrl` → `fetchReleaseArtwork` (Scryfall `art_crop`,
   MTG-only) → placeholder; the new client `ReleaseImage` handles
   `onError` → branded gradient placeholder; "Coming up" rows show 40px
   thumbs when an image exists. Nothing hardcoded, nothing invented,
   dates/categories/sorting unchanged, no DB table (rides the existing
   in-memory 6h cache).

Data snapshot driving the design (REST-verified 2026-10-11): 89 items ·
248 units · $9,566.46 · 11 unpriced · 8 zero-qty · 30 paused · 17 active
listings (0 missing photos, 2 created this week, `item_id` all null) · 6
bundles all `listed` (0 waiting) · **0 sales ever** · price history 183
rows / 78 items (2026-09-25 → 2026-10-09). Deliberately omitted: an
"items aren't listed" task (linkage is best-effort/null — would be a
lie), a listings progress bar (no target exists).

The Random/Pre-built builder work (committed `c65df80`, docs `009680d`)
is unchanged and still awaiting browser verification (Problem 17).

## What We Did (2026-10-11)

1. **Theme foundation** (`src/app/globals.css`): `@custom-variant dark`,
   `color-scheme: light` / `dark` on the root, dark variants threaded
   through `body` and every `.input`/`.btn*`/`.card`/`.badge-*`/`.table-*`
   component class; indigo → blue-700 (btn-primary light blue-700 /
   dark blue-600); `badge-indigo` → `badge-blue`.
2. **No-flash theme script** (`src/app/layout.tsx`): inline
   `THEME_INIT` in `<head>` — reads `localStorage("gw_theme")`, else
   `prefers-color-scheme`, sets the `dark` class + `color-scheme`
   before paint.
3. **ThemeToggle** (new `src/components/ThemeToggle.tsx`): sun/moon
   `IconBtn` toggling `.dark` on `<html>` and persisting the choice.
4. **Nav**: logo `<img>` pair (v1 light / v2 dark, files copied into
   `public/`), Dashboard tab now visible (`LINKS` unfiltered),
   ThemeToggle added, blue + dark utilities.
5. **Dark-mode sweep** across ~19 files (script + manual): dark variants
   on every bg/text/border/divider/input/table surface; the three
   interactive clients (`BundleBuilder`, `InventoryClient`, `ScanClient`,
   `SalesClient`, `PriceHistoryModal`) needed hand fixes for ternaries
   the script couldn't express; a second script fixed leftover light
   indigo tokens; residual-check script reports 0 real misses.
6. **Dashboard metrics lib** (`src/lib/dashboard-metrics.ts`, new):
   `portfolioTrend` (30d/7d window, cohort = items with a snapshot at the
   window start, value(T) = last-snapshot-before-T × current qty, window
   clips to the earliest snapshot → label "since Sep 25", null under 3
   days), `topMovers` (per-item first/30d snapshot vs current, pct ≠ 0),
   `gameBreakdown` (`gameOf` first word, "Uncategorized" fallback),
   `attentionTasks` (unpriced / bundles waiting / out of stock / missing
   photos / paused — non-zero only), `listingStats` (active, added this
   week, missing photos), `inventoryTotals`.
7. **Release artwork lib** (`src/lib/release-art.ts`, new):
   `fetchReleaseArtwork(name, game)` — MTG only, `findSetForProduct` →
   `searchCards("s:<code>")` → first `art_crop` (exact card-name search
   as fallback), negatives cached 6h, never throws; `image_uris` type
   gained `art_crop?`.
8. **Dashboard components** (new `src/components/dashboard/`):
   `DashboardCard` (icon + title + optional View-all shell), `Sparkline`
   (generic polyline), `Greeting` (client), `MetricCards` (4 linked
   cards, tints on Value/Bundles, trend chip + sparkline on Value),
   `NeedsAttention` (count-circle task rows → pages, empty state,
   "Reserved in bundles" list preserved, green active-listings row),
   `RecentlyAdded` (client; 6 tiles, ArtworkThumb lightbox, "needs
   price" amber), `UpcomingReleases` (featured panel + "Coming up" list
   + errors note), `InventoryByGame` (donut + legend), `MarketPulse`
   (2×2 subs + average row; empty states when history is thin),
   `RecentSales` (rows or empty state → View listings), `InventoryHealth`
   (blue gradient promo card with real counts).
9. **Dashboard page rewritten** (`src/app/(app)/page.tsx`): one
   `Promise.all` (items, bundles, listings, 30d-window sales limit 500,
   price history limit 5000, profile), `ebayTitlesForBundles` kept for
   the reserved list, display name = profile → user_metadata → email
   local-part; metrics row `grid-cols-2 xl:grid-cols-4`; 3-column
   `lg:grid-cols-3 items-start` (column wrappers = masonry-style, matches
   the template; no invented targets).
10. Verified: `npm run typecheck` ✅ · `npm run lint` ✅ ·
    `npm run build` ✅ (dev server stopped first).
11. **Official release artwork** (same day, user follow-up over the
    Scryfall-only pick): `UpcomingRelease.imageUrl` in
    `src/lib/releases.ts` — MTG/Secret Lair infobox `|image =` extracted
    from the wikitext already fetched, resolved by ONE batched
    `prop=imageinfo&iiurlwidth=640` call per 6h fill (the wiki's
    PageImages/REST extensions are NOT installed — probed); Pokémon
    per-set logos pulled from each upcoming product page's
    `<img class="productLogo">` on the gamespress press CDN (SIGNED
    `sky=` URLs — any param edit 403s, so used verbatim at served 240px;
    ≤ a dozen fetches once per 6h, 6h per-URL cache incl. negatives).
    `cleanImageUrl` (https-only, entity-unescape) guards both paths; both
    phases fail-soft. New client `src/components/dashboard/ReleaseImage.tsx`
    (img → `onError` → branded gradient placeholder, resets on src
    change); `UpcomingReleases.tsx` featured panel uses it and "Coming up"
    rows gained 40px thumbs when `imageUrl` exists; `page.tsx` featured
    art = `featured.imageUrl ?? fetchReleaseArtwork(...)`. Probe extended
    (`scripts/probe-releases.ts` prints image URLs) → **14/14 rows IMG,
    0 errors**. Docs updated in AGENTS.md (Release calendars +
    Dashboard sections).
12. **Logo + toggle polish**: header logo pair bumped to `h-12`
    (user's second size bump); `ThemeToggle.tsx:39` flipped so light
    mode shows ☀️ and dark mode shows 🌙 (tooltips kept as actions).
13. Committed + pushed: **`8f9a964`** (feature — 45 files, +2809/−382)
    + **`2776e5a`** (docs refresh).

**eBay draft copy buttons SHIPPED (2026-10-01)** — committed `aed2ccb`,
pushed — the expanded eBay listing draft editor's Title and Description
label rows each gained a right-aligned **copy icon button** (feather
clipboard glyph, `IconBtn`-styling) that copies the CURRENT on-screen
text (unsaved edits included) via `navigator.clipboard` and flashes
`Copied title` / `Copied description` through the existing toast; a failed
copy flashes "Couldn't copy — select the text manually". Collapsed card
unchanged (shows neither field nor button). Verified: typecheck + lint
green. **Not browser-verified yet.**

**Bundle contents editing SHIPPED (2026-09-30)** — committed `2954679`,
pushed — before a bundle is marked listed you can now **substitute /
re-quantity / add /**
remove** its contents from the bundle detail page. New routes
(`POST /api/bundles/[id]/items`, `PATCH|DELETE
/api/bundles/[id]/items/[bundleItemId]`) + shared
`src/lib/bundle-contents.ts` + a searchable editor panel in
`BundleDetailClient.tsx`. Verified: typecheck + lint green, all three
routes smoke to 401 JSON through the dev server, and the new probe
`npx tsx scripts/probe-bundle-contents.ts` → **ALL GREEN — 51
assertions** (add/merge, swap, qty up/down, remove, dup caps, insufficient
stock, listed-bundle gate, ledger + allocation + total invariants,
scratch-row cleanup). **Not browser-verified yet (Problem 16).**

**Inventory bulk-action split SHIPPED** — committed `378dbe4`, pushed
(typecheck + lint green; see "What We Did (this session)" item 6): the
calendar icon button is gone; the refresh-arrows button now fills missing
dates THEN missing value/picture in one click (one combined toast), and a
new dollar-sign button re-prices everything via the new `{ scope: "all" }`
(50/run, stalest-checked first, manual values still protected). Earlier
today: layout round 2 (`7d49f48` — gold-pill summary, OOS/Locations/All
types on the color-key row, actions cluster), sort + first restructure
(`28f1bb7`), docs refresh `13e7572`. Also this session: bundle Include
defaults switched to sealed + open (committed `4fe6a49`, pushed) and "Skip
recent releases" for bundles (committed `9ec5b44`, pushed). Next work =
browser-verify the sort + layout + the new buttons (Problem 15) and the
older pending checks in Problems / Blockers, plus a production build once
the dev server is stopped.

Highlights for whoever picks this up:

- **Dark mode + blue-700 + dashboard + release artwork (committed
  `8f9a964`, pushed — full detail in What We Did 2026-10-11)** —
  **every new UI MUST ship `dark:` pairs** (bg/text/border/ring/divider/
  placeholder) and indigo is retired: primary = blue-700 light /
  blue-600 dark, badges are `badge-blue` (`badge-indigo` no longer
  exists). Theme infra: `dark` class on `<html>` (no-flash `THEME_INIT`
  in `layout.tsx`, `localStorage("gw_theme")`), `ThemeToggle` in the Nav
  (sun in light / moon in dark). Dashboard = template layout with all
  math in `src/lib/dashboard-metrics.ts` honesty helpers — no invented
  targets, no charting library (hand-rolled SVG). Release artwork comes
  from official sources resolved WITH the 6h calendar fetch: featured
  priority `imageUrl` → Scryfall `art_crop` → branded placeholder
  (`ReleaseImage` handles broken URLs via `onError`); probe
  `npx tsx scripts/probe-releases.ts` → 14/14 images.
- **Bulk buttons split (committed `378dbe4`)** — toolbar actions unit =
  **⟳ refresh-arrows** (phase 1 `no_release_date` → phase 2 `unpriced`,
  each phase skipped when its count is 0, single combined toast `Dated X
  items · Priced Y new items`; badge = undated + unpriced, grayed when both
  are 0) · **💲 dollar-sign** (new `{ scope: "all" }` — every
  sealed/open/loose item, `price_checked_at ASC NULLS FIRST`, 50/run so
  repeat clicks cycle through a 70-item inventory; no badge, grayed only
  while a bulk run is going) · `Import CSV` · `Export`. Calendar icon
  removed. `bulkBusy` is now `"dates" | "prices"` (⟳ spins through its
  whole chain as "dates").

- **Inventory page layout (committed `7d49f48`, on top of `28f1bb7`)** —
  line 1 = `Inventory` h1 + `+ Add item` (left) and the summary
  **right-aligned**: `N items · units · inventory value` with the amount in
  a **gold gradient pill** (`bg-gradient-to-r from-amber-300 via-yellow-400
  to-amber-500`, dark amber text; verified compiling in the dev CSS), "(filtered by current view)" wording dropped. Line 2 = color-key dots (left) +
  right cluster: `Show out of stock (N)` (rendered only when N > 0) ·
  `Locations` · kind dropdown. Line 3 = toolbar: search · `All locations` ·
  `Sort` + ⇅ · then one `ml-auto` actions unit = **calendar icon** →
  **refresh icon** (indigo count badges, `title`/`aria-label` carry the old
  button text, disabled at 0/while busy, `bulkBusy` spins only the running
  one) → `Import CSV` → hidden file input → `Export` (both
  `btn-secondary`). `IconBtn` gained optional `disabled`/`badge` props
  (cards unchanged).
- **Inventory sorting (committed `28f1bb7`)** — toolbar "Sort" select (Date
  added /
  Release date / Price per unit / Name / Name + location / Quantity / Last
  price check) + a ⇅ flip button, applied inside the `filtered` memo so grid,
  summary and CSV export all match. Nulls always last; picking a key resets
  the direction to its sensible default; default = Date added ↓ = today's
  order unchanged.
- **Bundle Include defaults = sealed + open** (committed `4fe6a49`) — both
  `BUNDLE_KINDS` (server default when `kinds` omitted) and the builder's
  pre-checked boxes; `loose`/`used`/`other` still selectable.
- **Skip recent releases** — builder checkbox (default ON) + months input
  (default 6): `POST /api/bundles/generate` takes
  `excludeReleasedWithinMonths`, `generateBundle` drops items released within
  the last N months BEFORE the anchor's 60% exemption (undated items stay
  eligible — blank ≠ recent), a recent anchor → 409 `ANCHOR_TOO_RECENT`, and
  the preview says "· N recent items skipped". Probe extended, all green.

- **Release dates ARE FILLED** — the user ran "Fill release dates" through
  the real route; probe `npx tsx scripts/probe-release-dates.ts --inventory`
  → **65/70** (was 59/70). Pokémon sets resolve via the official press
  schedule (`fetchPokemonSchedule`, shared with the dashboard); the three
  Topps Chrome barcodes (= *2025 Topps Chrome Football*, released
  2026-04-15 — identity from eBay GTIN listing titles, date from
  ripped.topps.com) via a one-off seed of `upc_catalog.release_date`
  (user's pick over brittle Topps calendar scraping). `upc_catalog` is now
  checked BEFORE any network source. Still manual (by design): Yu-Gi-Oh,
  Festival in a Box, 3 genuinely ambiguous Secret Lairs.
- **Build around an item** — `POST /api/bundles/generate` takes
  `anchorItemId` + the existing `dominant` flag (true = anchor mode: line 1
  + fillers ≤50%; false = include mode: guaranteed in a normal mix). The
  anchor bypasses the 60% single-unit rule and pins the bundle to its own
  game; the builder's picker swaps the dominant checkbox for two radios.
- **eBay auto-fill browser-tested** (both bundles linked to their listings);
  bundles now show the linked eBay listing title as their name everywhere
  live; drafts show `•` bullet contents + an explicit Regenerate; artwork
  thumbs enlarge on **click only** (hover popover removed at the user's
  request — "hovering causes too much issues").

Earlier same-session work (still current): **eBay auto-fill** for Actual
Listing Price + Shipping Fee (committed `6ca69d9`, migration `0012`
applied, browser-tested — suggestion scoring = draft-title share ≥ 2
meaningful words AND ≥ 30% overlap, sync-first fill with `_synced: false`
fallback, status never touched); **Actual Listing Price / Shipping Fee
manual fields** (`e7aa06d`, migration `0011` applied); **bundle
preview == created** (`4f376b5`); **product release date** plumbing
(`524e903` — form/card/scan display, blank-only autofill, `findSetForProduct`
+ membership-verified Secret Lair lookup).

## What We Did (2026-10-05)

1. **Bundle builder Random / Pre-built modes** (committed `c65df80`, pushed —
   docs `009680d`; typecheck
   + lint green, routes smoke to 401 JSON):
   - `src/components/BundleBuilder.tsx` (the bulk of it): new `mode`
     (`"random" | "prebuilt"`, default random) + a "How to build" segmented
     pair at the top of the builder card (Random / Pre-built, each with a
     one-line blurb; switching clears the random preview + error, keeps each
     mode's other state); random-only controls (Bundle from / Include / Skip
     recent / Build around / Generate) wrapped in `mode === "random" &&`,
      preview card guarded the same way; the Bundle price block (label +
      preset chips + input + helper text) renders ONLY in random mode —
      same-day follow-up per the user, Pre-built hides it (the top card then
      shows just the selector) and its price input moved into the "Your
      bundle" summary row (inline `NumberDollars`, presets dropped for
      pre-built). Prebuilt state: `selected` (itemId → qty),
      `invQuery`, `prePrice` (null = auto) + `prePriceEdited`; derived
      `selectedItems` / `contentsCents` / `unitCount` / `derivedPriceCents` /
      `prebuiltSuggestedName`
      (distinct games joined); helpers `pickCap` (stock ∩ `bundleCopyCap`, 0
     = ineligible), `switchMode`, `addSelected`, `setQty`, `removeSelected`;
     `pickerItems` = active rows only (paused hidden) filtered by name/UPC/
     set search, name-sorted, capped 80. New "Your bundle" card: selected
     lines with −qty/+ steppers (clamped by cap, red `issue` line when the
     row went paused/OOS/unpriced/at-cap since selection) + Remove + Clear
     all, the Add-items search list (row = thumb, name, kind · box · stock ·
     value · `×N in bundle`; Add disabled with a title reason at cap/OOS/
     unpriced), a live summary (N items · M units · contents $X · the
     **Bundle price** as an inline `NumberDollars`), the auto/custom price
     note, the name input (placeholder =
     joined game labels) and one **Create bundle & reserve stock** →
     `createPrebuilt()` posts `{ name, lines, listingPriceCents:
     prePriceEdited ? prePrice : derivedPriceCents }`, on success flashes,
     clears selection/price/name and `router.refresh()`; error box + all
     fetches follow the defensive `res.json().catch(() => null)` +
     try/catch/finally convention.
   - `src/app/api/bundles/route.ts`: POST now accepts optional
     `listingPriceCents` (validated exactly like the PATCH route: `null` or
     integer ≥ 0 cents, else 400) → written into the `bundles` insert as
     `listing_price_cents`; `STALE_PREVIEW` message generalized to
     "…regenerate or re-check your picks" (one function serves both modes);
     JSDoc body contract updated.
   - Docs: `AGENTS.md` — new "Builder modes: Random / Pre-built" bullet in
     the bundle section + a creation-time-seeding sentence on the Actual
     Listing Price bullet. `SESSION.md` — this file.

## What We Did (2026-10-01)

1. **Copy buttons on the eBay listing draft** (committed `aed2ccb`, pushed —
   1 file, +59/−2): new `copyDraftText(text, label)` helper in
   `BundleDetailClient.tsx` (clipboard write + `flash` toast, failure falls
   back to "Couldn't copy — select the text manually"); the Title and
   Description label rows in the expanded draft editor became
   `flex justify-between` with a right-aligned icon-only button (feather
   clipboard glyph, `IconBtn`-styling `h-7 w-7`, `title`/`aria-label` =
   "Copy title"/"Copy description") copying `draft.title` /
   `draft.description` — the CURRENT on-screen text, so unsaved edits copy
   too. Collapsed card, Regenerate/Save/Close and draft persistence
   untouched. User's pick: expanded editor only (not collapsed, not a
   combined "copy both"). typecheck + lint green.

## What We Did (this session — 2026-09-30)

1. **Skip recent releases for bundles** (committed `9ec5b44`): builder
   checkbox (default ON) + months number input (default 6) under "Include";
   `POST /api/bundles/generate` reads `excludeReleasedWithinMonths` (> 0, else
   off) and forwards it as `BundleGenOptions.excludeReleasedWithinMonths`;
   `generateBundle` drops items with `release_date` newer than the cutoff
   BEFORE the anchor's 60% exemption (so a recent anchor can't sneak in), and
   items with no date stay eligible (blank = unknown, not recent). Generate
   route pre-validates the anchor → 409 `ANCHOR_TOO_RECENT`, counts the
   dropped rows → response `skippedRecent` (preview shows "· N recent items
   skipped"; a failed generation appends the same count to its 409). Helpers
   `releaseCutoffISO(months)` (UTC calendar months, end-of-month clamped) +
   `isExcludedByReleaseDate` in `bundle.ts`, shared by the route, the
   generator, and the builder's live-filtered "Build around item" picker
   (auto-clears via the existing `anchorValid` effect). Legacy no-`lines` path
   of `POST /api/bundles` takes the same flag. Probe
   `scripts/probe-bundle-dupes.ts` gained a release-window scenario (window on
   → 0 recent lines out of 801, undated 400 / old 401 still drawn; control
   run window-off drew 351 recent → fixture proves the filter; recent anchor
   → empty, undated anchor → present). typecheck + lint green.
2. **Bundle Include defaults = sealed + open** (committed `4fe6a49`, pushed):
   `BUNDLE_KINDS` in `src/lib/utils.ts` (`["sealed", "loose"]` →
   `["sealed", "open"]`) — it is the server default in BOTH bundle routes when
   the body omits `kinds` — plus the builder's initial `kinds` state; the
   generate-route JSDoc example followed. 3 files, 3 lines.
3. **Inventory sorting** (committed `28f1bb7`, pushed): new toolbar "Sort"
   `<select>` + ⇅ direction button in `InventoryClient.tsx` (after the
   location select). Keys: Date added (`created_at`, default ↓ = the server's
   newest-first order), Release date, Price (per unit), Name, Name +
   location, Quantity in stock, Last price check. `sortInventory()` runs
   INSIDE the `filtered` memo (deps: `items, q, showZero, sortKey, sortDir,
   locName`), so grid + "N items · units · value" summary + CSV Export share
   one order — no API change, rows are already loaded. `locName` moved above
   the memo and wrapped in `useCallback` (fixes the exhaustive-deps warning).
   Picking a key resets direction to that key's default (dates/price/
   quantity ↓, names ↑); ⇅ flips; **nulls always last** (unpriced, undated,
   never-checked) in BOTH directions; ties → name → id. Session-only state.
   typecheck + lint green.
4. **Inventory page restructure** (committed `28f1bb7`, pushed — same file,
   on top of the
   sort work): `+ Add item` moved from the toolbar into the page header next
   to `Inventory`, with the summary (`N items · units · inventory value $X
   (filtered by current view)`) as small gray text beside it (hidden below
   `sm`); `Locations` moved from the toolbar into the header's right group.
   Both header bulk actions became **icon buttons** built on `IconBtn` —
   calendar glyph for fill release dates, refresh-arrows for browse active,
   each with an indigo corner **badge** of the count (hidden at 0), the old
   button wording folded into `title`/`aria-label`, disabled at 0 or while
   busy, `bulkBusy` (`"dates" | "price"`) state so only the icon that's
   running spins. Kind pills replaced by a **dropdown** (`All types` +
   `kindLabel` options, same `kind` state) on the right of the color-key
   card, where the summary used to be. Toolbar now = search (`min-w-0
   flex-1` capped `max-w-xs`) · location select · `Sort` + ⇅ · `Show out of
   stock (N)` (`ml-auto`) · `Import CSV` · `Export`, full labels kept.
    `IconBtn` signature gained `disabled?`/`badge?` (card buttons pass
    neither). typecheck + lint green.
5. **Inventory layout round 2** (committed `7d49f48`, pushed — same file):
   summary moved to the header's right (`ml-auto`, `text-right`), the amount
   wrapped in a gold gradient pill, "(filtered by current view)" dropped;
   `Show out of stock (N)` + `Locations` + the kind dropdown moved onto the
   color-key card as one right cluster (line-2 order was the user's pick);
   both bulk `IconBtn`s moved from the header into the toolbar as an
   `ml-auto` actions unit directly left of `Import CSV` (calendar first,
   then refresh), with the hidden file input and `Export` inside it; `Export`
   switched `btn-ghost` → `btn-secondary` to match `Import CSV`.    Gradient
   utility names checked against the installed Tailwind v4 first
   (`bg-gradient-to-*` kept as an alias of `bg-linear-to-*`) and the four
   classes confirmed present in the dev server's compiled `layout.css`.
   typecheck + lint green.
6. **Bulk-action split** (committed `378dbe4`, pushed — 2 files): the
   calendar `IconBtn` is deleted; `refreshReleaseDates` + `refreshUnpriced`
   are replaced by `postBulk(scope)` (shared fetch/parse, never throws, keeps
   the route's `error` string for toasts) + `mergeHistory()` (folds
   `historyPoints` into the sparkline cache) + `refreshDatesAndPrices()` (⟳:
   dates phase then unpriced phase, skipped when the count is 0, result
   parts joined into ONE `flash` — `Dated 4 items · Priced 12 new items`,
   failures appended as `· date lookup failed` etc. — `load()` in `finally`)
   + `refreshAllPrices()` (💲: `scope: "all"`, toast `Refreshed N prices` /
   `· M failed`). Route: `scope: "all"` shares the `unpriced` branch — same
   select + kind filter but NO `.or()` and `.order("price_checked_at", {
   ascending, nullsFirst })` before `.limit(50)`; `withoutManualValue` and
   the whole loop (priceOne → catalog date cache → recordPriceHistory →
   historyPoints) unchanged, JSDoc updated. Buttons: ⟳ badge =
   `undatedCount + unpricedCount`, disabled at 0+0, title lists both counts;
   💲 feather dollar-sign glyph (`M12 1v22` + S-curve), no badge,
   `disabled={busy}` only. `bulkBusy` re-purposed to `"dates" | "prices"`.
   Route smoke-tested through the dev server (`POST {"scope":"all"}` → 401
   JSON = module compiles). typecheck + lint green.
7. **Bundle contents editing — substitute / re-quantity / add / remove before
   listing** (committed `2954679`, pushed): server
   (`src/lib/bundle-contents.ts`, new + 2 route files): all ops 409
   `NOT_EDITABLE` unless the bundle is `draft`/`allocated`; re-validates
   owner, `active` + priced, qty 1..99, unreserved stock
   (`INSUFFICIENT_STOCK`) and `bundleCopyCap` (new export in `bundle.ts`:
   $20+ → 1 copy, cheaper ≤ 5 — now the single source for the generator's
   `maxUnits` too; `DUP_CAP`). Accounting mirrors create: reserve the
   replacement first, release the old line second, per-op undo stack,
   `item_movements` `reserve`/`release` rows (`ref_id` = bundle), exactly
   ONE `allocated` allocation row per (bundle, item) equal to the line
   quantity, `total_value_cents` recomputed from `bundle_items` (10%-off
   price follows). A touched line re-prices to the item's CURRENT value;
   untouched lines keep create-time snapshots. POST add MERGES into an
   existing line for the same product; PATCH `{ newItemId?, quantity? }`
   covers swap and qty change in one op; DELETE releases the line. UI
   (`BundleDetailClient.tsx`): while unlisted the Contents card gains
   **Edit**/**Remove` per line + **+ Add item**; one shared panel = search
   over `/api/inventory` (active + in-stock + priced, `×N in bundle`,
   at-cap rows disabled), −/+ stepper clamped by stock AND cap, live line
   total with "was $X" on a swap, Apply labels (Add/Substitute/Update
   quantity), confirm on Remove; a contents change while a listing draft
   exists shows a "hit Regenerate" hint (drafts still never auto-refresh).
   Probe `scripts/probe-bundle-contents.ts` (admin client with a stub
   realtime transport — Node 20 has no native WebSocket) runs 11 scenario
   groups against scratch "ZZ probe" rows and deletes them (movements
   cascade with the items): **ALL GREEN**, routes → 401 JSON, typecheck +
   lint green.

## What We Did (2026-09-26 sessions)

1. **eBay auto-fill for Actual Listing Price / Shipping Fee** (committed
   `6ca69d9`, pushed; file list in its own section below): shipping parse in
   the listings sync (probe-verified branch A), migration `0012`
   **applied by the user**, `POST /api/bundles/[id]/ebay-fill`,
   the bundle-detail "eBay listing" card with draft-title suggestion, PATCH
   unlink (`ebayListingId: null`), info-line listed/sold gap fix.
2. **Actual Listing Price + Shipping Fee** (committed `e7aa06d`, pushed):
   migration `0011` **applied by the user** (REST-verified: both columns
   return, null on the 2 listed bundles), PATCH accepts `listingPriceCents`/
   `shippingCents`, mark-listed panel + Edit affordance, bundles-list
   display, sale-form prefill.
3. **Bundle preview == created bundle** (committed `4f376b5` + docs
   `e533545`, pushed): user bug — create re-rolled a fresh random bundle
   because `BundleBuilder.create()` sent no lines and `POST /api/bundles`
   re-ran `buildBundleAcrossGames` (seeds from `Math.random()` per call).
   Fix: builder sends previewed `lines` + `targetValueCents`; route persists
   them exactly (money re-read from the DB, dup/stock/active re-checked,
   `409 STALE_PREVIEW` when inventory moved; no `lines` → legacy generate).
4. **Product release date feature** (committed `524e903`, pushed;
   file list in its own section below): schema `0010`, item form field
   (`ItemForm` "Released" input + `CardSearchInput`/scryfall search surfacing
   `released_at` prefill), POST/PATCH inventory validate `YYYY-MM-DD`,
   inventory card "Released …" line, scan-page catalog card + matched rows,
   `cacheCatalogReleaseDate` + `{ scope: "no_release_date" }` bulk mode in
   refresh-price (≤50, per-product dedupe, prices untouched, "Fill release
   dates (N)" header button), scan route inherits catalog date on create +
   backfills blanks. Initially the resolver had no working source (0 loose,
   0 set_code → always null; user reported "no dates are being filled in") —
   this session added the name→set matcher (`findSetForProduct`), the
   membership-verified mtg.wiki Secret Lair lookup (`secret-lair.ts`),
   extracted the resolver to `src/lib/release-dates.ts`, and added the
   `--inventory` probe. eBay aspect path dropped after live probing (see
   Current Objective).
5. **Inventory visibility: paused always shown, sold-out hidden** (committed
   `26e3c0c` + SESSION refresh `4b92db4`, pushed — see Files Changed below).
6. **Bundle display names + status layout** (committed `66fd101`, pushed):
   status dot removed — the status word now sits after `created {date}` in
   the subline; everywhere a bundle is named live (bundles tab, detail h1,
   dashboard "Reserved in bundles", sale-form dropdown via new
   `display_name` option field) shows the linked eBay listing's title via
   the new `ebayTitlesForBundles(supabase, ownerId, ids)` helper in
   `bundle.ts` (DB `bundles.name` untouched; unlinked bundles keep their
   generated name); `listingLabel` dropped the redundant "listed" token
   (kept `ship $Y`); sale-history rows still show `bundle.name`.
7. **Listing-draft fixes** (committed `e3ee03e`, pushed): the draft editor's
   mount fetch of `/api/drafts` now also `setDraft({title, description})` so
   the button reads "Edit listing draft" on revisit; `generateListingText`
   emits `• N× Name (SET)` bullets sorted by unit value desc (line-total
   tie-break) instead of numbered lines; new **Regenerate** button in the
   draft editor (confirm → regenerate from `bundle.items` → persists only on
   Save draft — drafts are never auto-regenerated).
8. **Build around an item** (committed `c03a8c5`, pushed; AGENTS.md updated
   in the same commit): generate route takes `anchorItemId` — the anchor is
   always included, bypasses the 60%-of-target single-unit rule, and pins
   the bundle to its own game group (409 `ANCHOR_NOT_ELIGIBLE` /
   `ANCHOR_GAME_MISMATCH`); `dominant` picks **anchor mode** (anchor line 1,
   fillers ≤50% of its value) vs **include mode** (guaranteed in a plain
   mix); builder's "Build around item" picker (live-filtered to current
   Include kinds + game choice, auto-clears when filters exclude it) swaps
   the dominant checkbox for two radios; `POST /api/bundles` untouched (the
   create route never takes `anchorItemId` — the builder always persists
   previewed lines). Probe extended with 3 anchor scenarios — all green.
9. **Release dates: Pokémon + Topps Chrome** (committed `154f8b0`, pushed;
   AGENTS.md updated in the same commit): `releases.ts` now exports
   `fetchPokemonSchedule()` (full `period=All` table incl. past, own 6h
   cache, never caches an empty parse — dashboard `fetchPokemonReleases`
   still drops `date < today`); resolver gains `upc` → `upc_catalog.release_date`
   (plain REST fetch, NOT `createAdminClient` — realtime throws under
   Node 20/tsx) checked BEFORE the network sources, plus a `pokemon_schedule`
   branch (`/^pok[eé]mon/i` early-return before Scryfall; item tokens minus
   product words must ALL match and all matches must agree on ONE date). The
   three Topps Chrome barcodes (887521156788/832/870 = *2025 Topps Chrome
   Football* via eBay GTIN titles; date 2026-04-15 from ripped.topps.com)
   were seeded once into `upc_catalog.release_date`. **All 6 dates now in the
   DB** — the user ran "Fill release dates" through the real route; probe
   **65/70** (was 59/70). Remaining 5 manual by design: Yu-Gi-Oh, Festival
   in a Box, 3 genuinely ambiguous Secret Lairs.
10. **Hover-enlarge removed from artwork thumbs** (committed `7f6c738`,
    pushed): user — "hovering causes too much issues" — `canHover`/`hovering`/
    popover deleted from `ArtworkThumb.tsx` (used by inventory + bundle
    builder); click/tap still opens the lightbox; `s-l<N>` → `s-l1600`
    upscale unchanged.

## What We Did (2026-09-24 sessions)

1. **eBay multi-unit price filtering committed** (`cd862de`, pushed): QUANTITY/
   VARIANT pattern pools — see previous-session-style notes below.
2. **Date acquired feature shipped** (`6b08b6d`, pushed): nullable
   `items.acquired_at date` (`0008_item_acquired_at.sql` — **applied by the user
   in the SQL editor, verified via REST**: column exists, all rows backfilled,
   0 nulls); ItemForm "Date acquired" input (local-today default on add, edit
   prefill, null clears); POST/PATCH inventory accept + validate `YYYY-MM-DD`
   (`getDateOnly`/`todayDateOnly` in `api-helper.ts`, `localToday()` in
   `utils.ts`); scan creates stamp the scanner's local date (ScanClient sends
   it, server falls back to UTC). The quantity PATCH gap remains open.
3. **Dashboard upcoming releases committed** (`ba77fba`, pushed): removed the "Low stock (≤2)"
   block + `lowStock` computation from `src/app/(app)/page.tsx`; new
   "Upcoming releases" list in its place (date column · linked name · badge
   MTG/Secret Lair/Pokémon, `slice(0, 8)`, dated asc then TBA, empty/error/
   partial states), "Reserved in bundles" kept below per the user. New
   `src/lib/releases.ts` (`fetchUpcomingReleases()`, never throws): MTG from
   mtg.wiki `Category:Upcoming_releases` MediaWiki API (Infobox set only,
   `/`-subpages and books dropped, `{{start date and age}}` + plain-text date
   fallback), Pokémon from `press.pokemon.com` schedule table (regex parse,
   entity-decoded); parallel, per-source try/catch → `{releases, errors[]}`;
   6h in-memory cache (5 min when empty). Verified live via
   `npx tsx scripts/probe-releases.ts`: **13 rows, 0 errors** (Reality
   Fracture Oct 2 → Kamigawa Jun 2027, Delta Reign Nov 6, both Secret Lairs
   TBA).
4. **Item price history committed** (`94528d0`, pushed): see the historical
   file list in git; migration `0009` **applied by the user in the SQL
   editor** this session. Decisions: record on refresh **and** manual edits;
   **only on change** (first snapshot = baseline); UI = card sparkline +
   detail modal; `recordPriceHistory` never throws (missing table → warn).
5. **Bundle 10% discount** (`89ac676`, pushed): user's requirement —
   "prices are still too high… bundle $110 value into a $100 bundle", and
   "no one else should know about it than me and you". Semantics: wire
   `targetCents` = SELLING price; both bundle routes fill contents to
   `contentsTargetForPrice(price)` = price ÷ 0.9; displayed price always
   `bundlePriceCents(total)` = round(total × 0.9) (derived from actual
   contents → existing bundles also show 10% off). Buyer-facing surfaces
   untouched: listing drafts stay price-free (`dd4d7e2` respected), bundle
   name = game label, sales record gross you type yourself. No migration.
   (Committed this session as `89ac676`.)
6. **Bundle duplicates** (`24de6a9`, pushed): user rules — only
   items **under $20** may repeat, **max 5 of the same product per bundle**
   (bounded by stock); $20+ items at most once. `generateBundle` rewritten:
   per-item `maxUnits` cap enforced on every add-path (main draw,
   overshoot-diversion, fallback); draw weight = `sqrt(value) ×
   sqrt(remaining allowed units)` (capped/exhausted items drop out); trial
   tie-break now counts total units (soft ~8) instead of distinct lines (the
   old `|lines.size − 8|` actively suppressed duplicates). No API/DB/UI
   changes (`×N` + line totals already render). Verified with the new
   `scripts/probe-bundle-dupes.ts`: 56–71% of 200–500 bundles contain a dup
   line at $50/$100/$150 fill targets, **0 rule violations**, avg fill on
   target. (Commit message: quote the message with single quotes — it contains
   `$20`, which bash ate once → mangled `9f36ca8`, fixed via amend +
   `--force-with-lease`.)
7. **Dominant-anchor composition** (`7b6a1bf`, pushed): user request
   — bundle should start from one standout item + smaller fillers, with a
   toggle. `BundleGenOptions { dominant?: boolean }` (default true);
   `generateBundle` now routes to `dominantBundle` (top-5 sqrt(value)-weighted
   anchor, one unit, fillers ≤50% of anchor sqrt(value)-weighted and never
   past the window, anchor-first/value-desc line order, fallback = priciest
   anchor + largest-first fill without the tier cap) or the previous mix
   logic (`mixBundle`, behavior unchanged). Shared scoring extracted
   (`trialScore`, `toLines`, `lineTotal`); `buildBundleAcrossGames` takes +
   forwards `opts`. Both bundle routes read `body.dominant !== false`;
   `BundleBuilder.tsx` checkbox "One dominant item" (default checked) sent on
   generate + create. Nothing stored on the bundle. Probe now runs BOTH modes
   with anchor stats: dominant 100% anchor-first / 100% ≤50%-tier / ~51%
   anchor share; dup rules held everywhere.

## What We Did (previous session)

1. **`open` items priced like sealed** (`a4706e1`): the sealed-condition eBay
   pipeline now also runs for `open` kind items (they share the sealed UPC
   logic; opened boxes/boosters price on sealed listings). Trimmed the sealed
   single-hint list in `pricing.ts` (`PACKAGE_WORDS`/`SINGLE_HINTS`) so open
   box art stays correct.
2. **Product-art overhaul** (`af8942d`): word-boundary token matching
   (`titleMatches`/`requiredTokens`), `matchingPool` searches **GTIN first**
   (deck variants share a pack UPC, so the variant tokens narrow that pool) and
   only falls back to a `q` keyword search; `pickBestImage`/`scoreTitle` score
   sealed-package words (+1) vs loose-single hints (−2) on a lowercased title.
   `resolveNameImage`/`resolveVariantImage` now accept an optional `gtin`; the
   `searchActive` variant branch uses the GTIN-first pool. Routes pass
   `item.upc`. Added `scripts/probe-image-picks.ts` to debug the kept pool, and
   ran `npm run backfill-art` (kind `in.(sealed,open)`, passes `upc`): **29
   images updated, 0 failures**. Verified in the DB: Lord of the Rings ×2,
   Duskmourn: Endless Punishment, Secret Lair Cats of Chaos / Toby's Journey /
   Witch's Familiar / Garfield As Intended / Marvel Command Tower.
3. **"Browse active" bulk refresh** (`c0cf1eb`, widened `0dcdf5e`):
   `POST /api/inventory/refresh-price` now accepts `{ scope: "unpriced" }`,
   selecting sealed/open/loose rows where **`value_cents IS NULL OR
   image_url IS NULL`**, capped at 50, sequential with per-item try/catch and a
   per-`upc|name` dedupe cache, `export const maxDuration = 120`, upfront 409
   `EBAY_NOT_CONFIGURED`, returns `{ refreshed, failed, skipped, errors[] }`.
   **Manual values are never overwritten**: when the item already has
   `value_cents`, `withoutManualValue()` strips value/avg/price_source/sample
   count from the update (applied to cached dedupe replays too); a picture/name
   fill still lands. Button is in the Inventory header: "Browse active (N)",
   count uses the identical predicate, disabled at 0, driven by the header
   "Browse active" button in the grid. User reported it missing → it was a
   stale browser tab.
4. **Layout rearrangement** (`0dcdf5e`): desktop nav tabs (Inventory/Scan/
   Bundles/Sales/Listings/Settings) merged into the sticky "goodwhilly" header
   bar (middle segment, `overflow-x-auto`); removed the Inventory subtitle
   "Simple view for quick selling · Big pictures · No clutter"; moved the
   "N items · N units · inventory value $X" summary into the color-key card
   (dots left, summary right, wraps). Mobile hamburger + bottom bar unchanged.
5. **Scan ergonomics** (`b9aabc9`, `e0bd1c8`, `be0ef4a`): product/sub name
   fields now prefill from the saved inventory row for the scanned barcode
   (split on first `": "`; falls back to catalog name when no row exists;
   unknown barcodes clear instead of leaking the previous product's name).
   Quantity is a `−`/`+` stepper (1..99, buttons disabled while busy) instead
   of a number input. Quantity **always starts at 1**: resets on a new barcode
   lookup (`[upc]` effect) and after every successful add. (A localStorage
   "remember quantity" version was added then reverted at the user's request —
   do not bring back remembering.)

## Current State

- `origin/main` = `91f9117` — **2026-10-12 Adjust Stock target-quantity model
  COMMITTED and pushed** (1 file `InventoryClient.tsx`, +15/−44; direction
  segment removed, qty opens at the item's actual stock, `delta = target −
  current` posted to the unchanged adjust route, 0 valid, unchanged disables
  Update). typecheck + lint + probe 46/46 green; browser checklist in the
  "later 3" section above still to run.
- Prior same day: `dacf685` (Adjust Stock direction-segmented redesign, now
  superseded by `91f9117`) — 1 file `InventoryClient.tsx`, +126/−28.
- Prior same day: `9d93b0b` (price/integer input digit-deletion fix —
  raw-text-draft rewrite of `NumberDollars` + new `NumberInt`, quantity PATCH
  persistence; 8 files, +357/−32 incl. `src/lib/number-input.ts`,
  `probe-number-inputs.ts`, AGENTS.md; typecheck + lint + build + probe 46/46,
  PATCH smoked 401; browser-verify per Problem 19) and `ee8b720` (sealed price
  lookup for Bundle + pack subcategories, 3 files + probe + AGENTS), on top of
  `da52f6e` (SESSION refresh) and 2026-10-11 `8f9a964` (dark + dashboard +
  artwork).
- `typecheck` + `lint` + `npm run build` all pass (and new probe
  `npx tsx scripts/probe-pricing-filters.ts` green).
- **New probe**: `scripts/probe-pricing-filters.ts` exercises `keepMatching`
  for "Play Booster Pack", "Hanger Booster" (no "pack" word), "Set Booster Pack"
  + counters (box subs, plurals, singular hanger). All assertions pass.
- The 2026-10-11 dashboard/data snapshot and older verifications remain as
  previously recorded (browser verification for Problem 18 etc. still pending).
- `typecheck` + `lint` + **`npm run build` all pass** (build ran
  2026-10-11 with the dev server stopped; the gotcha about clobbering
  `.next/` still applies — do not build while `npm run dev` runs;
  this session's post-artwork re-checks were typecheck + lint only for
  that reason).
- **Migrations `0001`–`0012` all applied** (0011 + 0012 REST-verified
  2026-09-26; 0010 earlier; 0009 on 2026-09-24). Next new migration =
  `0013_*.sql`. The theme/dashboard work needs NO migration.
- **Dashboard data (REST-verified 2026-10-11)**: 89 items · 248 units ·
  $9,566.46 · 11 unpriced · 8 zero-qty · 30 paused (all rows have
  images) · 17 ACTIVE listings (0 missing photos, 2 added this week,
  `item_id` all null) · 6 bundles all `listed` (0 waiting) · **0 sales
  ever** · price history 183 rows / 78 items spanning 2026-09-25 →
  2026-10-09 (~17 days — the 30-day trend window clips to "since Sep
  25"; the 7-day "This Week" window has real span).
- **Release dates ARE filled in the DB**: the user ran "Fill release dates"
  through the real route; `npx tsx scripts/probe-release-dates.ts --inventory`
  → **65/70** (new `upc_catalog` + `pokemon_schedule` sources; catalog now
  short-circuits prior discoveries). Every pick + source printed and
  reviewed. 5 manual by design: Yu-Gi-Oh, Festival in a Box, the 3 ambiguous
  Secret Lairs (Lasagna Food Token, Command Tower, Inked Foil Edition).
  Pokémon barcodes cached onto `upc_catalog` by the fill.
- **eBay auto-fill browser-tested** (user linked both bundles:
  128098813682 / 128098820562). Release-date *display* (card "Released"
  lines, scan rows) not yet eyeballed after the fill — values are in the DB.
- **Probe verified** dominant-anchor + release window:
  `npx tsx scripts/probe-bundle-dupes.ts` → BOTH modes + the 3 anchor
  scenarios (presence / first-line+tier / include mode / 60% bypass with an
  oversized anchor) + the 6-month window scenario (801 lines, 0 recent,
  undated 400 / old 401, control run window-off drew 351, recent anchor
    blocked), dup rate 56–71%, **0 violations**. Releases calendar still
    parses AND now resolves artwork — `npx tsx scripts/probe-releases.ts`
    → 14 rows, 0 errors, **14/14 with `imageUrl`** (wiki infobox thumbs +
    gamespress Pokémon logos).
- **Probe verified** the bundle contents editor:
  `npx tsx scripts/probe-bundle-contents.ts` → **ALL GREEN (51 assertions**;
  add/merge, swap (release old + reserve new), qty up/down, remove, dup
  caps incl. $20+ single-copy, insufficient stock, `NOT_EDITABLE` on a
  listed bundle, 404s for unknown ids, allocation/ledger/total invariants,
  `bundleWithItems` shape, cleanup of the scratch rows**)**. It uses the
  service-role client with a stub realtime transport (Node 20 has no
  native WebSocket — same note as AGENTS' script env pattern).
- Still NOT browser-checked (in addition to the new dashboard + dark mode,
  Problem 18): the **eBay draft copy buttons** (committed `aed2ccb`),
  the **bundle contents editor** (Problem 16), **inventory sorting +
  layout + the new bulk buttons** (Problem 15), **bundle Include
  defaults = sealed + open**, **skip recent releases** (Problem 14),
  **Actual Listing Price / Shipping Fee manual flow** (migration
  applied, committed `e7aa06d`), **Bundle preview==create**, bundle
  discount + duplicates + dominant toggle, price history, inventory
  visibility (paused shown, sold-out hidden), the Random/Pre-built
  builder modes (Problem 17), and the four 2026-09-26 commits
  (`66fd101`, `e3ee03e`, `c03a8c5`, `7f6c738`).

## Decisions Made

- **Dark mode + primary + dashboard (2026-10-11, user-picked via Q&A)**:
  (1) **full app-wide dark mode**, class-based on `<html>`, toggle in
  the Nav, no-flash inline script, `prefers-color-scheme` as the
  default for first-time visitors (chosen over CSS-only `prefers-color-
  scheme` and over per-page theming); (2) **"Switch to blue-700"** as
  the primary interaction color app-wide — indigo is gone from the
  design tokens (btn-primary, focus rings, badges, links kept blue-600
   where they already were); (3) release artwork = **best-effort
   Scryfall only** (`art_crop` from the set the release-date resolver
   already matches; exact card-name fallback; Pokémon/Secret Lair/
   anything else → styled gradient panel — chosen over scraping wiki
   images and over always-panel). **SUPERSEDED same day** by the user's
   explicit follow-up ("first explain which sources can provide images…
   then implement"): official artwork now comes from the wiki infobox +
   Pokémon press product pages first, Scryfall is the fallback, branded
   placeholder last (no invented art anywhere — see "What We Did"
   item 11). Dashboard honesty rules: data-driven
  ONLY from existing DB rows — no listing-progress bar (no target
  exists), no "items aren't listed" task (`listings.item_id` is null
  everywhere — the linkage is best-effort), gainer/decliner hidden
  when the mover list is empty, trend window clips to real data
  ("since Sep 25") and shows a neutral state under 3 days of span.
  Mobile reading order: Needs Attention → game mix → health card →
  recent additions → market pulse → releases → sales (the 3-column
  masonry wrappers stack in column order; the template itself is
  masonry — right column row 1 is taller — so column wrappers were
  chosen over a shared grid row layout that would waste space).

- **Bundle builder Random / Pre-built (2026-10-05, user-picked)**: a
  **"How to build"** pair at the top of the builder card with exactly two
  options — **Random** = today's flow untouched, **Pre-built** = hand-pick
  one or more items. Follow-up picks, in order: price = **the app fills it
  in from the selected items** (auto `bundlePriceCents(contents)`, still
  type-overridable, clears back to auto) and **the eBay fill keeps working
  after the fact** (unchanged — it overwrites `listing_price_cents` once a
  listing is linked), so the typed/auto price is stored in the EXISTING
   `listing_price_cents` (no `0013` migration — the "Actual Listing Price"
   column doubles as the builder price; blank = derived price everywhere);
   UI follow-up same day — "when clicking the pre-built button, i don't
   need to see the bundle price that's right underneath it": in Pre-built
   the top Bundle price block (label + preset chips + input + helper) is
   HIDDEN entirely (the top card shows only the selector) and the price
   input lives in the "Your bundle" summary instead — presets dropped for
   pre-built, kept only in Random;
  **game mixing ALLOWED** in pre-built (breaks the random-mode one-game
  rule — label = distinct games joined client-side, server `game` = first
  line's game); picker scope = **everything but paused items** (all kinds,
  any stock/value — OOS and unpriced rows visible but their Add is disabled
  with the reason); flow = **selection + live summary → Create** (no
  generate/preview step, nothing to randomize — straight into the existing
  `POST /api/bundles` `lines` path so stock/dup-cap/`STALE_PREVIEW`
  validation still runs).

- **eBay draft copy buttons (2026-10-01, user-picked)**: a **copy icon next
  to each label** in the draft editor (chosen over copy buttons on the
  collapsed card and over one combined "copy both" button) — **expanded
  editor only**; copies the current on-screen text (unsaved edits
  included) rather than the last-saved draft; success/failure surface as
  toasts via the existing `flash`.
- **Bundle contents editing (2026-09-30, user-picked)**: a **full contents
  editor** before listing (chosen over swap-only / swap+remove) — swap,
  re-quantity, add and remove lines; the replacement's **quantity is
  user-chosen** (stepper, not "keep the same"); the picker is a **search
  box over all in-stock priced stock** (chosen over a kind dropdown and
  over restricting to sealed+open); **no value guardrail** (chosen over
  warn/block outside ±$15 — the header price/value updates live and the
  manual Actual Listing Price is never touched). Implementation choices:
  one PATCH covers swap and qty together; per-line **Edit** preselects the
  current item (same item + new qty = quantity change, any other pick =
  substitute); a **touched line re-prices to the item's CURRENT value**
  while untouched lines keep their create-time snapshots; the allocation
  invariant is ONE `allocated` row per (bundle, item) whose quantity equals
  the line; status gate = `draft`/`allocated` only; a saved listing draft
  stays untouched — an amber "hit Regenerate" hint appears instead (drafts
  never auto-regenerate, per the 2026-09-26 decision).

- **Inventory page layout (2026-09-30, user-picked step by step)**: `+ Add
  item` beside the `Inventory` h1 with the summary as **small gray text next
  to it** (hidden below `sm`); `Locations` moves into the header's right
  group. Kind pills → **dropdown** on the color-key row (right side, where
  the summary was). Toolbar keeps **full labels** (`Import CSV`, `Show out of
  stock (N)` — the earlier shortening was dropped once space freed up) with
  `flex-wrap` only as a mobile fallback. Both bulk actions become **icon
  buttons**: user chose **icon + count badge** (not tooltip-only) and
  converted **both** buttons — calendar glyph for fill release dates
  (user-picked), refresh arrows for browse active; count hidden at 0.
- **Inventory layout round 2 (2026-09-30, user-picked)**: summary moves to
  the header's **right, right-aligned**, and its amount gets a **gold
  gradient pill** ("a bit more fancy, maybe a gold bar — to indicate the
  value/money") with **"(filtered by current view)" wording removed** (user's
  explicit follow-up picks over a plain text move / underline bar / both).
  Line 2 order was dictated by the user: color-key dots, then `Show out of
  stock`, `Locations`, `All types` — i.e. OOS + Locations + kind dropdown all
  live on the color-key row (superseding the original "All types next to All
  locations" idea). Both bulk icons move into the toolbar's `ml-auto` actions
  unit **left of `Import CSV`**, calendar before refresh (user's listed
  order), and `Export` must **match `Import CSV`** (`btn-secondary`, was
  ghost).
- **Bulk-action split (2026-09-30, user-picked)**: the user first asked the
  calendar button to "also refresh all the prices"; after seeing what the
  current ⟳ does (a blanks-only "Browse active" pass — a near no-op on a
  fully priced inventory), they picked arrangement **B**: the calendar's date
  job moves to ⟳, which chains dates → missing value/picture in ONE click
  with a single combined toast; a **new 💲 dollar-sign button** re-prices
  EVERYTHING (new `scope: "all"`, stalest-checked first, ≤50/run — manual
  values still protected by `withoutManualValue`); the calendar icon is
  removed. Badges: ⟳ = undated + unpriced (grayed when both are 0), 💲 =
  none (always has work).
- **Inventory sorting (2026-09-30, user-picked)**: client-side only (no API
  param) via a toolbar select + a separate ⇅ flip button (chosen over fixed
  per-direction dropdown entries and over click-to-cycle). Seven keys: the
  user's four (release date, price, name, name + location) plus quantity,
  date added, last price check (user picked those three from a longer idea
  list — total value, date acquired, kind, location→name, unit cost, UPC were
  offered and declined). **Price = per-unit `value_cents`** (not × quantity).
  **"Name + location" = name primary, storage-box name as tie-break** (the
  box-grouping option was declined separately, so it is NOT location-first).
  Picking a key resets direction to that key's sensible default; the ⇅ flips
  it. Nulls always last in both directions. Default = Date added ↓ so the
  first render matches today's order. Session-only (no localStorage).
- **Bundle Include defaults (2026-09-30)**: pre-checked boxes + the server
  `BUNDLE_KINDS` fallback are `sealed` + `open`; loose/used/other stay
  available as manual picks.

- **Skip recent releases (2026-09-30, user-confirmed)**: togglable builder
  option — checkbox (default ON) + free months input (default 6), chosen over
  preset buttons; **undated items stay eligible** (blank = unknown, not
  recent — blank-not-guess) rather than being excluded too. The rule is a
  hard filter inside `generateBundle` (applies to the anchor as well →
  `ANCHOR_TOO_RECENT`; picker filtered client-side), generation-time only —
  nothing stored on the bundle, and the create route never re-checks (it
  persists previewed lines that were already filtered).

- **eBay fill matching (2026-09-26, user-confirmed)**: auto-suggest +
  confirm (dropdown preselected from the listing-draft title, never
  auto-applied) over fuzzy auto-match; sync-first with fallback to the
  last-synced row (`_synced: false`) over failing hard when eBay is down.
  Shipping unknown on a listing (null) = keep the stored value (manual
  entries win); present (incl. 0) = overwrite. Status is never touched by
   the fill. `listings.shipping_cents` parsed during sync (branch A,
   probe-verified 12/13) rather than a per-item GetItem call.

- **Release-date sources round 2 (2026-09-26, user-picked scope)**: Pokémon
  fully automatic via the official press schedule (chosen over one-off
  fills); Topps = seed `upc_catalog` once (chosen over brittle multi-hop
  calendar scraping: GTIN → eBay title → ripped.topps.com). Resolver checks
  the catalog BEFORE any network source; `pokemon_schedule` must match ALL
  item tokens and agree on ONE date else blank (blank-not-guess retained).
- **Build around an item (2026-09-26, user-confirmed)**: one toggle doing
  double duty — `anchorItemId` + `dominant:true` = **anchor mode** (bundle
  led by the picked item, fillers ≤ half its value), `dominant:false` =
  **include mode** (plain mix with the item guaranteed in). The anchor
  bypasses the 60% single-unit rule (user: "Bypass the 60% rule") and pins
  the bundle to its own game group. Generate route only — `POST /api/bundles`
  never takes it (the builder always persists previewed lines).
- **Bundle display names (2026-09-26)**: everywhere live shows the linked
  eBay listing's title (`ebayTitlesForBundles`); DB `bundles.name` and
  sale-history rows keep the generated name — a one-off display layer, not
  a rename. Status dot dropped; status word moved after `created {date}`.
- **Draft contents (2026-09-26)**: `•` bullets sorted unit-value desc
  (line-total tie-break); drafts never auto-regenerate — explicit
  **Regenerate** button with confirm, persisted only via Save draft.
- **Artwork enlarge on click only (2026-09-26, user)**: hover popover
  removed ("hovering causes too much issues"); lightbox + `s-l1600`
  upscale stay.

- **Release-date sources (2026-09-25)**: eBay is NOT one — live probing
  proved Browse summaries return no `localizedAspects` (0/10, with/without
  `fieldgroups=PRODUCT`) and TCG listing details only carry year-only
  "Year Manufactured"; the dead aspect code was stripped from `pricing.ts`.
  For Secret Lairs the user picked "Probe mtg.wiki first" over guessing;
  the membership-verified lookup passed (21/28 + suffix fallbacks) and is
  now the implementation. **Blank-not-guess**: anything unresolvable
  (Pokémon/Topps/Yu-Gi-Oh, Secret Lairs whose owning pages disagree) stays
  manual rather than risking a wrong date.
- **Inventory visibility (2026-09-25, user-confirmed via picker)**: sold-out
  rows stay in the DB and are hidden behind a "Show out of stock (N)" toggle
  (chosen over literal permanent hiding — rows must stay editable/restockable);
  pause = inventory-only (sale dropdown + bundle gen still exclude paused).
- **Bulk predicate = value/picture blank, not price_checked_at**: catches
  items that were checked but never priced, in line with the user's original
  wording ("don't have a price/picture"). Manual values protected per item
  (see `withoutManualValue`).
- **Names memory on scan = the saved inventory row** (user picked this over
  sticky last-typed): no cross-product leakage; multi-deck barcodes prefill
  the first row's name (the "Will save as…" preview shows what you're about to
  save).
- **Quantity is not remembered** (user reversed the earlier request twice):
  default 1 on new scan, resets to 1 after add. No localStorage involved.
- **Date acquired**: editable `YYYY-MM-DD` in the item form; scan-created rows
  stamp the scanner's local date (client sends `localToday()`, server falls
  back to UTC today); existing rows backfilled to `created_at::date`. In POST
  /api/inventory: an explicit `null` (form cleared) stays null; a caller that
  omits the field entirely gets today.
- **Canvas/stepper/min widths**: use Tailwind classes in `globals.css`;
  review built classes before editing.

- **Price/integer input fix scope (2026-10-12, user-picked via Q&A)**: fix
  the shared `NumberDollars` (the reported bug — digits coming back when
  editing a product's price) **and** the sibling integer inputs (item-form
  Quantity, sale Quantity, adjust-stock delta — user chose "Also fix integer
  inputs"), **and** close the `quantity` PATCH persistence gap (user chose
  "Include: persist quantity": absolute value in the form, delta logged as
  `item_movements` reason `adjust`, note "Edit form", per the AGENTS ledger
  rule). Approach = raw text draft + parse-on-change/format-on-blur (the
  requirement explicitly preferred a temporary text representation over
  per-keystroke currency formatting).

## Files Changed (2026-10-12, later: price/integer input fix — committed `9d93b0b`)

- `src/lib/number-input.ts` (NEW) — pure draft helpers: `MAX_INT`,
  `formatCents`, `sanitizeMoneyDraft`, `parseMoneyCents` (exact integer
  math, half-up third decimal + carry, int4 clamp), `formatInt`,
  `sanitizeIntDraft` (signed, 9-digit cap), `parseIntDraft`.
- `src/components/ui/Modal.tsx` — `NumberDollars` rewritten: internal text
  draft (formatted once on mount, verbatim while typing, `NN.NN` on blur),
  per-keystroke `sanitizeMoneyDraft`/`parseMoneyCents` emission, echo-aware
  `useEffect` prop sync (external changes land; own emissions + the
  null→0 coercion don't). New `NumberInt` export (same pattern; `min`
  normalizes an empty blur; `signed` keeps `-` typable — no inputMode when
  signed, `inputMode="numeric"` otherwise).
- `src/components/ItemForm.tsx` — quantity state → `number | null`,
  input → `<NumberInt min={0}>`, save body `quantity: Math.max(0, quantity ?? 0)`.
- `src/components/SalesClient.tsx` — quantity state → `number | null`,
  input → `<NumberInt min={1}>`, submit `quantity: Math.max(1, quantity ?? 1)`.
- `src/components/InventoryClient.tsx` — `adjustDelta` → `number | null`,
  input → `<NumberInt signed>`, confirmAdjust `delta: adjustDelta ?? 0` +
  reason `(adjustDelta ?? 0) > 0`.
- `src/app/api/inventory/[id]/route.ts` — PATCH accepts `quantity`
  (integer ≥ 0, else 400) → `next.quantity`; after the update, a changed
  quantity inserts an `item_movements` row (delta, reason `adjust`, note
  "Edit form") BEFORE the `recordPriceHistory` early-return.
- `scripts/probe-number-inputs.ts` (NEW) — 46 assertions over the helpers
  (format, sanitize incl. locale comma/thousands sep, intermediates,
  rounding/carry, clamps, the old deletion chain, signed ints); non-zero
  exit on failure.
- `AGENTS.md` — API-conventions bullet: the raw-text-draft rule for
  money/integer inputs (+ probe); `quantity` gotcha now documents the PATCH
  path + ledger row.
- `SESSION.md` — this file (Problem 9 marked resolved, new Problem 19,
  Next Steps reshuffled).

## Files Changed (2026-10-12, sealed price lookup for subcategories — committed `ee8b720`)

- `src/lib/ebay/pricing.ts` — plural tolerance in `titleMatches` (via `makeTokenRegex` + `PLURALIZABLE_UNITS`; pack/packs etc. but hanger singular-only); new `isSinglePackVariant` (pack or hanger+booster, exempting box-like in sub); new `PACK_UNIT_EXCLUSION_PATTERNS`; updated `keepClean` to apply them for pack variants; extended `QUANTITY_PATTERNS`; refreshed comments, `searchActive`/`matchingPool` and top docstring.
- `scripts/probe-pricing-filters.ts` (NEW) — pure `keepMatching` regression tests for "Play Booster Pack", "Hanger Booster", "Set Booster Pack" + counters (box subs, plurals, singular). All green.
- `AGENTS.md` — updated eBay pricing section (pack-format variants, Hanger Booster handling, plural rules, new probe).

## Files Changed (2026-10-11, theme + dashboard + artwork — committed `8f9a964`)

- `src/app/globals.css` — `@custom-variant dark`, `color-scheme`,
  dark variants on `body` + all component classes, indigo → blue-700,
  `badge-indigo` → `badge-blue`.
- `src/app/layout.tsx` — inline `THEME_INIT` no-flash script.
- `src/components/ThemeToggle.tsx` (NEW) — sun/moon toggle.
- `src/components/Nav.tsx` — logo v1/v2 imgs, Dashboard tab visible,
  ThemeToggle, blue + dark utilities.
- 19 themed files (dark sweep + manual): `(auth)/*`, `privacy`,
  `bundles` pages, `BarcodeScanner`, `BundleBuilder`,
  `BundleDetailClient`, `CardSearchInput`, `InventoryClient`,
  `ItemForm`, `ListingsClient`, `PriceHistoryModal`, `SalesClient`,
  `ScanClient`, `SettingsClient`, `ui/Modal`, plus `page.tsx` (full
  rewrite below).
- `src/lib/dashboard-metrics.ts` (NEW) — pure trend/mover/attention/
  game/listing/total math (see What We Did item 6).
- `src/lib/release-art.ts` (NEW) — `fetchReleaseArtwork` (6h cache,
  negatives cached, MTG-only).
- `src/lib/releases.ts` — `UpcomingRelease.imageUrl` + artwork sourcing
  (What We Did item 11): `cleanImageUrl` (https-only + entity unescape),
  `infoboxImageFile` (wikitext `|image =` extraction), batched
  `resolveFileUrls` (one `prop=imageinfo&iiurlwidth=640` call per 40
  titles → `files.mtg.wiki` thumbs), `fetchPokemonProductImage` (product
  page `productLogo`, 6h per-URL cache incl. negatives, signed URL used
  verbatim).
- `src/lib/types.ts` — `ScryfallCard.image_uris.art_crop?`.
- `src/components/dashboard/` (NEW): `DashboardCard`, `Sparkline`,
  `Greeting` (client), `MetricCards`, `NeedsAttention`,
  `RecentlyAdded` (client), `UpcomingReleases` (featured panel uses
  `ReleaseImage`; "Coming up" rows show 40px thumbs when `imageUrl`
  exists), `InventoryByGame`, `MarketPulse`, `RecentSales`,
  `InventoryHealth`, `icons.tsx`, **`ReleaseImage`** (client — img →
  `onError` → branded gradient placeholder, state resets on `src`
  change).
- `src/app/(app)/page.tsx` — full rewrite (What We Did item 9); featured
  art priority = `featured.imageUrl ?? fetchReleaseArtwork(...)`.
- `scripts/probe-releases.ts` — prints each row's image status + URL
  (live run: **14/14 IMG, 0 errors**).
- `public/goodwhilly-logo-v1.svg` + `-v2.svg` (canonical copies;
  `dashboardpagetemplate.png` sits at the root as the design reference).
  Pre-commit cleanup: root logo duplicates (byte-identical) and a
  `dashboardpagetemplate.png:Zone.Identifier` junk file were removed.

## Files Changed (2026-10-05, Random/Pre-built builder — committed `c65df80`, docs `009680d`)

- `src/components/BundleBuilder.tsx` — mode state + "How to build" segmented
  pair; random-only controls + preview card conditionally rendered; Bundle
  price card binds per-mode; prebuilt state/derived values/handlers
  (`selected`, `invQuery`, `prePrice`(+`edited`), `selectedItems`,
  `contentsCents`, `unitCount`, `derivedPriceCents`, `priceForSummary`,
  `prebuiltSuggestedName`, `pickCap`, `switchMode`, `addSelected`,
  `setQty`, `removeSelected`, `pickerItems`); new "Your bundle" card
  (selected-line steppers/Remove/Clear all + Add-items search list + live
  summary + name + Create) and `createPrebuilt()`.
- `src/app/api/bundles/route.ts` — POST accepts `listingPriceCents`
  (`null` | integer ≥ 0 cents) → `listing_price_cents` on insert; generic
  `STALE_PREVIEW` message; JSDoc.
- `AGENTS.md` — "Builder modes" bullet + Actual Listing Price seeding note.
  `SESSION.md` — this file.

## Files Changed (2026-10-01, committed `aed2ccb` = eBay draft copy buttons)

- `src/components/BundleDetailClient.tsx` (+59/−2) — new
  `copyDraftText(text, label)` helper (clipboard write → `flash("Copied
  title"/"Copied description")`, catch → "Couldn't copy — select the text
  manually"); Title + Description label rows each wrapped in
  `flex items-start justify-between` with a right-aligned icon-only button
  (`h-7 w-7 rounded-md text-slate-400 hover:bg-slate-100 hover:text-slate-700`,
  feather clipboard glyph, `title`/`aria-label` = "Copy title"/"Copy
  description") copying `draft.title` / `draft.description`.
- `AGENTS.md` — "Listing draft text" bullet (copy-icon sentence).
  `SESSION.md` — this file.

## Files Changed (this session — 2026-09-30 later: bundle contents editor, committed `2954679`)

- `src/lib/bundle-contents.ts` (NEW) — `ContentsError` (message + status +
  code) + `contentsApiError` mapper for the routes; ops `addLine` /
  `patchContentsLine` / `removeContentsLine` / `bundleWithItems`; helpers
  `loadBundle`, `assertEditable` (`draft`/`allocated` only), `loadLine`,
  `readItem`, `assertEligible`, `assertQuantity` (1..99),
  `assertCopyCap` (via `bundleCopyCap`), `lineForItem`, `changeStock`,
  `writeLine` (upsert + snapshot refresh when priced), `restoreLine`,
  `setAllocation` (ONE allocated row per bundle+item = line quantity, 0 →
  released), `logMovement` (`reserve`/`release`), `recomputeTotal`,
  `runUndo` (per-op undo stack — no transactions).
- `src/app/api/bundles/[id]/items/route.ts` (NEW) — POST `{ itemId,
  quantity }` → add/merge line, returns the full bundle.
- `src/app/api/bundles/[id]/items/[bundleItemId]/route.ts` (NEW) — PATCH
  `{ newItemId?, quantity? }` (swap and/or qty change in one op) + DELETE
  (remove the line); both return the full bundle.
- `src/lib/bundle.ts` — new export `bundleCopyCap(valueCents)` ($20+ → 1,
  cheaper ≤ 5); private `maxUnits` now calls it (generator behavior
  unchanged); shared with the server editor + the client picker clamp.
- `src/components/BundleDetailClient.tsx` — state `inventory` (fetched
  lazily from `/api/inventory` on first editor open), `editor`
  (`ContentsEditor` add/edit), `invQuery`, `contentsDirty`; handlers
  `openContentsEditor` / `applyEditor` / `removeContentsLine` /
  `unitsInBundle`; derived `editable` / `editLine` / `picked` /
  `editorUnchanged` / `editorMaxQty` (stock + cap clamp) / `candidates`
  (search over active + in-stock + priced, name/UPC/set, capped 80); one
  shared editor card (search input, picker list with thumbs/meta/`×N in
  bundle`/disabled at cap, −/+ stepper, live line total with "was $X" on a
  swap, Add/Substitute/Update-quantity Apply); Contents header "+ Add
  item"; per-line **Edit**/**Remove** buttons (unlisted only); amber draft
  hint after a contents change.
- `scripts/probe-bundle-contents.ts` (NEW) — 51-assertion e2e probe (11
  scenario groups) over self-created "ZZ probe" rows, cleanup in `finally`
  (items cascade their movements); admin client + stub realtime transport
  (Node 20, no native WebSocket); non-zero exit on failure.
- `AGENTS.md` — money-paths entry for the contents routes + "Contents
  editing before listing" bullet in the bundle section. `SESSION.md` —
  this file.

## Files Changed (committed `378dbe4` = bulk-action split)

- `src/app/api/inventory/refresh-price/route.ts` — `scope: "all"` shares the
  `unpriced` branch (no `.or()` filter, `price_checked_at ASC NULLS FIRST`
  order, 50-row cap); JSDoc documents it.
- `src/components/InventoryClient.tsx` (+110/−72) — calendar button removed;
  `postBulk` / `mergeHistory` / `refreshDatesAndPrices` / `refreshAllPrices`
  replace `refreshReleaseDates` / `refreshUnpriced`; ⟳ + 💲 button blocks;
  `bulkBusy` → `"dates" | "prices"`.
- `AGENTS.md` — route bullet (both scopes + which button drives which),
  release-date bulk reference (calendar icon → ⟳ phase 1), layout-bullet
  actions unit.
- `SESSION.md` — this file.

## Files Changed (committed `7d49f48` = inventory layout round 2)

- `src/components/InventoryClient.tsx` (+103/−95): header summary right +
  gold pill, "(filtered by current view)" removed; color-key card right
  cluster (`Show out of stock` conditional, `Locations`, kind `<select>`);
  toolbar `ml-auto` actions unit (calendar `IconBtn`, refresh `IconBtn`,
  `Import CSV`, hidden file input, `Export` — now `btn-secondary`).
- `AGENTS.md` — inventory-page-layout bullet rewritten for the new rows; the
  refresh-price and release-date bulk bullets retargeted from "Inventory
  header" to the toolbar icon button.
- `SESSION.md` — this file.

## Files Changed (2026-09-30 later: `4fe6a49` + inventory sort & page layout, committed `28f1bb7`)

- **`4fe6a49`** default Include kinds (3 files, +3/−3, pushed):
  `src/lib/utils.ts` — `BUNDLE_KINDS` = `["sealed", "open"]`;
  `src/components/BundleBuilder.tsx` — initial `kinds` state;
  `src/app/api/bundles/generate/route.ts` — JSDoc example.
- **Inventory sorting (committed `28f1bb7` — 1 file)** `src/components/InventoryClient.tsx`:
  - `SortKey`/`SortDir` types, `SORT_OPTIONS` (7 keys + `defaultDir`),
    `SORT_DEFAULT_DIR`, `cmpStr`/`cmpNum` (nulls-last helpers),
    `sortInventory(items, key, dir, locName)` (pure, `[...items].sort`,
    sign flips the primary compare only, ties → name → id).
  - State `sortKey` (default `"newest"`) + `sortDir` (default `"desc"`).
  - `locName` moved above the `filtered` memo and wrapped in `useCallback([locations])`;
    memo now sorts and takes `…, sortKey, sortDir, locName` as deps.
  - Toolbar: `Sort` label + select + `↓`/`↑` flip button (title/aria describe
    the direction), directly after the location select (the later layout
    rework moved "Locations" into the header).
- **Inventory page restructure (committed `28f1bb7` — same file, on top of
  sort)** `src/components/InventoryClient.tsx`:
  - Header: left group = h1 + `+ Add item` + summary `<p>` (`hidden sm:block`,
    `truncate`); right group = calendar `IconBtn` (fill dates) + refresh
    `IconBtn` (browse active) + `Locations` button.
  - `IconBtn` now takes `disabled?` (+ `disabled:pointer-events-none
    disabled:opacity-40`) and `badge?` (indigo `-right-1.5 -top-1.5` pill,
    rendered when > 0); cards unchanged.
  - New `bulkBusy: "dates" | "price" | null` state set/cleared in
    `refreshReleaseDates`/`refreshUnpriced` (both also still flip `busy`).
  - Color-key card: summary `<p>` removed, kind `<select>` (`max-w-40
    w-auto`, `aria-label`) added on the right; toolbar pill group, `Locations`
    and `+ Add item` removed; search input gained `min-w-0`.
- `AGENTS.md` — inventory-sorting sub-bullet (after "Inventory visibility") +
  new inventory-page-layout sub-bullet + refreshed "Browse active"/"Fill
  release dates" references + the `BUNDLE_KINDS` default note in the bundle
  section. `SESSION.md` — this file.

## Files Changed (this session — 2026-09-30, committed `9ec5b44`)

- `src/lib/bundle.ts` — `releaseCutoffISO(months)` + `isExcludedByReleaseDate`
  (exported); `BundleGenOptions.excludeReleasedWithinMonths?`; `generateBundle`
  applies the window first in the eligible filter (before the anchor's 60%
  exemption) + JSDoc.
- `src/app/api/bundles/generate/route.ts` — parses
  `excludeReleasedWithinMonths`, anchor date pre-check (409
  `ANCHOR_TOO_RECENT`), `skippedRecent` count in the response, window note on
  the failure 409, opts forwarded, JSDoc.
- `src/app/api/bundles/route.ts` — legacy no-`lines` path reads + forwards the
  same flag; POST JSDoc.
- `src/components/BundleBuilder.tsx` — `skipRecent` (default on) +
  `recentMonths` ("6") state, `releaseCutoff` memo, checkbox **Skip recent
  releases** + months input under "Include", anchor picker date filter (rides
  the existing `anchorValid` auto-clear), generate body, `Preview.
  skippedRecent?` + "· N recent items skipped" note.
- `scripts/probe-bundle-dupes.ts` — `mk()` takes a `release_date`;
  `runReleaseWindow()` + fixture (5 recent / 5 old / 3 undated); stats
  printed; non-zero exit on any violation.
- `AGENTS.md` — "Skip recent releases" bullet + probe description.
  `SESSION.md` — this file.

## Files Changed (2026-09-26 later commits: `66fd101` / `e3ee03e` / `c03a8c5` / `154f8b0` / `7f6c738`)

- **`66fd101`** bundle names/status (6 files, +69/−21):
  - `src/lib/bundle.ts` — `ebayTitlesForBundles(supabase, ownerId, ids)`
    (type-only supabase import) → map of `ebay_listing_id` →
    `listings.title`.
  - `src/app/(app)/bundles/page.tsx` — status dot removed, status word
    after `created {date}`, visible name = linked title (truncated 60);
    `listingLabel` loses the redundant "listed" token (keeps `ship $Y`).
  - `src/app/(app)/bundles/[id]/page.tsx` — detail h1 = linked title.
  - `src/app/(app)/page.tsx` — dashboard "Reserved in bundles" names.
  - `src/app/(app)/sales/page.tsx` + `src/components/SalesClient.tsx` —
    sale-form dropdown options carry `display_name` (linked title).
- **`e3ee03e`** draft fixes (2 files, +42/−6):
  - `src/components/BundleDetailClient.tsx` — mount `/api/drafts` also
    `setDraft({title, description})` (correct "Edit listing draft" label on
    revisit); **Regenerate** button in the draft editor (confirm →
    `generateListingText(bundle.items)` → local state; Save draft persists).
  - `src/lib/bundle.ts` — `generateListingText` emits `•` bullets sorted
    unit-value desc.
- **`c03a8c5`** build around an item (5 files, +320/−35):
  - `src/lib/bundle.ts` — `BundleGenOptions.anchorItemId`; 60% filter
    exempts the anchor; empty result when the id is absent from `items`;
    `dominantBundle(..., fixedAnchorIndex)`; `mixBundle(..., anchorIndex)`
    seeded into the trial + fallback; `buildBundleAcrossGames` resolves the
    anchor first and pins its game group.
  - `src/app/api/bundles/generate/route.ts` — `anchorItemId` validation
    (eligibility query → 409 `ANCHOR_NOT_ELIGIBLE`; explicit `game`
    contradiction → 409 `ANCHOR_GAME_MISMATCH`; unknown id → 409), passes
    `dominant` + `anchorItemId` through, JSDoc.
  - `src/components/BundleBuilder.tsx` — `allItems`/`anchorId`/`anchorMode`
    state, live-filtered "Build around item" picker (auto-clears when
    filters exclude it), Anchor-it/Just-include radios swap the dominant
    checkbox when a picker item is chosen, generate body.
  - `scripts/probe-bundle-dupes.ts` — `runAnchor` scenarios (anchor
    presence + first-line/tier in anchor mode, include-mode presence, 60%
    bypass with an oversized anchor).
  - `AGENTS.md` — anchor bullet + generate-route contract.
- **`154f8b0`** release dates Pokémon/Topps (4 files, +192/−31):
  - `src/lib/releases.ts` — `PokemonScheduleRow` + exported
    `fetchPokemonSchedule()` (full `period=All` table incl. past, own 6h
    cache, never caches an empty parse); `fetchPokemonReleases` consumes it
    and still drops `date < today`.
  - `src/lib/release-dates.ts` — `ReleaseDateItem { upc? }`; sources
    `upc_catalog` | `pokemon_schedule`; `lookupCatalogDate` (plain REST —
    `createAdminClient` throws under Node 20/tsx — caches only non-null);
    `pokemonTokens`/`lookupPokemonScheduleDate` (all tokens + one date,
    early-return before Scryfall); resolver order: loose→card, set_code→set,
    upc→catalog, sealed/open: SL wiki / Pokémon schedule / set name.
  - `scripts/probe-release-dates.ts` — selects `upc`, labels the two new
    sources.
  - `AGENTS.md` — resolver + releases-calendars bullets updated.
  - Data (not files): `upc_catalog` 3 Topps UPCs seeded `2026-04-15`; all 6
    item dates filled via the refresh-price route by the user.
- **`7f6c738`** hover removal (1 file, +5/−29):
  - `src/components/ArtworkThumb.tsx` — `canHover`/`hovering`/popover
    deleted; click/tap lightbox + `enlargeImageUrl` kept.
- `SESSION.md` — this file.

## Files Changed (committed `6ca69d9` = eBay auto-fill)

- `supabase/migrations/0012_listings_shipping.sql` (new) — nullable
  `listings.shipping_cents int`, idempotent. **Applied by the user**
- `scripts/probe-trading-shipping.ts` (new) — read-only probe: decrypts the
  stored eBay token (AES-GCM `enc:` + refresh-grant fallback), calls
  GetMyeBaySelling, greps ActiveList XML for shipping tags → confirmed
  branch A (12/13 items carry `ShippingServiceCost`).
- `src/lib/ebay/listings.ts` — `TradingItem.shippingCents`; `parseTradingItem`
  extracts the first `ShippingServiceCost` via `extractPriceCents`; sync
  `payload` includes `shipping_cents`.
- `src/app/api/bundles/[id]/ebay-fill/route.ts` (new) — POST: sync
  (best-effort) → linked listing lookup (409s) → writes
  `listing_price_cents`/`shipping_cents` (shipping only when the listing
  carries one); returns bundle + `_synced` + title/URI; never touches status.
- `src/app/api/bundles/[id]/route.ts` — PATCH now accepts `ebayListingId:
  null`/`""` to unlink (`"ebayListingId" in body` check instead of truthy).
- `src/components/BundleDetailClient.tsx` — "eBay listing" card (loads
  `/api/listings` ACTIVE + `/api/drafts`; `suggestListing` draft-title
  scorer; select preselected with `(suggested)`; Link & fill / Refresh /
  Unlink / open-on-eBay), `fillFromEbay`/`unlinkListing` handlers, info-line
  `showPriceLine` gap fix (listed/sold with nulls now show dashes + Edit).
- `AGENTS.md` — migration `0012` note, `listings` table shipping note,
  auto-fill bullet, sync parse note. `SESSION.md` — this file.

## Files Changed (committed `e7aa06d` = Actual Listing Price / Shipping Fee)

- `supabase/migrations/0011_bundle_listing_fields.sql` (new) — nullable
  `bundles.listing_price_cents` + `bundles.shipping_cents`, idempotent.
  **Applied by the user** (REST-verified 2026-09-26).
- `src/lib/types.ts` — `Bundle.listing_price_cents` / `shipping_cents`.
- `src/app/api/bundles/[id]/route.ts` — PATCH accepts `listingPriceCents`/
  `shippingCents` (null clears; integer ≥ 0 cents else 400), applied to the
  update map; JSDoc updated.
- `src/components/BundleDetailClient.tsx` — "Mark listed" opens the panel
  (`listingPanel` "list"/"edit", `NumberDollars` × 2 labeled "Actual
  Listing Price"/"Shipping Fee", price prefilled `bundlePriceCents(total)`),
  `saveListing(markListed)` PATCHes status + values (edit mode re-sends the
  current status); info line + **Edit** button when either value is set.
- `src/app/(app)/bundles/page.tsx` — maps the new columns; bold price =
  actual when set, `listed · ship $Y · $X value` label (`listingLabel`).
- `src/components/SalesClient.tsx` — bundle `<select>` prefill: picks with
  non-null `listing_price_cents`/`shipping_cents` set Gross/Shipping.
- `AGENTS.md` — migration `0011` note, `bundles` table line, listing-price
  bullet. `SESSION.md` — this file.

## Files Changed (committed `4f376b5` = bundle preview fix; docs `e533545`)

- `src/app/api/bundles/route.ts` — new `resultFromLines()` helper (validates
  `{ itemId, quantity }[]`, merges dup ids, re-fetches owner-scoped rows,
  enforces active/stock/`value_cents > 0` + dup caps ($20+ → 1, <$20 →
  ≤ min(5, stock)), builds the result from **DB** money); POST branches: with
  `lines` → persist as previewed (`target_value_cents` from `targetValueCents`,
  `targetCents ≥ $5` check skipped), without → legacy generate path; failures
  → `409 STALE_PREVIEW` (or `400` malformed / `500` DB).
- `src/components/BundleBuilder.tsx` — `create()` now sends `lines`
  (preview item ids + quantities), `targetCents: preview.priceCents`,
  `targetValueCents: preview.targetCents`; dropped `kinds`/`dominant`/`game`.
- `AGENTS.md` — bundle-generate bullet (lines contract + STALE_PREVIEW) and
  discount bullet (target_value_cents source) updated.
  `SESSION.md` — this file.

## Files Changed (committed `524e903` = product release date)

- `supabase/migrations/0010_item_release_date.sql` (new) — nullable
  `items.release_date date` + `upc_catalog.release_date date`, idempotent.
- `src/lib/types.ts` — `Item.release_date`, `CatalogEntry.release_date`,
  `ScryfallCard.released_at`.
- `src/lib/scryfall.ts` — `cardFromJson` maps `released_at`;
  `getSetReleaseDate(code)`; **`findSetForProduct(name)`** — 6h-cached
  `/sets`, conservative product-line→set matcher (exact → set-contains →
  token-subset; token/promo/memorabilia/alchemy filtered; unique main-set
  candidate or blank; `Secret Lair*` excluded).
- `src/lib/secret-lair.ts` (new) — `lookupSecretLairDate(itemName)`:
  membership-verified mtg.wiki superdrop lookup (phrase search with
  `intitle:"Secret Lair"`, title gate `Superdrop|Drop Series|Commander
  Deck` + `Secret Lair/…` hub exclusion, verbatim wikitext membership,
  all owners must agree on one date; 6h wikitext + phrase caches with
  negatives).
- `src/lib/release-dates.ts` (new) — `resolveReleaseDateDetailed`
  (returns `{date, source, detail}` for the probe) + `resolveReleaseDate`
  (date-only, used by the route): loose card → set_code → SL-wiki / set
  match.
- `src/lib/ebay/pricing.ts` — release-aspect code REMOVED after live probing
  (search summaries have no `localizedAspects`; TCG details only have
  "Year Manufactured"); pricing/art behavior untouched.
- `src/app/api/inventory/refresh-price/route.ts` — imports the resolver from
  `release-dates`, `cacheCatalogReleaseDate` (blank-fill on `upc_catalog`),
  release date rides along in `priceOne` when blank, new `{ scope:
  "no_release_date" }` bulk mode (≤50, per-product dedupe, prices
  untouched), single/bulk responses cache the catalog date.
- `src/app/api/inventory/route.ts` + `[id]/route.ts` — POST/PATCH accept and
  `getDateOnly`-validate `release_date` (explicit null clears).
- `src/app/api/scan/route.ts` — new rows inherit `existingCatalog.release_date`;
  stock update backfills a blank item date from the catalog; catalog upserts
  never touch `release_date`.
- `src/app/api/scryfall/search/route.ts` + `src/components/CardSearchInput.tsx`
  — search results carry `released_at` for form prefill.
- `src/components/ItemForm.tsx` — "Released" date input (edit prefill, blank
  allowed, `applyCard` prefill from the picked card).
- `src/components/InventoryClient.tsx` — card "Released {formatDate}" line
  (omitted when blank), `undatedCount` memo, "Fill release dates (N)" header
  button → `scope: "no_release_date"`.
- `src/components/ScanClient.tsx` — catalog card "Released …" line +
  matched-inventory rows append `· Released …`.
- `scripts/probe-bundle-dupes.ts` — `mk()` fixture gained `release_date: null`.
- `scripts/probe-release-dates.ts` (new) — set-code / card-name modes +
  **`--inventory`** (runs the production resolver over every item, prints
  each pick + source).
- `AGENTS.md` — migration `0010` note, tables line, release-date conventions
  bullet (resolver sources + matcher rules + probe), Scryfall
  `getSetReleaseDate`/`findSetForProduct`.
  `SESSION.md` — this file.

## Files Changed (2026-09-25, committed `26e3c0c` = inventory visibility)

- `src/app/(app)/inventory/page.tsx` — SSR query: dropped `.eq("active", true)`.
- `src/app/api/inventory/route.ts` — GET returns all owner rows; removed the
  `includeInactive` param + active filter (JSDoc updated).
- `src/components/InventoryClient.tsx` — removed `showInactive`/“Show paused”
  checkbox + `includeInactive` param; new `showZero` state, `zeroCount`
  memo, `filtered` drops `quantity <= 0` unless toggled; toolbar "Show out of
  stock (N)" checkbox (only when N > 0); paused card = red ring/border +
  overlay subtitle "hidden from store"; legend line updated.
- `src/app/(app)/sales/page.tsx` — sale-form item query adds
  `.gt("quantity", 0)`.
- `src/components/BundleBuilder.tsx` — game-label derivation filters
  `active && quantity > 0` (GET is now unfiltered; server routes already
  require it).
- `AGENTS.md` — inventory-visibility bullet under API conventions.
  `SESSION.md` — this file.

## Files Changed (2026-09-24 sessions, committed `7b6a1bf` = dominant-anchor)

- `src/lib/bundle.ts` — `BundleGenOptions { dominant? }` (default true);
  `generateBundle` routes to new `dominantBundle` (top-5 weighted anchor,
  ≤50%-of-anchor fillers, anchor-first/value-desc order, anchor+greedy
  fallback) or `mixBundle` (previous behavior, extracted); shared
  `trialScore`/`toLines`/`lineTotal`; `buildBundleAcrossGames(..., opts)`.
- `src/app/api/bundles/generate/route.ts`, `src/app/api/bundles/route.ts` —
  `const dominant = body?.dominant !== false;` passed as `{ dominant }`.
- `src/components/BundleBuilder.tsx` — `dominant` state (default true) +
  "One dominant item" checkbox under Include kinds; flag sent on generate +
  create.
- `scripts/probe-bundle-dupes.ts` — runs both modes; keeps hard dup/cap
  checks; adds dominant anchor stats (anchor-first %, fillers ≤50% %, avg
  anchor share).
- `AGENTS.md` — composition-modes bullet, probe/routes notes updated.
  `SESSION.md` — this file.

(Committed earlier this session: `94528d0` price history, `89ac676` bundle
discount, `24de6a9` bundle duplicates — see "What We Did" items 4–6.)

## Files Changed (previous session)

- `src/lib/ebay/pricing.ts` — word-boundary matching; `matchingPool`,
  `pickBestImage`/`scoreTitle` exported; GTIN-first pools; `resolveNameImage`/
  `resolveVariantImage` take optional `gtin`; `open` kind priced on
  sealed-condition listings; trimmed SINGLE_HINTS.
- `src/app/api/inventory/refresh-price/route.ts` — `priceOne` helper,
  `{ scope: "unpriced" }` bulk mode (value/picture predicate, cap 50, dedupe
  cache, per-item try/catch), `withoutManualValue`, `maxDuration = 120`.
- `src/app/api/ebay/price/route.ts` — `open`-kind price gate (sealed pipeline).
- `src/components/InventoryClient.tsx` — "Browse active (N)" header button +
  `unpricedCount`/`refreshUnpriced`; subtitle removed; summary merged into the
  color-key card; count predicate = `value_cents == null || !image_url`.
- `src/components/Nav.tsx` — tabs merged into the header row; standalone tab
  bar removed; `NavLink` got `px-2.5 whitespace-nowrap`.
- `src/components/ScanClient.tsx` — name/sub prefill from saved row;
  `−`/`+` quantity stepper; `setDelta(1)` on new barcode lookup and after add.
- `src/components/ItemForm.tsx` — UPC row shown for `open` kind (earlier sesh
  carryover into `a4706e1`).
- `scripts/probe-image-picks.ts` (new) — inspect kept pool for a name/gtin.
- `scripts/backfill-variant-art.ts` — covers `kind in.(sealed,open)`, passes
  `upc` to resolvers.
- `AGENTS.md` — updated: GTIN-first matching strategy, bulk refresh scope,
  open-kind pricing.
- `SESSION.md` — this file.

## Important Technical Details

- Commands: `npm run dev` / `typecheck` / `lint` / `build` / `db:types`.
  Verify every change with typecheck+lint; build only with dev stopped.
- Kinds: `sealed | loose | open | used | other` (`ITEM_KINDS`, `src/lib/utils.ts`).
  `open` uses the sealed eBay pricing/art pipeline; only `loose` prices via
  Scryfall; `used`/`other` are manual-only.
- Bulk refresh dedupe key = `upc|name`; item rows share a UPC+name merge
  smoothly; `normalizeName` (lower/trim) is the duplicate-compare convention.
- Money: cents on the wire/DB; `primaryCents` = p25 (25th pct of the
  IQR-trimmed pool) with median/mean fallback, every source.
  `withoutManualValue` protects only null/`manual` price_source — auto
  (browse_active/insights/scryfall) values refresh in place on row refresh.
  `price_checked_at` is set on every refresh even
  when no value is found (source `manual`).
- Marketplace Insights still 403 → auto fallback to `browse_active`.
- Script env pattern (Node 20): `supabase-js createClient` fails (no native
  WebSocket) — use raw REST headers `apikey`/`Authorization` and parse
  `.env.local` manually (see `scripts/backfill-variant-art.ts`;
  `release-dates.ts`'s catalog lookup follows it on purpose so probes and
  the Next.js route can share the resolver).
- Route probes for sanity: dynamic `[id]` routes must return 401/405 JSON,
  never bare 500.
- Release artwork sources (2026-10-11): mtg.wiki has **NO PageImages /
  REST summary extensions** (both probed) — artwork is the infobox
  `|image =` file resolved by ONE batched `prop=imageinfo&iiurlwidth=640`
  call per 6h fill; the Pokémon press CDN URLs are **SIGNED (`sky=`
  hash — editing ANY param returns 403)** so they are used verbatim at
  the served 240px. Both image phases are fail-soft: a failure leaves
  `imageUrl` null → `ReleaseImage` shows the branded placeholder. Images
  ride the existing in-memory 6h calendar cache — never fetched per page
  load, no DB table.
- Theme/primary: `badge-indigo` no longer exists (`badge-blue`); new UI
  always gets `dark:` variants (full rule in AGENTS.md → Commands).

## Problems / Blockers

1. **Four newest commits not browser-verified** — `66fd101` (bundle
   names/status), `e3ee03e` (draft bullets/Regenerate), `c03a8c5`
   (build-around-item), `7f6c738` (click-only thumbs); typecheck/lint green.
   Checklist: bundles tab shows linked eBay titles as names (status word
   after `created {date}`, no dot), detail h1 / dashboard "Reserved in
   bundles" / sale-form dropdown likewise, unlinked bundles keep their
   generated name; builder → **Build around item** → *Anchor it* gives a
   bundle led by the picked item (line 1, fillers ≤ half its value, same
   game) — *Just include it* keeps it in every bundle; draft editor opens
   with "Edit listing draft", shows `•` bullets in unit-value-desc order,
   **Regenerate** re-rolls and only **Save draft** persists; artwork thumb
   hover → nothing, click/tap → lightbox.
2. **Actual Listing Price / Shipping Fee manual flow not browser-verified**
   — committed `e7aa06d`, migration `0011` applied: bundle detail →
   "Mark listed" → panel with **Actual Listing Price** prefilled at the
   suggested price + blank **Shipping Fee** → confirm → info line shows
   both (also for listed/sold bundles with nulls after the gap fix), bundles
   list bold = actual price with `listed · ship $Y · $X value`, **Edit**
   re-saves without status change, sale form prefills Gross/Shipping.
3. **Bundle preview==create not browser-confirmed yet** — committed
   `4f376b5` (pushed with docs `e533545`); typecheck/lint green. Generate a
   bundle → Create → open it on the Bundles tab: the lines/value/price must
   be identical to the preview; "Regenerate" must still re-randomize; a stale
   preview (item paused/sold out since) should show the inline "Inventory
   changed since this preview — regenerate the bundle." error.
4. **Release dates filled — display not eyeballed** — the fill ran through
   the real route (probe **65/70**; values + Pokémon UPC cache in the DB).
   Remaining: load the inventory card "Released …" lines, scan-page catalog
   card + matched rows, and the item form field. 5 rows stay manual by
   design: Yu-Gi-Oh, Festival in a Box, and 3 ambiguous Secret Lairs (Lasagna
   Food Token, Command Tower, Inked Foil Edition).
5. **Bundle discount + duplicates + dominant toggle not browser-exercised
   yet** — discount: generate a $100 preset → contents ≈ $111, price $100;
   create → detail/list show price · value; CSV has both rows; an old bundle
   shows price = value × 0.9. Duplicates: probe-verified (56–71% dup rate, 0
   violations); eyeball one real generate for `×N` lines on multi-copy
   under-$20 stock. Dominant: default-checked bundle leads with the priciest
   line; unchecking the box gives the old mix.
6. **Inventory visibility not browser-verified** — paused rows always shown
   (red ring + "PAUSED · hidden from store" overlay, no more Show-paused
   toggle); sold-out rows hidden unless "Show out of stock (N)" is checked
   (revealed rows keep the red `×0`); sale dropdown no longer lists 0-stock
   items.
7. **Price history not browser-verified** (migration is in; check
   sparkline/modal after a refresh or manual value edit).
8. **Dashboard releases not visually checked in a browser** — code + probe
   verified; ask the user to load the dashboard.
9. ~~**Latent bug:** `PATCH /api/inventory/[id]` ignores `quantity`~~ —
   **RESOLVED 2026-10-12** (price/integer input fix): the route now accepts
   `quantity` (integer ≥ 0 else 400) and logs the delta as an
   `item_movements` row (reason `adjust`, note "Edit form") when it changes.
   `acquired_at` was already handled. Browser-verify the save (Problem 19).
10. ~~**`npm run build` not run this session**~~ — RESOLVED 2026-10-11:
    build ran green with the dev server stopped.
11. **Temur Roar art** — the deck is now kind `open` with price + picture, but
    nobody has eyeballed whether the art is the right DECK art (it may still
    be the old multi-deck set-pack image). Optional: check on the card, or run
    `npm run backfill-art` (covers `open` now) if wrong.
12. Marketplace Insights access still pending eBay approval.
13. `EBAY_DEV_ID` still not set in Vercel (Trading-API listing sync).
14. **Skip-recent-releases committed (`9ec5b44`) but not browser-verified** —
    typecheck, lint, and probe all green; the route loads (401 JSON through
    the dev server). Remaining: browser-verify — checkbox ON (default) + 6
    months → no preview line for an item whose inventory card reads
    `Released {date}` inside the window, preview header shows "· N recent
    items skipped", undated items still appear, uncheck → recent items can
    come back, the "Build around item" picker hides recent stock, a stale
    anchor choice shows the `ANCHOR_TOO_RECENT` error, and months input
    blank/0 behaves as off.
15. **Inventory sorting + layout + bulk buttons committed (`28f1bb7`,
    `7d49f48`, `378dbe4`), not browser-verified** — typecheck + lint green
    (the one lint hit was a `useMemo` exhaustive-deps warning, fixed by
    `useCallback`-ing `locName`). Remaining: browser-check — default view
    unchanged (Date added ↓), picking a key starts it at its sensible
    default, ⇅ flips, unpriced / undated / never-checked sink to the bottom
    in BOTH directions, "Name + location" groups same-named rows by storage
    box (name stays primary), and the summary line + CSV Export follow the
    visible order; AND the layout — summary reads right-aligned in the
    header with the amount in the gold pill (and no "filtered by current
    view"), line 2 right cluster = out-of-stock checkbox (only when N > 0) ·
    `Locations` · `All types` in that order, actions unit right-aligned
    before `Import CSV` with **⟳ then 💲** (⟳ badge = undated + unpriced,
    grayed at 0+0; 💲 no badge, grayed only while busy; each spins only
    while IT runs — click ⟳ to watch it chain dates → prices with one
    combined toast, click 💲 for `Refreshed N prices` capped at 50 so run it
    twice for all 70 items), no calendar icon anywhere, `Export` styled like
    `Import CSV`, kind dropdown filters like the old pills, and `Locations`
    opens the storage panel from line 2. Also eyeball the new bundle Include
    defaults (Sealed + Open pre-checked, committed `4fe6a49`).
16. **Bundle contents editor committed (`2954679`, pushed), not
    browser-verified** —
    typecheck + lint green, all 3 routes → 401 JSON through the dev server,
    probe `npx tsx scripts/probe-bundle-contents.ts` → ALL GREEN (51
    assertions, self-cleaning). Browser checklist: open an UNLISTED bundle →
    Contents card shows **+ Add item** and per-line **Edit**/**Remove**
    (a listed/sold/cancelled bundle must show neither); Edit → search + pick
    another in-stock item → **Substitute** → the line swaps, header
    price/value update, and BOTH inventory counts move (old item up, new
    item down — check the Inventory page); the stepper's **Update
    quantity** path likewise moves stock by the delta; same item + same qty
    → Apply disabled ("No changes"); **Remove** → confirm → units return;
    a row already at its copy limit is disabled in the picker ($20+ item
    can't appear twice; cheaper items stop at 5); after a change with a
    saved draft, the amber "Contents changed — hit Regenerate" hint appears
    and Regenerate is still manual; toasts + inline server errors show
    (pause an item to see NOT_ELIGIBLE, etc.).
17. **Random/Pre-built builder modes committed (`c65df80`, pushed), not
    browser-verified** — typecheck + lint green, routes → 401 JSON
    through the dev server. Browser checklist: builder card opens on
    **Random** with the flow byte-for-byte as before (Generate → preview →
    Create); switch to **Pre-built** → Bundle from / Include / Skip recent /
    Build around / Generate all disappear, Bundle price helper text changes;
    search + Add puts an item in "Your bundle" with `×N in bundle` in the
    picker row; stepper clamps at stock and at the cap (a $20+ item stops at
    1, cheap items at 5); OOS/unpriced rows show their reason and their Add
    is disabled; paused rows don't appear at all; summary counts/contents/
    price track every change — Pre-built shows NO price block in the top
    card (just the two mode buttons) and its Bundle price input sits in the
    summary, auto-filling to 10% off contents (presets are Random-only) —
    type over it, then clear it to return to
    auto; Create → the new bundle appears on the Bundles tab with your
    price as the bold/Actual Listing Price (blank price → derived 10%-off),
    quantities dropped on the Inventory page, mixed MTG+Pokémon selection
    creates fine with the "MTG + Pokémon" name placeholder; pause/sell a
    selected item first → the row flags it client-side and Create shows the
    generalized `STALE_PREVIEW` message; link the eBay listing → Fill still
    overwrites the price; switching back to Random keeps the old flow (a
    previously generated preview is cleared by the switch).
18. **Dashboard redesign + dark mode + blue-700 + official release
    artwork COMMITTED (`8f9a964`, pushed), not browser-verified** —
    typecheck + lint + build all green. Browser checklist:
    - **Theme**: first load with no stored preference follows the OS
      (`prefers-color-scheme`); the sun/moon button flips every page
      instantly with NO flash on reload (the inline script runs before
      paint); the choice persists in `localStorage("gw_theme")`; every
      page (dashboard, inventory, scan, bundles, detail, sales,
      listings, settings, login/signup, privacy) reads correctly in
      BOTH themes — inputs, buttons, cards, tables, badges, modals,
      toasts, dropdowns; focus rings visible in dark; the header shows
      logo v1 in light and v2 in dark; the Dashboard tab is now visible
      in the nav.
    - **Blue-700 primary**: no indigo left anywhere (search the rendered
      pages for the old purple-blue); primary buttons = blue-700 light
      / blue-600 dark; the inventory bulk badges are blue.
    - **Dashboard**: greeting uses the browser's local time (afternoon/
      evening words + today's date); the 4 metric cards link to their
      pages, Value shows a trend chip + sparkline (the 30-day window
      should read "since Sep 25" — only ~17 days of history exist — and
      This Week in Market Pulse has real span); Needs Attention shows
      11 unpriced / 8 out of stock / 30 paused (no bundle rows, no
      missing-photos row, green "17 listings are active"); Inventory by
      Game donut + legend percentages agree and sum to 89; Recently
      Added shows the 6 newest rows with lightbox thumbs, names split
      on the last colon, "needs price" in amber where unpriced;
      Market Pulse gainer/dropper are honest (with ~17 days of history
      there SHOULD be movers — if both read "Needs at least two price
       points" something's wrong) or correctly muted; Upcoming Releases
       featured panel shows the release's OWN official art first (set
       logo / drop art from the wiki, per-set logo for Pokémon) with
       Scryfall `art_crop` as the MTG-only fallback and the blue gradient
       placeholder when neither resolves — Pokémon/Secret Lair names with
       no official image must NEVER show random MTG art (the Scryfall
       call is game-guarded), broken image URLs must degrade to the
       placeholder rather than a browser broken-image icon, and "Coming
       up" rows show 40px thumbs only where an image exists; Recent
       Sales shows the empty state pointing at the 17
       active listings; the Inventory health gradient card counts match
       the attention rows; mobile stacks the three columns in reading
       order without clipping.
    - Commit was made (`8f9a964` + docs) — remaining: fix anything this
      checklist turns up + refresh AGENTS.md if behavior changes.
19. **Price/integer input fix — committed `9d93b0b` + pushed, not browser-verified** —
    typecheck + lint green, `probe-number-inputs.ts` 46/46. Checklist:
    - Item edit → **Cost / unit** / **Value / unit**: Backspace and Delete
      work anywhere in the field INCLUDING the decimals (the old bug —
      digits used to reappear); select-all + retype; clear the whole field
      and type a new price; type `12.` and `12.5` and they stay put (the
      `NN.NN` format returns only on blur); caret never jumps while typing;
      save with empty/partial values → no crash, empty persists as blank,
      the reopened field shows exactly what was typed.
    - Spot-check the same in sale **Gross / eBay fee / Shipping**, random
      **Bundle price**, pre-built **Bundle price** (clearing returns the
      auto-price note), and **Actual Listing Price / Shipping Fee**.
    - **Info & price** / card pick still autofills Value with the modal open
      (external update must replace the draft).
    - Item form **Quantity**: clear → type → Save → reopen → persisted
      (Problem 9 fix) and an `item_movements` row (reason `adjust`, note
      "Edit form") appears when the quantity changed.
    - Adjust-stock: type `-5` (mobile too — signed field has no inputMode so
      the minus key is reachable) → Apply removes 5, reason `remove`.
    - Sale Quantity: typing 0 normalizes to 1 on blur (server also forces ≥1).
    - Mobile: decimal-pad comma (`12,50`) lands as `12.50`; digits delete
      normally; no caret jumping.

## Next Steps (priority order)

1. Browser-verify the price/integer input fix (Problem 19; committed
   `9d93b0b`, pushed — checklist in Problem 19).
2. Browser-verify the 2026-10-11 theme + dashboard + release artwork
   (Problem 18; committed `8f9a964`, pushed — checklist in Problem 18).
   Start the dev server first (`npm run dev`) — remember never to build
   while it runs.
3. Browser-verify the Random/Pre-built builder modes (Problem 17; committed
   `c65df80`, pushed — checklist in Problem 17).
4. Browser-verify the eBay draft copy buttons (committed `aed2ccb`,
   pushed): expand the draft → each icon copies the exact title /
   description into the clipboard (paste into eBay) + toasts `Copied
   title`/`Copied description`; failure path shows the manual-select
   message; collapsed card shows no icons.
5. Browser-verify the bundle contents editor (Problem 16; committed
   `2954679`, pushed — checklist in Problem 16).
6. Browser-verify inventory sorting + the new page layout + the ⟳/💲 bulk
   buttons (Problem 15) and the sealed+open Include defaults — all
   committed, just needs eyeballing.
7. Browser-verify skip-recent-releases (Problem 14; committed `9ec5b44`).
8. Browser-verify the four newest commits (Problem 1): bundle names/status,
   draft bullets/Regenerate, build-around-item (anchor + include modes),
   click-only artwork.
9. Browser-verify the Actual Listing Price manual flow (Problem 2; migration
   `0011` already applied).
10. Browser-verify the bundle preview fix (Problem 3).
11. Eyeball the release-date display now that dates are filled (Problem 4;
    probe says 65/70, 5 manual by design).
12. Browser-verify the inventory visibility rules (Problem 6), the bundle
    discount + duplicates + dominant toggle, and the price history sparkline
    (Problems 5 + 7), and load the dashboard releases card (Problem 8).
13. Optional: eyeball Temur Roar's art (Problem 11) — re-run backfill-art if
    it's still the set-pack image.
14. Before deploy: Vercel env (incl. `CRON_SECRET`, `EBAY_*`), optional
    `vercel.json` cron for `/api/cron/sync-ebay`.

## Do Not Forget

- **Never run `npm run build` while `npm run dev` is running** — clobbers
  `.next/`, breaks every dynamic `[id]` API route with a bare 500.
- Don't rewrite migrations `0001`–`0012`; add the next `0013_*.sql` (keep idempotent).
- Don't touch `ArtworkThumb`'s lightbox or `s-l<N>` → `s-l1600` upscale,
  and don't re-add a hover preview (deliberately removed 2026-09-26 — user:
  "hovering causes too much issues"). Don't show `category` on cards.
- Split card names on **last `:`** for the bold sub-name display.
- No OCR/barcode guessing for single cards; only sealed UPCs are scanned.
- Cents everywhere; `*_cents` suffixes. Pin package versions; no new deps
  without a reason. Never store secrets in the repo.
- "subscribe to Go" in user messages = typo, ignore.
- Client fetch calls: parse `res.json()` defensively
  (`.catch(() => null)`) and always try/catch/finally so failures show as a
  visible error, not a silent no-op.
- **Never hardcode or invent release artwork**, and never edit params in
  the signed gamespress `sky=` URLs (403) — a blank `imageUrl` is by
  design: the branded placeholder shows (blank-not-guess).
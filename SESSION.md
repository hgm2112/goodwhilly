# SESSION.md — handoff for the next agent

Last session: 2026-10-05 (new day; prior sessions 2026-10-01, 2026-09-30,
2026-09-26, 2026-09-25 and 2026-09-24).
Repo: goodwhilly (Next.js 15 + Supabase inventory app
for an MTG/eBay reseller). Read `AGENTS.md` first for full operating context;
this file records where the previous session left off.

## Current Objective

**Bundle builder: Random / Pre-built modes WRITTEN (2026-10-05)** —
typecheck + lint green, route smoke 401 JSON through the dev server —
**NOT committed yet, NOT browser-verified (Problem 17)**. The builder card
now opens with a **"How to build"** segmented pair: **Random** (the entire
existing flow — target price → Generate → preview → Create, with Bundle
from / Include / Skip recent / Build around rendered only in that mode) and
**Pre-built** (the seller hand-picks every line). Pre-built = a searchable
picker over ALL active inventory rows (any kind/stock; paused hidden;
OOS + unpriced shown but their Add button disabled with the reason), each Add
clamped by stock ∩ `bundleCopyCap`, per-line steppers + Remove + Clear all,
mixed games allowed (label = distinct game names joined, server `game` =
first line's game), a live summary (lines/units/contents value/price) and
ONE **Create** — no generate step, POSTed straight to `POST /api/bundles`
`lines` so stock/dup/STALE_PREVIEW validation still runs server-side. The
top card in Pre-built shows ONLY the mode selector — same-day follow-up
("when clicking the pre-built button, i don't need to see the bundle price
that's right underneath it"): the Bundle price block + preset chips are
Random-only now, and Pre-built's price input lives in the "Your bundle"
summary row, auto-fills to `bundlePriceCents(contents)` as the selection
changes, is type-overridable, and clears back to auto; it's sent as the new
`listingPriceCents` body field which seeds
`bundles.listing_price_cents` (Actual Listing Price) at creation — blank
→ null → derived price everywhere; the eBay fill overwrites it later
exactly as before. No migration (reuses `0011` columns).

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

1. **Bundle builder Random / Pre-built modes** (not yet committed — typecheck
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

- `origin/main` = `aed2ccb` (eBay draft copy buttons; before it `8d0b777`
  SESSION refresh, `2954679` bundle contents editor + docs, `009410b`
  docs refresh, `378dbe4` bulk-action split, `7d49f48`
  inventory layout round 2, `13e7572` SESSION refresh, `28f1bb7` inventory
  sort + restructure, `4fe6a49` default Include kinds, `9ec5b44`
  skip-recent-releases, `ba76361` docs + `7f6c738` hover removal, `154f8b0`
  release dates, `c03a8c5` build-around-item, `e3ee03e` draft fixes,
  `66fd101` bundle names — all pushed). Working tree: **DIRTY** — the
  Random/Pre-built builder feature (BundleBuilder.tsx + bundles POST route
  + docs) is written and typecheck/lint green but not yet committed.
- `typecheck` + `lint` pass (re-run green after every commit this session, after
  the sort feature — the only lint hit was a `useMemo` exhaustive-deps
  warning, fixed by `useCallback`-ing `locName` — after the contents
  editor, and after the 2026-10-01 copy-button commit `aed2ccb`).
  **`npm run build` not run** — the dev server IS running (pgrep confirmed);
  building would clobber `.next/` and 500 every dynamic route. Route
  smoke-tested through it: `POST /api/bundles/[id]/ebay-fill` → 401 JSON,
  and the three new contents routes (`POST /api/bundles/:id/items`,
  `PATCH|DELETE /api/bundles/:id/items/:bundleItemId`) → 401 JSON.
- **Migrations `0001`–`0012` all applied** (0011 + 0012 REST-verified
  2026-09-26; 0010 earlier; 0009 on 2026-09-24). Next new migration =
  `0013_*.sql`.
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
   blocked), dup rate 56–71%, **0 violations**. Releases calendar still parses
   after the `fetchPokemonSchedule` refactor (`npx tsx scripts/probe-releases.ts`).
- **Probe verified** the bundle contents editor:
  `npx tsx scripts/probe-bundle-contents.ts` → **ALL GREEN (51 assertions**;
  add/merge, swap (release old + reserve new), qty up/down, remove, dup
  caps incl. $20+ single-copy, insufficient stock, `NOT_EDITABLE` on a
  listed bundle, 404s for unknown ids, allocation/ledger/total invariants,
  `bundleWithItems` shape, cleanup of the scratch rows**)**. It uses the
  service-role client with a stub realtime transport (Node 20 has no
  native WebSocket — same note as AGENTS' script env pattern).
- Still NOT browser-checked: the **eBay draft copy buttons** (committed
  `aed2ccb` — expand the draft, click each icon, paste shows the exact
  title/description, toast flashes), the **bundle contents editor**
  (Problem 16),
  **inventory sorting + layout + the new bulk
   buttons** (Problem
   15), **bundle
  Include defaults = sealed + open**, **skip recent releases** (Problem 14),
  **Actual Listing Price / Shipping Fee manual
  flow** (migration applied, committed `e7aa06d`); **Bundle preview==create**
  (generate → create → Bundles detail must show the identical
  lines/value/price); bundle discount + duplicates + dominant toggle; price
  history; inventory visibility (paused shown, sold-out hidden); and the
  four newest commits (`66fd101` bundle names/status, `e3ee03e` draft
  bullets/Regenerate, `c03a8c5` build-around-item, `7f6c738` click-only
  artwork).
- Data (REST-verified this session): **70 items · 248 units** — 69 sealed +
  1 open ("Tarkir Dragonstorm: Temur Roar Commander Deck", now kind `open`
  with price $98.66 + picture ✓; the old "kind other, no art" note is dead).
- All 6 "Lorwyn Eclipsed" rows are priced (Bundle $60, Play Boosters
  $6.00/$6.24, etc.) — the old "value null, Browse will retry" note is dead.

## Decisions Made

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

## Files Changed (2026-10-05, Random/Pre-built builder — NOT committed)

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
9. **Latent bug, still NOT fixed:** `PATCH /api/inventory/[id]` ignores
   `quantity` — the edit form sends it but the route never puts it in `next`,
   so quantity edits silently don't persist. (`src/app/api/inventory/[id]/route.ts`.)
   (`acquired_at` now IS handled there; quantity still isn't.)
10. **`npm run build` not run this session** (blocked by the running dev server).
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
17. **Random/Pre-built builder modes written (2026-10-05), not committed,
    not browser-verified** — typecheck + lint green, routes → 401 JSON
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

## Next Steps (priority order)

1. Commit the Random/Pre-built builder feature (working tree is dirty with
   it; typecheck + lint already green) — then browser-verify it per
   Problem 17.
2. Browser-verify the eBay draft copy buttons (committed `aed2ccb`,
   pushed): expand the draft → each icon copies the exact title /
   description into the clipboard (paste into eBay) + toasts `Copied
   title`/`Copied description`; failure path shows the manual-select
   message; collapsed card shows no icons.
3. Browser-verify the bundle contents editor (Problem 16; committed
   `2954679`, pushed — checklist in Problem 16).
4. Browser-verify inventory sorting + the new page layout + the ⟳/💲 bulk
   buttons (Problem 15) and the sealed+open Include defaults — all
   committed, just needs eyeballing.
5. Browser-verify skip-recent-releases (Problem 14; committed `9ec5b44`).
6. Browser-verify the four newest commits (Problem 1): bundle names/status,
   draft bullets/Regenerate, build-around-item (anchor + include modes),
   click-only artwork.
7. Browser-verify the Actual Listing Price manual flow (Problem 2; migration
   `0011` already applied).
8. Browser-verify the bundle preview fix (Problem 3).
9. Eyeball the release-date display now that dates are filled (Problem 4;
   probe says 65/70, 5 manual by design).
10. Browser-verify the inventory visibility rules (Problem 6), the bundle
    discount + duplicates + dominant toggle, and the price history sparkline
    (Problems 5 + 7), and load the dashboard releases card (Problem 8).
11. Fix the `quantity` PATCH gap (Problem 9; route `[id]` ignores `quantity` —
    decide whether form quantity edits should reuse `adjust` semantics +
    movement ledger before coding).
12. Optional: eyeball Temur Roar's art (Problem 11) — re-run backfill-art if
    it's still the set-pack image.
13. Stop dev → `npm run build` → confirm green → restart dev.
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
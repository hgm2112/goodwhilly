-- 0014_listings_metrics.sql
-- Attention metrics per synced eBay listing:
--   watchers_count — buyer watch list count, parsed from the EXISTING
--     GetMyeBaySelling sync (cross-checked 2026-10-13 against GetSellerList
--     IncludeWatchCount on all 17 active listings: values match exactly and
--     "absent" in GetMyeBaySelling == explicit 0 — eBay omits zero-valued XML
--     fields, so absent is parsed as 0, never fabricated).
--   views_count — LISTING_VIEWS_TOTAL from the Analytics Traffic Report
--     (real View-Item page views over the last 90 days; eBay has no lifetime
--     total). Nullable = not retrieved (shown as "—" in the UI).
-- NULL in either column = unavailable, distinct from a real 0.
-- *_refreshed_at = when that metric was last fetched for the row.
-- Idempotent; apply BEFORE deploying the sync/analytics code (the sync
-- upserts these columns) and together with the still-pending 0013.

alter table public.listings
  add column if not exists watchers_count int,
  add column if not exists watchers_refreshed_at timestamptz,
  add column if not exists views_count int,
  add column if not exists views_refreshed_at timestamptz;

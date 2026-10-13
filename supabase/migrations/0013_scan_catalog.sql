-- ============================================================================
-- 0013 — scan_catalog: permanent per-owner record of every item ever scanned.
-- Independent of inventory: rows survive items reaching quantity 0 or being
-- deleted (item_id goes NULL via FK SET NULL). One row per (owner, upc), or
-- per (owner, normalized name) for future no-barcode scans. The shared
-- upc_catalog stays a universal product cache — this table holds the
-- personal scan history (first/last scanned, count, bundle association).
-- Written fail-soft by src/lib/scan-catalog.ts (warns + skips if absent).
-- Idempotent; safe to re-run. Apply before relying on the scan-count hint/probe.
-- ============================================================================

create table if not exists public.scan_catalog (
  id               uuid primary key default gen_random_uuid(),
  owner_id         uuid not null references auth.users (id) on delete cascade,
  upc              text,
  name             text not null,
  set_code         text,
  category         text,
  image_url        text,
  item_id          uuid references public.items (id) on delete set null,
  first_scanned_at timestamptz not null default now(),
  last_scanned_at  timestamptz not null default now(),
  scan_count       int not null default 1 check (scan_count > 0),
  last_bundle_id   uuid references public.bundles (id) on delete set null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

-- Dedupe: one catalog row per barcode per owner; name-matched rows for
-- scans without a barcode (lower(trim(name)), the items-index convention).
create unique index if not exists scan_catalog_owner_upc_unique
  on public.scan_catalog (owner_id, upc) where upc is not null;
create unique index if not exists scan_catalog_owner_name_unique
  on public.scan_catalog (owner_id, (lower(trim(name))))
  where upc is null;

create index if not exists scan_catalog_owner_last_idx
  on public.scan_catalog (owner_id, last_scanned_at desc);

drop trigger if exists scan_catalog_updated_at on public.scan_catalog;
create trigger scan_catalog_updated_at before update on public.scan_catalog
  for each row execute function public.set_updated_at();

alter table public.scan_catalog enable row level security;

drop policy if exists "scan_catalog_own" on public.scan_catalog;
create policy "scan_catalog_own" on public.scan_catalog
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());

grant all on public.scan_catalog to anon, authenticated, service_role;

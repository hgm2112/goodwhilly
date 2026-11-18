-- 0015_item_foil.sql
-- Mark inventory items as foil (e.g. foil singles, foil editions). Additive:
-- existing rows default to not foil. Idempotent.
-- Apply BEFORE deploying code that reads/writes is_foil.

alter table public.items
  add column if not exists is_foil boolean not null default false;

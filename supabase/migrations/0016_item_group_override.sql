-- 0016_item_group_override.sql
-- Manual inventory-group override for "By type" view (Auto = null uses
-- automatic grouping). Additive; existing rows default to null (Auto).
-- Idempotent. Apply BEFORE deploying code that reads/writes group_override.

alter table public.items
  add column if not exists group_override text;

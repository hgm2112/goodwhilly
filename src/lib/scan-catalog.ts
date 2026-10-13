import type { SupabaseClient } from "@supabase/supabase-js";
import { normalizeName } from "@/lib/utils";

/**
 * Permanent per-owner scan catalog (table `scan_catalog`, migration 0013).
 * Everything the app has ever scanned lives here — independently of
 * inventory: rows survive items hitting quantity 0 or being deleted (the
 * `item_id` FK is ON DELETE SET NULL). Identity is the barcode when present,
 * else the normalized product name (lower(trim), the items-index convention).
 * All helpers are fail-soft: a missing table or failed write warns and
 * returns null, never breaking the scan flow (recordPriceHistory pattern).
 */

export interface ScanCatalogRow {
  id: string;
  owner_id: string;
  upc: string | null;
  name: string;
  set_code: string | null;
  category: string | null;
  image_url: string | null;
  item_id: string | null;
  first_scanned_at: string;
  last_scanned_at: string;
  scan_count: number;
  last_bundle_id: string | null;
}

export interface ScanCatalogInput {
  ownerId: string;
  upc?: string | null;
  name: string;
  setCode?: string | null;
  category?: string | null;
  imageUrl?: string | null;
  /** Latest known inventory row; pass null to clear, omit to keep. */
  itemId?: string | null;
  /** Recomputed bundle association; pass null to clear, omit to keep. */
  bundleId?: string | null;
  /** true = a real capture (count++ + last_scanned_at); false = link/identity refresh only. */
  increment?: boolean;
}

/**
 * Most recent non-cancelled bundle containing any of the given items
 * (via bundle_items → bundles, owner-scoped). Null when none.
 */
export async function findBundleForItems(
  supabase: SupabaseClient,
  ownerId: string,
  itemIds: string[],
): Promise<{ id: string; name: string } | null> {
  if (!itemIds.length) return null;
  try {
    const { data: links } = await supabase
      .from("bundle_items")
      .select("bundle_id")
      .in("item_id", itemIds);
    const bundleIds = Array.from(new Set((links ?? []).map((l) => l.bundle_id)));
    if (!bundleIds.length) return null;
    const { data: bundles } = await supabase
      .from("bundles")
      .select("id, name")
      .in("id", bundleIds)
      .eq("owner_id", ownerId)
      .neq("status", "cancelled")
      .order("created_at", { ascending: false })
      .limit(1);
    return (bundles?.[0] as { id: string; name: string } | undefined) ?? null;
  } catch (err) {
    console.warn("[scan-catalog]", err instanceof Error ? err.message : "bundle lookup failed");
    return null;
  }
}

async function applyScanPatch(
  supabase: SupabaseClient,
  existing: ScanCatalogRow,
  input: ScanCatalogInput,
  increment: boolean,
): Promise<ScanCatalogRow | null> {
  const patch: Record<string, unknown> = {};
  if (increment) {
    patch.scan_count = existing.scan_count + 1;
    patch.last_scanned_at = new Date().toISOString();
  }
  // Latest known identity wins — the shared catalog improves over time
  // (eBay resolution, user renames via /api/scan/name). Compared normalized
  // so a case/spacing variant of the same name is not a "change".
  if (input.name && normalizeName(input.name) !== normalizeName(existing.name)) patch.name = input.name;
  if (input.setCode != null && input.setCode !== existing.set_code) patch.set_code = input.setCode;
  if (input.imageUrl != null && input.imageUrl !== existing.image_url) {
    patch.image_url = input.imageUrl;
  }
  // Category fills a blank only — the user's stored choice always wins.
  if (input.category != null && !existing.category) patch.category = input.category;
  if (input.itemId !== undefined && input.itemId !== existing.item_id) {
    patch.item_id = input.itemId;
  }
  if (input.bundleId !== undefined && input.bundleId !== existing.last_bundle_id) {
    patch.last_bundle_id = input.bundleId;
  }
  if (!Object.keys(patch).length) return existing;

  const { data: updated, error } = await supabase
    .from("scan_catalog")
    .update(patch)
    .eq("id", existing.id)
    .select("*")
    .single();
  if (error) {
    console.warn("[scan-catalog]", error.message);
    return existing;
  }
  return updated as ScanCatalogRow;
}

/**
 * Find-or-create the owner's catalog record for this scan. Repeated scans of
 * the same barcode update the ONE row (count++, last_scanned_at, refreshed
 * identity/links) instead of duplicating. `increment: false` refreshes
 * identity and item/bundle links WITHOUT counting (used when POST /api/scan
 * follows the capturing GET, or a rename syncs the name).
 */
export async function recordScan(
  supabase: SupabaseClient,
  input: ScanCatalogInput,
): Promise<ScanCatalogRow | null> {
  const { ownerId, name, increment = false } = input;
  const upc = input.upc || null;

  const findExisting = async (): Promise<ScanCatalogRow | null> => {
    if (upc) {
      const { data } = await supabase
        .from("scan_catalog")
        .select("*")
        .eq("owner_id", ownerId)
        .eq("upc", upc)
        .maybeSingle();
      return (data as ScanCatalogRow | null) ?? null;
    }
    // No barcode: match by normalized name (bounded — one page of the
    // owner's name-only rows; name-based scans don't exist yet but the
    // schema supports them).
    const { data: rows } = await supabase
      .from("scan_catalog")
      .select("*")
      .eq("owner_id", ownerId)
      .is("upc", null);
    return (rows ?? []).find((r) => normalizeName(r.name) === normalizeName(name)) ?? null;
  };

  try {
    const existing = await findExisting();
    if (existing) return applyScanPatch(supabase, existing, input, increment);

    const { data: inserted, error } = await supabase
      .from("scan_catalog")
      .insert({
        owner_id: ownerId,
        upc,
        name,
        set_code: input.setCode ?? null,
        category: input.category ?? null,
        image_url: input.imageUrl ?? null,
        item_id: input.itemId ?? null,
        last_bundle_id: input.bundleId ?? null,
        // scan_count / first_scanned_at / last_scanned_at: DB defaults (1, now).
      })
      .select("*")
      .single();
    if (error) {
      if (error.code === "23505") {
        // Race: a concurrent scan inserted the row a moment ago — merge into it.
        const again = await findExisting();
        if (again) return applyScanPatch(supabase, again, input, increment);
      }
      console.warn("[scan-catalog]", error.message);
      return null;
    }
    return inserted as ScanCatalogRow;
  } catch (err) {
    console.warn("[scan-catalog]", err instanceof Error ? err.message : "failed");
    return null;
  }
}

import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { findBundleForItems, recordScan } from "@/lib/scan-catalog";

/**
 * Probe for the permanent scan catalog (scan_catalog / migration 0013) run
 * against the real DB with SCRATCH rows only: fake "ZZ probe" UPCs, items and
 * a bundle — everything deleted at the end, no user data touched. Covers:
 * first-scan insert, repeat increments (first_scanned_at preserved, no
 * duplicate rows), link-refresh without counting, identity refresh with
 * fill-blank category, item deletion surviving as item_id NULL, bundle
 * association (found / cancelled → cleared), and name-only rows for
 * no-barcode scans. Exits non-zero on any failed expectation.
 *
 * Usage: npx tsx scripts/probe-scan-catalog.ts
 */

const UPC_A = "9999000000001";
const UPC_B = "9999000000002";
const NAME_A = "ZZ probe Catalog Item A";
const NAME_BUNDLED = "ZZ probe Bundled Item";
const NAME_ONLY = "ZZ probe Name Only";
const BUNDLE_NAME = "ZZ probe Bundle";

let failures = 0;
function expect(cond: boolean, label: string): void {
  console.log(`${cond ? "PASS" : "FAIL"}  ${label}`);
  if (!cond) failures++;
}

function loadEnvLocal(): void {
  try {
    const text = readFileSync(".env.local", "utf8");
    for (const line of text.split("\n")) {
      if (!line || line.trim().startsWith("#")) continue;
      const eq = line.indexOf("=");
      if (eq < 0) continue;
      const key = line.slice(0, eq).trim();
      const value = line.slice(eq + 1).trim();
      if (!(key in process.env)) process.env[key] = value;
    }
  } catch {
    // .env.local is optional when the env vars are already exported.
  }
}

async function main() {
  loadEnvLocal();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error("Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY (check .env.local)");
    process.exit(1);
  }
  const supabase = createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
    realtime: {
      transport: class {} as unknown as typeof WebSocket,
    },
  });

  // The table must exist (apply 0013_scan_catalog.sql first) — fail loudly.
  const { error: tableError } = await supabase.from("scan_catalog").select("id").limit(1);
  if (tableError) {
    console.error(`scan_catalog not reachable (${tableError.message}) — apply 0013_scan_catalog.sql first.`);
    process.exit(1);
  }

  const { data: profile } = await supabase.from("profiles").select("id").limit(1).maybeSingle();
  if (!profile) {
    console.error("No profile row — nothing to probe against.");
    process.exit(1);
  }
  const ownerId = (profile as { id: string }).id;

  try {
    // ── Fixtures ───────────────────────────────────────────────────────────
    const { data: items, error: itemError } = await supabase
      .from("items")
      .insert([
        { owner_id: ownerId, name: NAME_A, kind: "other", upc: UPC_A, quantity: 0, active: true },
        {
          owner_id: ownerId,
          name: NAME_BUNDLED,
          kind: "other",
          upc: UPC_B,
          quantity: 0,
          active: true,
        },
      ])
      .select("id, name");
    if (itemError || !items || items.length !== 2) {
      console.error("Could not create scratch items:", itemError?.message);
      process.exit(1);
    }
    const itemA = items.find((i) => i.name === NAME_A)!;
    const itemBundled = items.find((i) => i.name === NAME_BUNDLED)!;

    // ── 1. First scan inserts one row with count 1 ─────────────────────────
    const first = await recordScan(supabase, {
      ownerId,
      upc: UPC_A,
      name: NAME_A,
      itemId: itemA.id,
      increment: true,
    });
    expect(first != null && first.scan_count === 1, "first scan creates a row with scan_count 1");
    expect(first != null && first.item_id === itemA.id, "first scan links the inventory item");

    // ── 2. Repeat captures increment; first_scanned_at preserved ───────────
    await new Promise((r) => setTimeout(r, 1100));
    const second = await recordScan(supabase, {
      ownerId,
      upc: UPC_A,
      name: NAME_A,
      itemId: itemA.id,
      increment: true,
    });
    expect(second != null && second.scan_count === 2, "repeat capture bumps scan_count to 2");
    expect(
      second != null && first != null && second.first_scanned_at === first.first_scanned_at,
      "first_scanned_at is preserved across captures",
    );
    expect(
      second != null && first != null && second.last_scanned_at > first.last_scanned_at,
      "last_scanned_at advances",
    );

    // ── 3. Link-refresh does NOT count ─────────────────────────────────────
    const refreshed = await recordScan(supabase, {
      ownerId,
      upc: UPC_A,
      name: "ZZ probe Catalog Item A Renamed",
      setCode: "ZZ1",
      category: "MTG Sealed",
      itemId: itemA.id,
      increment: false,
    });
    expect(refreshed != null && refreshed.scan_count === 2, "increment: false leaves scan_count at 2");
    expect(
      refreshed != null && refreshed.name === "ZZ probe Catalog Item A Renamed",
      "refresh updates the product name in place",
    );
    expect(refreshed != null && refreshed.set_code === "ZZ1", "refresh updates set_code");
    expect(refreshed != null && refreshed.category === "MTG Sealed", "category fills a blank");

    // ── 4. Category is fill-blank only (stored choice wins) ────────────────
    const recat = await recordScan(supabase, {
      ownerId,
      upc: UPC_A,
      name: "ZZ probe Catalog Item A Renamed",
      category: "Pokemon Sealed",
      increment: true,
    });
    expect(recat != null && recat.category === "MTG Sealed", "existing category is never overwritten");
    expect(recat != null && recat.scan_count === 3, "capture during refresh still counts");

    // ── 5. No duplicate rows for the same barcode ──────────────────────────
    const { data: dupRows } = await supabase
      .from("scan_catalog")
      .select("id")
      .eq("owner_id", ownerId)
      .eq("upc", UPC_A);
    expect((dupRows ?? []).length === 1, "repeated scans keep exactly one row per barcode");

    // ── 6. Bundle association via bundle_items ─────────────────────────────
    const { data: bundle, error: bundleError } = await supabase
      .from("bundles")
      .insert({
        owner_id: ownerId,
        name: BUNDLE_NAME,
        target_value_cents: 1000,
        total_value_cents: 1000,
        status: "allocated",
      })
      .select("id")
      .single();
    if (bundleError || !bundle) {
      console.error("Could not create scratch bundle:", bundleError?.message);
      process.exit(1);
    }
    await supabase.from("bundle_items").insert({
      bundle_id: bundle.id,
      item_id: itemBundled.id,
      quantity: 1,
      value_cents: 1000,
    });

    const foundBundle = await findBundleForItems(supabase, ownerId, [itemBundled.id]);
    expect(foundBundle?.id === bundle.id, "findBundleForItems finds the containing bundle");

    const bundledScan = await recordScan(supabase, {
      ownerId,
      upc: UPC_B,
      name: NAME_BUNDLED,
      itemId: itemBundled.id,
      bundleId: foundBundle?.id ?? null,
      increment: true,
    });
    expect(bundledScan != null && bundledScan.last_bundle_id === bundle.id, "scan row stores the bundle link");

    // Cancelled bundles don't count.
    await supabase.from("bundles").update({ status: "cancelled" }).eq("id", bundle.id);
    const goneBundle = await findBundleForItems(supabase, ownerId, [itemBundled.id]);
    expect(goneBundle == null, "cancelled bundle is excluded");
    const cleared = await recordScan(supabase, {
      ownerId,
      upc: UPC_B,
      name: NAME_BUNDLED,
      itemId: itemBundled.id,
      bundleId: null,
      increment: false,
    });
    expect(cleared != null && cleared.last_bundle_id === null, "recompute clears a stale bundle link");

    // ── 7. Catalog survives item deletion (FK SET NULL) ────────────────────
    const { error: delError } = await supabase
      .from("items")
      .delete()
      .eq("id", itemA.id)
      .eq("owner_id", ownerId);
    expect(delError == null, "scratch item deletes cleanly");
    const { data: orphan } = await supabase
      .from("scan_catalog")
      .select("*")
      .eq("owner_id", ownerId)
      .eq("upc", UPC_A)
      .maybeSingle();
    expect(orphan != null, "catalog row survives the item deletion");
    expect(orphan != null && orphan.item_id === null, "item_id is NULL after the item is deleted");
    expect(orphan != null && orphan.scan_count === 3, "scan history (count) survives the item deletion");

    // ── 8. Name-only rows (no barcode) ─────────────────────────────────────
    const n1 = await recordScan(supabase, { ownerId, upc: null, name: NAME_ONLY, increment: true });
    const n2 = await recordScan(supabase, {
      ownerId,
      upc: null,
      name: `  ${NAME_ONLY.toUpperCase()} `,
      increment: true,
    });
    expect(n1 != null && n2 != null && n1.id === n2.id, "name-only scans merge case-insensitively");
    expect(n2 != null && n2.scan_count === 2, "name-only row counts both captures");
    const other = await recordScan(supabase, {
      ownerId,
      upc: null,
      name: "ZZ probe Name Only Two",
      increment: true,
    });
    expect(other != null && n1 != null && other.id !== n1.id, "different names stay separate rows");
  } finally {
    // ── Cleanup (scan rows → bundles (cascade bundle_items) → items) ──────
    await supabase
      .from("scan_catalog")
      .delete()
      .eq("owner_id", ownerId)
      .in("upc", [UPC_A, UPC_B]);
    await supabase.from("scan_catalog").delete().eq("owner_id", ownerId).ilike("name", "ZZ probe%");
    await supabase
      .from("bundles")
      .delete()
      .eq("owner_id", ownerId)
      .ilike("name", "ZZ probe%");
    await supabase
      .from("items")
      .delete()
      .eq("owner_id", ownerId)
      .ilike("name", "ZZ probe%");
    console.log("Cleanup done.");
  }

  process.exit(failures ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

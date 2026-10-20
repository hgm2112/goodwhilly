import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

/**
 * One-off (idempotent) backfill for bundles marked sold BEFORE the "Mark sold
 * → Record sale" flow existed (commit c5d5f7c). The old UI flipped
 * `bundles.status = 'sold'` through PATCH without writing a `sales` row, so
 * those bundles appear under /bundles → Sold but never in /sales.
 *
 * For every sold bundle with no sale it inserts one sale:
 *   gross    = listing_price_cents, else the derived price (90% of contents)
 *   fee      = 0 (unknown — edit the sale afterwards to correct it)
 *   shipping = bundles.shipping_cents, else 0
 *   net      = gross - fee
 *   sold_at  = bundles.updated_at (the moment it was marked sold)
 *
 * Re-running is a no-op (the `not exists` check mirrors the live query), and
 * it never touches bundles/allocations. Usage:
 *   npx tsx scripts/backfill-bundle-sales.ts            # dry run (default)
 *   npx tsx scripts/backfill-bundle-sales.ts --apply    # insert the rows
 */

type BundleRow = {
  id: string;
  name: string;
  owner_id: string;
  status: string;
  listing_price_cents: number | null;
  shipping_cents: number | null;
  total_value_cents: number;
  updated_at: string;
};

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

function bundlePriceCents(totalCents: number): number {
  return Math.round(totalCents * 0.9);
}

async function main() {
  loadEnvLocal();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error("Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY (check .env.local)");
    process.exit(1);
  }
  const apply = process.argv.includes("--apply");
  const supabase = createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
    realtime: { transport: class {} as unknown as typeof WebSocket },
  });

  const { data: bundles, error } = await supabase
    .from("bundles")
    .select(
      "id, name, owner_id, status, listing_price_cents, shipping_cents, total_value_cents, updated_at",
    )
    .eq("status", "sold");
  if (error) {
    console.error(`Could not read bundles: ${error.message}`);
    process.exit(1);
  }

  const rows = (bundles ?? []) as BundleRow[];
  if (rows.length === 0) {
    console.log("No sold bundles — nothing to backfill.");
    return;
  }

  const { data: existing, error: salesError } = await supabase
    .from("sales")
    .select("bundle_id")
    .not("bundle_id", "is", null);
  if (salesError) {
    console.error(`Could not read sales: ${salesError.message}`);
    process.exit(1);
  }
  const withSale = new Set((existing ?? []).map((s: { bundle_id: string }) => s.bundle_id));

  const missing = rows.filter((b) => !withSale.has(b.id));
  console.log(
    `${rows.length} sold bundle(s); ${rows.length - missing.length} already have a sale; ${missing.length} need one.`,
  );
  if (missing.length === 0) return;

  let failures = 0;
  for (const b of missing) {
    const gross = b.listing_price_cents ?? bundlePriceCents(b.total_value_cents);
    const fee = 0;
    const shipping = b.shipping_cents ?? 0;
    const net = gross - fee;
    const label = `${b.name}  gross ${(gross / 100).toFixed(2)}  net ${(net / 100).toFixed(
      2,
    )}  sold ${b.updated_at.slice(0, 10)}`;
    if (!apply) {
      console.log(`DRY RUN  would insert: ${label}`);
      continue;
    }
    const { error: insertError } = await supabase.from("sales").insert({
      owner_id: b.owner_id,
      bundle_id: b.id,
      gross_cents: gross,
      fee_cents: fee,
      shipping_cents: shipping,
      net_cents: net,
      quantity: 1,
      buyer: null,
      note: "Backfilled from sold bundle",
      sold_at: b.updated_at,
    });
    if (insertError) {
      failures++;
      console.error(`FAIL  ${b.name}: ${insertError.message}`);
    } else {
      console.log(`INSERTED  ${label}`);
    }
  }

  if (!apply) {
    console.log("\nDry run only — re-run with --apply to write the sales rows.");
  } else {
    console.log(failures === 0 ? "\nDone — every sold bundle now has a sale." : `\n${failures} insert(s) failed.`);
    if (failures > 0) process.exit(1);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

/**
 * Read-only sales-integrity audit. A bundle reaches `sold` ONLY through
 * POST /api/sales (which writes the ledger row); this probe flags the two
 * ways that invariant can drift:
 *   - a `sold` bundle with no sale row (the legacy PATCH hole, pre-2026-10-20)
 *   - a bundle with more than one sale row (double-recording)
 * Exits non-zero on any violation. Never writes.
 *
 * Usage: npx tsx scripts/probe-sales-integrity.ts
 */

type BundleLite = { id: string; name: string; status: string; updated_at: string };
type SaleLite = { id: string; bundle_id: string | null; sold_at: string; gross_cents: number };

let failures = 0;
function fail(label: string): void {
  failures++;
  console.log(`FAIL  ${label}`);
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
    realtime: { transport: class {} as unknown as typeof WebSocket },
  });

  const [{ data: bundles, error: bundleError }, { data: sales, error: saleError }] = await Promise.all([
    supabase.from("bundles").select("id, name, status, updated_at"),
    supabase.from("sales").select("id, bundle_id, sold_at, gross_cents"),
  ]);
  if (bundleError || saleError) {
    console.error(`DB read failed: ${bundleError?.message ?? saleError?.message}`);
    process.exit(1);
  }

  const byBundle = new Map<string, SaleLite[]>();
  for (const s of (sales ?? []) as SaleLite[]) {
    if (!s.bundle_id) continue;
    const list = byBundle.get(s.bundle_id) ?? [];
    list.push(s);
    byBundle.set(s.bundle_id, list);
  }

  let sold = 0;
  for (const b of (bundles ?? []) as BundleLite[]) {
    if (b.status !== "sold") continue;
    sold++;
    const linked = byBundle.get(b.id) ?? [];
    if (linked.length === 0) {
      fail(`${b.name} is sold but has no sale (run scripts/backfill-bundle-sales.ts)`);
    } else if (linked.length > 1) {
      fail(`${b.name} has ${linked.length} sales (${linked.map((s) => s.id.slice(0, 8)).join(", ")})`);
    }
  }

  for (const [bundleId, linked] of byBundle) {
    if (linked.length > 1) {
      // Already reported above when the bundle is sold; catch it either way.
      const b = ((bundles ?? []) as BundleLite[]).find((x) => x.id === bundleId);
      if (!b || b.status !== "sold") {
        fail(`${b?.name ?? bundleId} has ${linked.length} sales`);
      }
    }
  }

  console.log(`\n${sold} sold bundle(s), ${byBundle.size} bundle sale(s) checked.`);
  console.log(failures === 0 ? "PASS  every sold bundle has exactly one sale." : `${failures} violation(s).`);
  if (failures > 0) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

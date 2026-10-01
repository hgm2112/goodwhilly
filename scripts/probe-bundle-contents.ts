import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import {
  addLine,
  bundleWithItems,
  ContentsError,
  patchContentsLine,
  removeContentsLine,
} from "@/lib/bundle-contents";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * End-to-end probe for the bundle contents editor (add / substitute /
 * re-quantity / remove) run against the real DB with SCRATCH rows only:
 * four "ZZ probe" items + one "ZZ probe" bundle. Everything is deleted at
 * the end (item movements cascade with their items), so no user data is
 * touched. Covers: merge-on-add, stock + dup-cap + status-gate 409s, the
 * reserve/release ledger pairs, allocation sync, and the recomputed total.
 * Exits non-zero on any failed expectation.
 *
 * Usage: npx tsx scripts/probe-bundle-contents.ts
 */

const ALPHA = "ZZ probe Alpha";
const BETA = "ZZ probe Beta";
const GAMMA = "ZZ probe Gamma";
const DELTA = "ZZ probe Delta";

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

async function stock(supabase: SupabaseClient, itemId: string): Promise<number> {
  const { data } = await supabase.from("items").select("quantity").eq("id", itemId).single();
  return (data as { quantity: number }).quantity;
}

async function allocQty(
  supabase: SupabaseClient,
  bundleId: string,
  itemId: string,
): Promise<number> {
  const { data } = await supabase
    .from("allocations")
    .select("quantity")
    .eq("bundle_id", bundleId)
    .eq("item_id", itemId)
    .eq("status", "allocated");
  return ((data ?? []) as { quantity: number }[]).reduce((n, r) => n + r.quantity, 0);
}

async function bundleTotal(supabase: SupabaseClient, bundleId: string): Promise<number> {
  const { data } = await supabase
    .from("bundles")
    .select("total_value_cents")
    .eq("id", bundleId)
    .single();
  return (data as { total_value_cents: number }).total_value_cents;
}

async function lineIds(
  supabase: SupabaseClient,
  bundleId: string,
): Promise<Array<{ id: string; item_id: string; quantity: number; value_cents: number }>> {
  const { data } = await supabase
    .from("bundle_items")
    .select("id, item_id, quantity, value_cents")
    .eq("bundle_id", bundleId);
  return (data ?? []) as Array<{ id: string; item_id: string; quantity: number; value_cents: number }>;
}

async function movementCount(
  supabase: SupabaseClient,
  bundleId: string,
  itemId: string,
  reason: "reserve" | "release",
): Promise<number> {
  const { data } = await supabase
    .from("item_movements")
    .select("id")
    .eq("ref_id", bundleId)
    .eq("item_id", itemId)
    .eq("reason", reason);
  return (data ?? []).length;
}

async function expectError(
  fn: () => Promise<unknown>,
  status: number,
  code: string,
  label: string,
): Promise<void> {
  try {
    await fn();
    expect(false, `${label} — expected ${status} ${code}, but it succeeded`);
  } catch (e) {
    const got = e instanceof ContentsError ? `${e.status} ${e.code}` : `non-ContentsError: ${e}`;
    expect(
      e instanceof ContentsError && e.status === status && e.code === code,
      `${label} → ${status} ${code} (got ${got})`,
    );
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
    // Node 20 has no native WebSocket; the probe never subscribes to realtime,
    // so a stub constructor keeps createClient happy (AGENTS "script env" note).
    realtime: {
      transport: class {} as unknown as typeof WebSocket,
    },
  });

  const { data: profile } = await supabase.from("profiles").select("id").limit(1).maybeSingle();
  if (!profile) {
    console.error("No profile row — nothing to probe against.");
    process.exit(1);
  }
  const ownerId = (profile as { id: string }).id;

  // ── Scratch fixtures ──────────────────────────────────────────────────────
  const { data: created, error: itemError } = await supabase
    .from("items")
    .insert([
      { owner_id: ownerId, name: ALPHA, kind: "other", quantity: 5, value_cents: 1000, unit_cost_cents: 100, active: true },
      { owner_id: ownerId, name: BETA, kind: "other", quantity: 5, value_cents: 1500, unit_cost_cents: 50, active: true },
      { owner_id: ownerId, name: GAMMA, kind: "other", quantity: 5, value_cents: 1800, active: true },
      { owner_id: ownerId, name: DELTA, kind: "other", quantity: 3, value_cents: 2500, active: true },
    ])
    .select("id, name");
  if (itemError || !created) {
    console.error("Couldn't create scratch items:", itemError?.message);
    process.exit(1);
  }
  const byName = new Map((created as Array<{ id: string; name: string }>).map((r) => [r.name, r.id]));
  const alpha = byName.get(ALPHA)!;
  const beta = byName.get(BETA)!;
  const gamma = byName.get(GAMMA)!;
  const delta = byName.get(DELTA)!;
  const scratchIds = [alpha, beta, gamma, delta];

  let bundleId = "";
  try {
    // Seed a bundle the way POST /api/bundles does: line Alpha ×2, reserved.
    const { data: bundle, error: bundleError } = await supabase
      .from("bundles")
      .insert({
        owner_id: ownerId,
        name: "ZZ probe bundle",
        target_value_cents: 10000,
        total_value_cents: 2000,
        status: "allocated",
      })
      .select("id")
      .single();
    if (bundleError || !bundle) throw new Error(bundleError?.message ?? "bundle insert failed");
    bundleId = (bundle as { id: string }).id;

    await supabase.from("bundle_items").insert({
      bundle_id: bundleId,
      item_id: alpha,
      quantity: 2,
      value_cents: 1000,
      unit_cost_cents: 100,
    });
    await supabase.from("items").update({ quantity: 3 }).eq("id", alpha);
    await supabase
      .from("allocations")
      .insert({ bundle_id: bundleId, item_id: alpha, quantity: 2, status: "allocated" });
    await supabase.from("item_movements").insert({
      item_id: alpha,
      owner_id: ownerId,
      delta: -2,
      reason: "reserve",
      ref_id: bundleId,
      note: "probe seed",
    });

    expect((await stock(supabase, alpha)) === 3, "seed: Alpha stock 5 → 3");
    expect((await allocQty(supabase, bundleId, alpha)) === 2, "seed: Alpha allocation = 2");

    // ── 1. addLine Beta ×2 ──────────────────────────────────────────────────
    const add1 = await addLine(supabase, ownerId, bundleId, beta, 2);
    expect(add1.items.length === 2, "add Beta ×2 → bundle has 2 lines (returns BundleWithItems)");
    expect((await stock(supabase, beta)) === 3, "add Beta ×2 → Beta stock 5 → 3");
    expect((await allocQty(supabase, bundleId, beta)) === 2, "add Beta ×2 → Beta allocation = 2");
    expect((await bundleTotal(supabase, bundleId)) === 5000, "add Beta ×2 → total 2000 + 3000 = 5000");

    // ── 2. addLine Beta ×1 merges into the same line ────────────────────────
    await addLine(supabase, ownerId, bundleId, beta, 1);
    const betaLines = (await lineIds(supabase, bundleId)).filter((l) => l.item_id === beta);
    expect(betaLines.length === 1 && betaLines[0].quantity === 3, "add Beta ×1 → merged into ONE line at ×3");
    expect((await stock(supabase, beta)) === 2, "add Beta ×1 → Beta stock 3 → 2");
    expect((await allocQty(supabase, bundleId, beta)) === 3, "add Beta ×1 → Beta allocation = 3");
    expect((await bundleTotal(supabase, bundleId)) === 6500, "add Beta ×1 → total = 6500");

    // ── 3. cap: 3 + 4 = 7 > 5 ───────────────────────────────────────────────
    await expectError(() => addLine(supabase, ownerId, bundleId, beta, 4), 409, "DUP_CAP", "add Beta ×4 over the 5-copy cap");
    expect((await stock(supabase, beta)) === 2, "cap failure leaves Beta stock untouched");
    expect((await bundleTotal(supabase, bundleId)) === 6500, "cap failure leaves the total untouched");

    // ── 4. cap: $25 item allows only 1 copy ─────────────────────────────────
    await expectError(() => addLine(supabase, ownerId, bundleId, delta, 2), 409, "DUP_CAP", "add Delta ×2 ($25+ item, cap 1)");
    expect((await stock(supabase, delta)) === 3, "Delta stock untouched after cap failure");

    // ── 5. insufficient stock (cap has room: 4 ≤ 5, stock 3) ────────────────
    await supabase.from("items").update({ quantity: 3 }).eq("id", gamma);
    await expectError(() => addLine(supabase, ownerId, bundleId, gamma, 4), 409, "INSUFFICIENT_STOCK", "add Gamma ×4 with only 3 in stock");
    expect((await stock(supabase, gamma)) === 3, "stock failure leaves Gamma stock untouched");
    expect((await lineIds(supabase, bundleId)).length === 2, "stock failure adds no line");
    await supabase.from("items").update({ quantity: 5 }).eq("id", gamma);

    // ── 6. substitute Alpha-line → Gamma ×2 ─────────────────────────────────
    const alphaLine = (await lineIds(supabase, bundleId)).find((l) => l.item_id === alpha)!;
    const sub = await patchContentsLine(supabase, ownerId, bundleId, alphaLine.id, gamma, 2);
    expect(sub.items.length === 2, "swap Alpha → Gamma: bundle still has 2 lines");
    expect((await stock(supabase, alpha)) === 5, "swap Alpha → Gamma: Alpha stock restored to 5");
    expect((await stock(supabase, gamma)) === 3, "swap Alpha → Gamma: Gamma stock 5 → 3");
    expect((await allocQty(supabase, bundleId, alpha)) === 0, "swap: Alpha allocation released");
    expect((await allocQty(supabase, bundleId, gamma)) === 2, "swap: Gamma allocation = 2");
    expect(
      (await movementCount(supabase, bundleId, alpha, "release")) === 1 &&
        (await movementCount(supabase, bundleId, gamma, "reserve")) === 1,
      "swap: ledger has Alpha release + Gamma reserve",
    );
    expect((await bundleTotal(supabase, bundleId)) === 8100, "swap: total = Beta 4500 + Gamma 3600 = 8100");

    // ── 7. quantity changes (up, then down) ─────────────────────────────────
    const gammaLine = (await lineIds(supabase, bundleId)).find((l) => l.item_id === gamma)!;
    await patchContentsLine(supabase, ownerId, bundleId, gammaLine.id, null, 4);
    expect((await stock(supabase, gamma)) === 1, "qty 2 → 4: Gamma stock 3 → 1");
    expect((await allocQty(supabase, bundleId, gamma)) === 4, "qty 2 → 4: allocation = 4");
    expect((await bundleTotal(supabase, bundleId)) === 11700, "qty 2 → 4: total = 11700");

    await patchContentsLine(supabase, ownerId, bundleId, gammaLine.id, null, 2);
    expect((await stock(supabase, gamma)) === 3, "qty 4 → 2: Gamma stock back to 3");
    expect((await bundleTotal(supabase, bundleId)) === 8100, "qty 4 → 2: total back to 8100");

    await expectError(() => patchContentsLine(supabase, ownerId, bundleId, gammaLine.id, null, 6), 409, "DUP_CAP", "qty 2 → 6 over the 5-copy cap");
    expect((await stock(supabase, gamma)) === 3, "qty cap failure leaves stock untouched");

    // ── 8. remove Beta ──────────────────────────────────────────────────────
    const betaLine = (await lineIds(supabase, bundleId)).find((l) => l.item_id === beta)!;
    const afterRemove = await removeContentsLine(supabase, ownerId, bundleId, betaLine.id);
    expect(afterRemove.items.length === 1, "remove Beta: 1 line left");
    expect((await stock(supabase, beta)) === 5, "remove Beta: stock restored to 5");
    expect((await allocQty(supabase, bundleId, beta)) === 0, "remove Beta: allocation released");
    expect(
      (await movementCount(supabase, bundleId, beta, "release")) === 1,
      "remove Beta: ledger has a release row",
    );
    expect((await bundleTotal(supabase, bundleId)) === 3600, "remove Beta: total = 3600");

    // ── 9. swap Gamma-line → Delta ×1 (into a $20+ slot) ────────────────────
    await patchContentsLine(supabase, ownerId, bundleId, gammaLine.id, delta, 1);
    expect((await stock(supabase, gamma)) === 5, "swap Gamma → Delta: Gamma restored");
    expect((await stock(supabase, delta)) === 2, "swap Gamma → Delta: Delta stock 3 → 2");
    expect((await allocQty(supabase, bundleId, delta)) === 1, "swap: Delta allocation = 1");
    expect((await bundleTotal(supabase, bundleId)) === 2500, "swap: total = 2500");

    // ── 10. same-item qty over the $20+ cap ─────────────────────────────────
    const deltaLine = (await lineIds(supabase, bundleId)).find((l) => l.item_id === delta)!;
    await expectError(() => patchContentsLine(supabase, ownerId, bundleId, deltaLine.id, null, 2), 409, "DUP_CAP", "Delta qty 1 → 2 ($20+ cap)");
    expect((await stock(supabase, delta)) === 2, "same-item cap failure leaves stock untouched");

    // ── 11. status gate: listed bundles are read-only ───────────────────────
    await supabase.from("bundles").update({ status: "listed" }).eq("id", bundleId);
    await expectError(() => addLine(supabase, ownerId, bundleId, gamma, 1), 409, "NOT_EDITABLE", "add line on a listed bundle");
    await expectError(() => removeContentsLine(supabase, ownerId, bundleId, deltaLine.id), 409, "NOT_EDITABLE", "remove line on a listed bundle");
    await supabase.from("bundles").update({ status: "allocated" }).eq("id", bundleId);

    // ── 12. wrong ids ───────────────────────────────────────────────────────
    await expectError(() => addLine(supabase, ownerId, bundleId, "00000000-0000-0000-0000-000000000000", 1), 404, "ITEM_NOT_FOUND", "add unknown item");
    await expectError(() => removeContentsLine(supabase, ownerId, bundleId, "00000000-0000-0000-0000-000000000000"), 404, "LINE_NOT_FOUND", "remove unknown line");
    await expectError(() => addLine(supabase, ownerId, "00000000-0000-0000-0000-000000000000", gamma, 1), 404, "NOT_FOUND", "add to unknown bundle");

    expect(
      (await bundleWithItems(supabase, ownerId, bundleId)).items.length === 1,
      "bundleWithItems returns the renderable bundle",
    );
  } finally {
    // ── Cleanup: scratch bundle first (cascades lines + allocations), then
    // scratch items (cascades their movements). No user rows are touched.
    if (bundleId) await supabase.from("bundles").delete().eq("id", bundleId);
    await supabase.from("items").delete().in("id", scratchIds);
    const { data: left } = await supabase
      .from("items")
      .select("id")
      .in("id", scratchIds);
    expect((left ?? []).length === 0, "cleanup: scratch rows removed");
  }

  console.log(failures ? `\n${failures} FAILURE(S)` : "\nALL GREEN");
  process.exit(failures ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

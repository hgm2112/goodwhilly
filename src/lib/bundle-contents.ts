import type { SupabaseClient } from "@supabase/supabase-js";
import { apiError } from "@/lib/api-helper";
import { bundleCopyCap } from "@/lib/bundle";
import type { Bundle, BundleWithItems, Item } from "@/lib/types";

/**
 * Server-side contents editing for a created bundle — add / substitute /
 * re-quantity / remove a line while the bundle is still `draft`/`allocated`
 * (i.e. before it is marked listed).
 *
 * Invariants every op keeps:
 *  - `items.quantity` = physical stock minus everything reserved, so stock
 *    changes only go through `changeStock` + a matching `item_movements` row
 *    (`reserve`/`release`, `ref_id` = bundle id).
 *  - ONE `allocated` row per (bundle, item) in `allocations`, its quantity
 *    equal to `bundle_items.quantity` (`setAllocation` upserts it, and marks
 *    it released when the line goes away).
 *  - `bundles.total_value_cents` = Σ `bundle_items.value_cents × quantity`.
 *  - Copy caps via `bundleCopyCap`: $20+ items at most once, cheaper items at
 *    most 5, and never more than the item's unreserved stock.
 *
 * supabase-js has no transactions, so each op records an undo stack while the
 * structural writes run (mirroring the create route's rollback) and only then
 * writes movements + the recomputed total.
 */

/** Statuses whose contents may still be edited. */
const EDITABLE_STATUSES = new Set(["draft", "allocated"]);
/** One line's quantity is 1..99 (same bound the create route validates). */
const MAX_LINE_QTY = 99;

export class ContentsError extends Error {
  readonly status: number;
  readonly code?: string;
  constructor(message: string, status = 400, code?: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

/** Map a thrown contents error (or unexpected failure) to an API response. */
export function contentsApiError(e: unknown) {
  if (e instanceof ContentsError) {
    return apiError(e.message, e.status, e.code ? { code: e.code } : undefined);
  }
  console.error("bundle contents op failed:", e);
  return apiError("Couldn't update the bundle", 500, { code: "DB" });
}

type Line = BundleWithItems["items"][number];
type LineSnapshot = { id: string; quantity: number; value_cents: number; unit_cost_cents: number | null };

async function loadBundle(supabase: SupabaseClient, ownerId: string, bundleId: string): Promise<Bundle> {
  const { data, error } = await supabase
    .from("bundles")
    .select("*")
    .eq("id", bundleId)
    .eq("owner_id", ownerId)
    .single();
  if (error || !data) throw new ContentsError("Bundle not found", 404, "NOT_FOUND");
  return data as Bundle;
}

function assertEditable(bundle: Bundle): void {
  if (EDITABLE_STATUSES.has(bundle.status)) return;
  const message =
    bundle.status === "listed"
      ? "Bundle contents can only be edited before the bundle is listed"
      : bundle.status === "sold"
        ? "A sold bundle's contents are final"
        : "A cancelled bundle's contents can't be edited";
  throw new ContentsError(message, 409, "NOT_EDITABLE");
}

/** The bundle as the detail page renders it (lines joined with their items). */
export async function bundleWithItems(
  supabase: SupabaseClient,
  ownerId: string,
  bundleId: string,
): Promise<BundleWithItems> {
  const { data, error } = await supabase
    .from("bundles")
    .select("*, bundle_items(*, item:items(*))")
    .eq("id", bundleId)
    .eq("owner_id", ownerId)
    .single();
  if (error || !data) throw new ContentsError("Bundle not found", 404, "NOT_FOUND");
  const { bundle_items, ...rest } = data as Bundle & { bundle_items: Line[] | null };
  return { ...rest, items: bundle_items ?? [] };
}

async function loadLine(
  supabase: SupabaseClient,
  bundleId: string,
  lineId: string,
): Promise<Line> {
  const { data, error } = await supabase
    .from("bundle_items")
    .select("*, item:items(*)")
    .eq("id", lineId)
    .eq("bundle_id", bundleId)
    .single();
  if (error || !data) throw new ContentsError("Bundle line not found", 404, "LINE_NOT_FOUND");
  return data as Line;
}

async function readItem(supabase: SupabaseClient, ownerId: string, itemId: string): Promise<Item> {
  const { data, error } = await supabase
    .from("items")
    .select("*")
    .eq("id", itemId)
    .eq("owner_id", ownerId)
    .single();
  if (error || !data) throw new ContentsError("That item isn't in your inventory", 404, "ITEM_NOT_FOUND");
  return data as Item;
}

/** Bundle-eligible = active, in stock, priced (mirrors the create route). */
function assertEligible(item: Item): void {
  if (!item.active) {
    throw new ContentsError(
      `"${item.name}" is paused — unpause it before putting it in a bundle`,
      409,
      "NOT_ELIGIBLE",
    );
  }
  if ((item.value_cents ?? 0) <= 0) {
    throw new ContentsError(`"${item.name}" has no value yet — price it first`, 409, "NOT_ELIGIBLE");
  }
}

function assertQuantity(quantity: number): void {
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > MAX_LINE_QTY) {
    throw new ContentsError(`quantity must be a whole number between 1 and ${MAX_LINE_QTY}`);
  }
}

function assertCopyCap(item: Item, unitsAfter: number): void {
  const cap = bundleCopyCap(item.value_cents);
  if (unitsAfter > cap) {
    throw new ContentsError(
      `"${item.name}" would exceed this bundle's copy limit (${cap})`,
      409,
      "DUP_CAP",
    );
  }
}

async function lineForItem(
  supabase: SupabaseClient,
  bundleId: string,
  itemId: string,
): Promise<LineSnapshot | null> {
  const { data } = await supabase
    .from("bundle_items")
    .select("id, quantity, value_cents, unit_cost_cents")
    .eq("bundle_id", bundleId)
    .eq("item_id", itemId)
    .maybeSingle();
  return (data as LineSnapshot | null) ?? null;
}

/** Adjust absolute stock for an item (`delta` may be negative). */
async function changeStock(
  supabase: SupabaseClient,
  ownerId: string,
  itemId: string,
  delta: number,
): Promise<void> {
  const { data: current, error } = await supabase
    .from("items")
    .select("quantity")
    .eq("id", itemId)
    .eq("owner_id", ownerId)
    .single();
  if (error || !current) throw new ContentsError("That item isn't in your inventory", 404, "ITEM_NOT_FOUND");
  const next = ((current as { quantity: number | null }).quantity ?? 0) + delta;
  if (next < 0) {
    throw new ContentsError("Not enough unreserved stock for that", 409, "INSUFFICIENT_STOCK");
  }
  const { error: updateError } = await supabase
    .from("items")
    .update({ quantity: next })
    .eq("id", itemId)
    .eq("owner_id", ownerId);
  if (updateError) throw new ContentsError("Inventory update failed", 500, "DB");
}

/**
 * Insert-or-update the bundle line for `item` at `quantity`, refreshing the
 * row's value snapshot when the item is currently priced (a touched line
 * re-prices; untouched lines keep their create-time snapshot).
 */
async function writeLine(
  supabase: SupabaseClient,
  bundleId: string,
  item: Item,
  quantity: number,
): Promise<void> {
  const existing = await lineForItem(supabase, bundleId, item.id);
  const snapshot =
    (item.value_cents ?? 0) > 0
      ? { value_cents: item.value_cents, unit_cost_cents: item.unit_cost_cents }
      : existing
        ? { value_cents: existing.value_cents, unit_cost_cents: existing.unit_cost_cents }
        : null;
  if (!snapshot) throw new ContentsError(`"${item.name}" has no value yet — price it first`, 409, "NOT_ELIGIBLE");
  if (existing) {
    const { error } = await supabase
      .from("bundle_items")
      .update({ quantity, ...snapshot })
      .eq("id", existing.id);
    if (error) throw new ContentsError("Couldn't update the bundle", 500, "DB");
  } else {
    const { error } = await supabase
      .from("bundle_items")
      .insert({ bundle_id: bundleId, item_id: item.id, quantity, ...snapshot });
    if (error) throw new ContentsError("Couldn't update the bundle", 500, "DB");
  }
}

/** Put a line back the way it was (undo step: prior snapshot, or delete). */
async function restoreLine(
  supabase: SupabaseClient,
  bundleId: string,
  itemId: string,
  prior: LineSnapshot | null,
): Promise<void> {
  if (!prior) {
    await supabase.from("bundle_items").delete().eq("bundle_id", bundleId).eq("item_id", itemId);
    return;
  }
  await supabase
    .from("bundle_items")
    .update({
      quantity: prior.quantity,
      value_cents: prior.value_cents,
      unit_cost_cents: prior.unit_cost_cents,
    })
    .eq("id", prior.id);
}

async function removeLineRow(supabase: SupabaseClient, lineId: string): Promise<void> {
  const { error } = await supabase.from("bundle_items").delete().eq("id", lineId);
  if (error) throw new ContentsError("Couldn't update the bundle", 500, "DB");
}

/**
 * Keep the single `allocated` allocation row for (bundle, item) equal to the
 * line's quantity. `quantity <= 0` marks it released instead.
 */
async function setAllocation(
  supabase: SupabaseClient,
  bundleId: string,
  itemId: string,
  quantity: number,
  releaseNote: string | null,
): Promise<void> {
  const { data } = await supabase
    .from("allocations")
    .select("id")
    .eq("bundle_id", bundleId)
    .eq("item_id", itemId)
    .eq("status", "allocated")
    .order("created_at", { ascending: true });
  const rows = (data ?? []) as { id: string }[];
  if (quantity <= 0) {
    for (const row of rows) {
      await supabase
        .from("allocations")
        .update({ status: "released", released_at: new Date().toISOString(), release_note: releaseNote })
        .eq("id", row.id);
    }
    return;
  }
  if (rows.length) {
    const { error } = await supabase.from("allocations").update({ quantity }).eq("id", rows[0].id);
    if (error) throw new ContentsError("Couldn't update the bundle", 500, "DB");
  } else {
    const { error } = await supabase
      .from("allocations")
      .insert({ bundle_id: bundleId, item_id: itemId, quantity, status: "allocated" });
    if (error) throw new ContentsError("Couldn't update the bundle", 500, "DB");
  }
}

async function logMovement(
  supabase: SupabaseClient,
  ownerId: string,
  itemId: string,
  delta: number,
  reason: "reserve" | "release",
  bundleId: string,
  note: string,
): Promise<void> {
  await supabase.from("item_movements").insert({
    item_id: itemId,
    owner_id: ownerId,
    delta,
    reason,
    ref_id: bundleId,
    note,
  });
}

async function recomputeTotal(supabase: SupabaseClient, bundleId: string): Promise<void> {
  const { data: rows } = await supabase
    .from("bundle_items")
    .select("value_cents, quantity")
    .eq("bundle_id", bundleId);
  const total = ((rows ?? []) as { value_cents: number; quantity: number }[]).reduce(
    (n, r) => n + r.value_cents * r.quantity,
    0,
  );
  const { error } = await supabase
    .from("bundles")
    .update({ total_value_cents: total })
    .eq("id", bundleId);
  if (error) throw new ContentsError("Couldn't update the bundle total", 500, "DB");
}

/** Run recorded undo steps (newest first), each best-effort. */
async function runUndo(stack: Array<() => Promise<void>>): Promise<void> {
  for (const undo of stack.reverse()) {
    try {
      await undo();
    } catch {
      // best effort — the original error is what the caller sees
    }
  }
}

function wrap(e: unknown): ContentsError {
  if (e instanceof ContentsError) return e;
  return new ContentsError("Couldn't update the bundle — nothing was changed", 500, "DB");
}

/**
 * POST — add `quantity` units of `itemId` to the bundle (merging into an
 * existing line for that product when there is one).
 */
export async function addLine(
  supabase: SupabaseClient,
  ownerId: string,
  bundleId: string,
  itemId: string,
  quantity: number,
): Promise<BundleWithItems> {
  const bundle = await loadBundle(supabase, ownerId, bundleId);
  assertEditable(bundle);
  assertQuantity(quantity);
  const item = await readItem(supabase, ownerId, itemId);
  assertEligible(item);
  const prior = await lineForItem(supabase, bundleId, itemId);
  const unitsAfter = (prior?.quantity ?? 0) + quantity;
  assertCopyCap(item, unitsAfter);

  const undo: Array<() => Promise<void>> = [];
  try {
    await changeStock(supabase, ownerId, itemId, -quantity);
    undo.push(() => changeStock(supabase, ownerId, itemId, quantity));
    await writeLine(supabase, bundleId, item, unitsAfter);
    undo.push(() => restoreLine(supabase, bundleId, itemId, prior));
    await setAllocation(supabase, bundleId, itemId, unitsAfter, null);
    undo.push(() => setAllocation(supabase, bundleId, itemId, prior?.quantity ?? 0, null));
  } catch (e) {
    await runUndo(undo);
    throw wrap(e);
  }

  await logMovement(
    supabase,
    ownerId,
    itemId,
    -quantity,
    "reserve",
    bundleId,
    `Added to bundle "${bundle.name}"`,
  );
  await recomputeTotal(supabase, bundleId);
  return bundleWithItems(supabase, ownerId, bundleId);
}

/**
 * DELETE — remove a line entirely: its reserved units return to inventory.
 */
export async function removeContentsLine(
  supabase: SupabaseClient,
  ownerId: string,
  bundleId: string,
  lineId: string,
): Promise<BundleWithItems> {
  const bundle = await loadBundle(supabase, ownerId, bundleId);
  assertEditable(bundle);
  const line = await loadLine(supabase, bundleId, lineId);
  const snapshot: LineSnapshot = {
    id: line.id,
    quantity: line.quantity,
    value_cents: line.value_cents,
    unit_cost_cents: line.unit_cost_cents,
  };

  const undo: Array<() => Promise<void>> = [];
  try {
    await changeStock(supabase, ownerId, line.item_id, line.quantity);
    undo.push(() => changeStock(supabase, ownerId, line.item_id, -line.quantity));
    await removeLineRow(supabase, lineId);
    undo.push(async () => {
      await supabase.from("bundle_items").insert({
        bundle_id: bundleId,
        item_id: line.item_id,
        quantity: snapshot.quantity,
        value_cents: snapshot.value_cents,
        unit_cost_cents: snapshot.unit_cost_cents,
      });
    });
    await setAllocation(supabase, bundleId, line.item_id, 0, "Line removed from bundle");
    undo.push(() => setAllocation(supabase, bundleId, line.item_id, line.quantity, null));
  } catch (e) {
    await runUndo(undo);
    throw wrap(e);
  }

  await logMovement(
    supabase,
    ownerId,
    line.item_id,
    line.quantity,
    "release",
    bundleId,
    `Removed from bundle "${bundle.name}"`,
  );
  await recomputeTotal(supabase, bundleId);
  return bundleWithItems(supabase, ownerId, bundleId);
}

/**
 * PATCH — substitute the line's item (`newItemId`) and/or set its quantity
 * (`quantity`, null = keep). Substituting reserves the replacement first,
 * then releases the old line (rollback undoes the reserve if that fails).
 */
export async function patchContentsLine(
  supabase: SupabaseClient,
  ownerId: string,
  bundleId: string,
  lineId: string,
  newItemId: string | null,
  quantity: number | null,
): Promise<BundleWithItems> {
  const bundle = await loadBundle(supabase, ownerId, bundleId);
  assertEditable(bundle);
  const line = await loadLine(supabase, bundleId, lineId);
  const newQty = quantity ?? line.quantity;
  assertQuantity(newQty);
  const targetId = newItemId ?? line.item_id;

  // ── Same item: pure quantity change ───────────────────────────────────────
  if (targetId === line.item_id) {
    const delta = newQty - line.quantity;
    if (delta === 0) return bundleWithItems(supabase, ownerId, bundleId);
    const item = line.item;
    if (delta > 0) {
      assertEligible(item);
      assertCopyCap(item, newQty); // unique(bundle_id, item_id): this is the item's only line
    }

    const undo: Array<() => Promise<void>> = [];
    try {
      if (delta > 0) {
        await changeStock(supabase, ownerId, item.id, -delta);
        undo.push(() => changeStock(supabase, ownerId, item.id, delta));
      }
      await writeLine(supabase, bundleId, item, newQty);
      undo.push(() =>
        restoreLine(supabase, bundleId, item.id, {
          id: line.id,
          quantity: line.quantity,
          value_cents: line.value_cents,
          unit_cost_cents: line.unit_cost_cents,
        }),
      );
      await setAllocation(supabase, bundleId, item.id, newQty, null);
      undo.push(() => setAllocation(supabase, bundleId, item.id, line.quantity, null));
      if (delta < 0) {
        await changeStock(supabase, ownerId, item.id, -delta); // give |delta| back
        undo.push(() => changeStock(supabase, ownerId, item.id, delta));
      }
    } catch (e) {
      await runUndo(undo);
      throw wrap(e);
    }

    await logMovement(
      supabase,
      ownerId,
      item.id,
      -delta,
      delta > 0 ? "reserve" : "release",
      bundleId,
      `Quantity in bundle "${bundle.name}" set to ×${newQty}`,
    );
    await recomputeTotal(supabase, bundleId);
    return bundleWithItems(supabase, ownerId, bundleId);
  }

  // ── Different item: substitute ────────────────────────────────────────────
  const target = await readItem(supabase, ownerId, targetId);
  assertEligible(target);
  const targetPrior = await lineForItem(supabase, bundleId, target.id);
  const unitsAfter = (targetPrior?.quantity ?? 0) + newQty;
  assertCopyCap(target, unitsAfter);

  const undo: Array<() => Promise<void>> = [];
  try {
    // Reserve the replacement first — nothing has changed if this fails.
    await changeStock(supabase, ownerId, target.id, -newQty);
    undo.push(() => changeStock(supabase, ownerId, target.id, newQty));
    await writeLine(supabase, bundleId, target, unitsAfter);
    undo.push(() => restoreLine(supabase, bundleId, target.id, targetPrior));
    await setAllocation(supabase, bundleId, target.id, unitsAfter, null);
    undo.push(() => setAllocation(supabase, bundleId, target.id, targetPrior?.quantity ?? 0, null));

    // Then release the old line.
    await changeStock(supabase, ownerId, line.item_id, line.quantity);
    undo.push(() => changeStock(supabase, ownerId, line.item_id, -line.quantity));
    await removeLineRow(supabase, line.id);
    undo.push(async () => {
      await supabase.from("bundle_items").insert({
        bundle_id: bundleId,
        item_id: line.item_id,
        quantity: line.quantity,
        value_cents: line.value_cents,
        unit_cost_cents: line.unit_cost_cents,
      });
    });
    await setAllocation(supabase, bundleId, line.item_id, 0, "Substituted out of bundle");
    undo.push(() => setAllocation(supabase, bundleId, line.item_id, line.quantity, null));
  } catch (e) {
    await runUndo(undo);
    throw wrap(e);
  }

  await logMovement(
    supabase,
    ownerId,
    target.id,
    -newQty,
    "reserve",
    bundleId,
    `Substituted into bundle "${bundle.name}"`,
  );
  await logMovement(
    supabase,
    ownerId,
    line.item_id,
    line.quantity,
    "release",
    bundleId,
    `Substituted out of bundle "${bundle.name}"`,
  );
  await recomputeTotal(supabase, bundleId);
  return bundleWithItems(supabase, ownerId, bundleId);
}

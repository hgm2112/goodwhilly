import { gameOf } from "@/lib/bundle";
import type { Bundle, Item, Listing, PriceHistoryPoint } from "@/lib/types";

/**
 * Pure, data-honest dashboard math. Everything here is derived from rows the
 * page already fetched — no invented targets, trends, or market figures.
 *
 * Trend reconstruction: value(T) = each tracked item's latest price snapshot
 * at or before T × its CURRENT quantity (quantities aren't part of price
 * history, so the comparison holds stock levels constant). Only items with a
 * snapshot at the window start enter the cohort, so both sides of every
 * comparison cover the same items. When the window is newer than the data,
 * it clips to the earliest snapshot ("since Sep 25" instead of "last 30
 * days"); when there isn't at least ~3 days of span, we return null and the
 * UI shows a neutral state rather than a fake percentage.
 */

const DAY_MS = 86_400_000;
const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

export interface TrendPoint {
  t: number;
  valueCents: number;
}

export interface PortfolioTrend {
  /** Fractional change over the window (0.084 = +8.4%); null when flat/undefined. */
  pct: number | null;
  deltaCents: number;
  fromMs: number;
  toMs: number;
  spanDays: number;
  /** "last 30 days" or "since Sep 25" — describes the ACTUAL span used. */
  label: string;
  series: TrendPoint[];
  cohortSize: number;
}

interface Snap {
  t: number;
  v: number;
}

function snapshotsByItem(history: PriceHistoryPoint[]): Map<string, Snap[]> {
  const map = new Map<string, Snap[]>();
  for (const p of history) {
    const t = Date.parse(p.created_at);
    if (Number.isNaN(t)) continue;
    const list = map.get(p.item_id);
    if (list) list.push({ t, v: p.value_cents });
    else map.set(p.item_id, [{ t, v: p.value_cents }]);
  }
  for (const list of map.values()) list.sort((a, b) => a.t - b.t);
  return map;
}

/** Last snapshot at or before `t`, or undefined when the item wasn't tracked yet. */
function snapAt(list: Snap[], t: number): Snap | undefined {
  let lo = 0;
  let hi = list.length - 1;
  let found: Snap | undefined;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (list[mid].t <= t) {
      found = list[mid];
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return found;
}

function shortDate(ms: number): string {
  const d = new Date(ms);
  return `${MONTHS[d.getMonth()]} ${d.getDate()}`;
}

/**
 * Portfolio value trend over `windowDays` (clipped to available history).
 * Returns null when there isn't enough span to state a change honestly.
 */
export function portfolioTrend(
  items: Item[],
  history: PriceHistoryPoint[],
  opts: { windowDays?: number; now?: number; seriesPoints?: number } = {},
): PortfolioTrend | null {
  const windowDays = opts.windowDays ?? 30;
  const now = opts.now ?? Date.now();
  const seriesPoints = Math.max(2, opts.seriesPoints ?? 16);

  const snaps = snapshotsByItem(history);
  let earliest = Infinity;
  for (const list of snaps.values()) {
    if (list.length && list[0].t < earliest) earliest = list[0].t;
  }
  if (!Number.isFinite(earliest)) return null;

  const fromMs = Math.max(earliest, now - windowDays * DAY_MS);
  const spanDays = (now - fromMs) / DAY_MS;
  if (spanDays < 3) return null;

  const qty = new Map<string, number>();
  for (const i of items) qty.set(i.id, i.quantity);

  // Cohort: tracked items with a value at BOTH ends of the window.
  const cohort: { list: Snap[]; q: number; currentCents: number }[] = [];
  for (const [id, list] of snaps) {
    if (list[0].t > fromMs) continue;
    const item = items.find((i) => i.id === id);
    if (!item || item.value_cents == null) continue;
    cohort.push({ list, q: qty.get(id) ?? 0, currentCents: item.value_cents });
  }
  if (cohort.length === 0) return null;

  const valueAt = (t: number): number => {
    let sum = 0;
    for (const c of cohort) {
      const s = snapAt(c.list, t);
      if (s) sum += s.v * c.q;
    }
    return sum;
  };

  const thenCents = valueAt(fromMs);
  const nowCents = cohort.reduce((a, c) => a + c.currentCents * c.q, 0);
  const deltaCents = nowCents - thenCents;
  const pct = thenCents > 0 ? deltaCents / thenCents : null;

  const series: TrendPoint[] = [];
  for (let k = 0; k < seriesPoints; k++) {
    const t = fromMs + ((now - fromMs) * k) / (seriesPoints - 1);
    series.push({ t, valueCents: k === seriesPoints - 1 ? nowCents : valueAt(t) });
  }

  const clipped = fromMs > now - windowDays * DAY_MS + DAY_MS;
  return {
    pct,
    deltaCents,
    fromMs,
    toMs: now,
    spanDays,
    label: clipped ? `since ${shortDate(fromMs)}` : `last ${windowDays} days`,
    series,
    cohortSize: cohort.length,
  };
}

export interface Mover {
  itemId: string;
  name: string;
  /** Fractional change (0.34 = +34%). */
  pct: number;
  fromCents: number;
  toCents: number;
}

/**
 * Biggest gainers/decliners per item over the window (clipped per item to
 * its first available snapshot — honest "since tracking began for this item
 * within the window"). Items with no in-window baseline or zero change are
 * omitted; callers must not display a gainer/decliner when the list is empty.
 */
export function topMovers(
  items: Item[],
  history: PriceHistoryPoint[],
  opts: { windowDays?: number; now?: number } = {},
): { gainers: Mover[]; decliners: Mover[] } {
  const windowDays = opts.windowDays ?? 30;
  const now = opts.now ?? Date.now();
  const fromMs = now - windowDays * DAY_MS;
  const snaps = snapshotsByItem(history);

  const gainers: Mover[] = [];
  const decliners: Mover[] = [];
  for (const item of items) {
    if (item.value_cents == null) continue;
    const list = snaps.get(item.id);
    if (!list || list.length < 2) continue;
    const base = snapAt(list, fromMs) ?? list[0];
    if (base.t >= now) continue;
    if (base.v <= 0) continue;
    const pct = (item.value_cents - base.v) / base.v;
    if (pct === 0) continue;
    const mover: Mover = {
      itemId: item.id,
      name: item.name,
      pct,
      fromCents: base.v,
      toCents: item.value_cents,
    };
    (pct > 0 ? gainers : decliners).push(mover);
  }
  gainers.sort((a, b) => b.pct - a.pct);
  decliners.sort((a, b) => a.pct - b.pct);
  return { gainers, decliners };
}

export interface GameSlice {
  label: string;
  count: number;
  /** 0..1 share of the item count. */
  share: number;
}

/** Item counts per game (first word of `category`, blank → "Uncategorized"). */
export function gameBreakdown(items: Item[]): GameSlice[] {
  const counts = new Map<string, number>();
  for (const i of items) {
    const label = gameOf(i.category) || "Uncategorized";
    counts.set(label, (counts.get(label) ?? 0) + 1);
  }
  const total = items.length || 1;
  return [...counts.entries()]
    .map(([label, count]) => ({ label, count, share: count / total }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
}

export type AttentionTone = "amber" | "blue" | "red" | "slate";

export interface AttentionTask {
  key: string;
  count: number;
  tone: AttentionTone;
  title: string;
  sub: string;
  href: string;
}

/**
 * Real, actionable inventory states only. Deliberately absent: "items aren't
 * listed" — listings.item_id linkage is best-effort and currently null
 * everywhere, so that count would be a lie.
 */
export function attentionTasks(
  items: Item[],
  bundles: Bundle[],
  listings: Listing[],
): AttentionTask[] {
  const unpriced = items.filter((i) => i.value_cents == null).length;
  const waiting = bundles.filter((b) => b.status === "draft" || b.status === "allocated").length;
  const outOfStock = items.filter((i) => i.quantity <= 0).length;
  const missingPhotos = listings.filter(
    (l) => l.status === "ACTIVE" && (!l.image_urls || l.image_urls.length === 0),
  ).length;
  const paused = items.filter((i) => !i.active).length;

  const tasks: AttentionTask[] = [
    {
      key: "unpriced",
      count: unpriced,
      tone: "amber",
      title: "Items need a price",
      sub: "Run a price refresh to value them",
      href: "/inventory",
    },
    {
      key: "bundles",
      count: waiting,
      tone: "blue",
      title: "Bundles waiting",
      sub: "Draft or reserved bundles to finish",
      href: "/bundles",
    },
    {
      key: "out_of_stock",
      count: outOfStock,
      tone: "amber",
      title: "Out of stock",
      sub: "Restock or pause these rows",
      href: "/inventory",
    },
    {
      key: "missing_photos",
      count: missingPhotos,
      tone: "red",
      title: "Listings need photos",
      sub: "Active eBay listings without artwork",
      href: "/listings",
    },
    {
      key: "paused",
      count: paused,
      tone: "slate",
      title: "Paused items",
      sub: "Hidden from your store",
      href: "/inventory",
    },
  ];
  return tasks.filter((t) => t.count > 0);
}

export interface ListingStats {
  active: number;
  addedThisWeek: number;
  missingPhotos: number;
  total: number;
}

export function listingStats(listings: Listing[], now = Date.now()): ListingStats {
  const weekMs = now - 7 * DAY_MS;
  let active = 0;
  let addedThisWeek = 0;
  let missingPhotos = 0;
  for (const l of listings) {
    if (l.status !== "ACTIVE") continue;
    active++;
    if (!l.image_urls || l.image_urls.length === 0) missingPhotos++;
    if (Date.parse(l.created_at) >= weekMs) addedThisWeek++;
  }
  return { active, addedThisWeek, missingPhotos, total: listings.length };
}

export interface InventoryTotals {
  valueCents: number;
  units: number;
  itemCount: number;
  pricedItems: number;
}

export function inventoryTotals(items: Item[]): InventoryTotals {
  let valueCents = 0;
  let units = 0;
  let priced = 0;
  for (const i of items) {
    valueCents += (i.value_cents ?? 0) * i.quantity;
    units += i.quantity;
    if (i.value_cents != null) priced++;
  }
  return { valueCents, units, itemCount: items.length, pricedItems: priced };
}

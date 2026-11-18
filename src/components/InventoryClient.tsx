"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Modal, NumberInt } from "@/components/ui/Modal";
import { ArtworkThumb } from "@/components/ArtworkThumb";
import { ItemForm } from "@/components/ItemForm";
import { PriceHistoryModal } from "@/components/PriceHistoryModal";
import {
  centsToUsd,
  downloadTextFile,
  formatDate,
  kindLabel,
  pluralize,
  toCsv,
} from "@/lib/utils";
import { inventoryGroupByKey } from "@/lib/inventory-groups";
import type { Item, Location, PriceHistoryPoint } from "@/lib/types";

// ---------------------------------------------------------------------------
// View mode & grouping (persisted). "By type" = grouped list; "By value" = flat.
// ---------------------------------------------------------------------------

type ViewMode = "type" | "value";
const VIEW_MODE_KEY = "gw_inv_view";

function loadViewMode(): ViewMode {
  if (typeof window === "undefined") return "type";
  try {
    const v = window.localStorage.getItem(VIEW_MODE_KEY);
    return v === "value" ? "value" : "type";
  } catch {
    return "type";
  }
}

type ItemGroup = {
  key: string;
  label: string;
  description: string;
  order: number;
};

/**
 * Type-to-group mapping for "By type" view.
 * Order: Secret Lair, Booster packs, Bundles, Ready-to-play decks, Single
 * cards, Other MTG products, Other (non-MTG). A manual group override (set in
 * Edit) wins; otherwise items are auto-grouped by name/kind. Verify against
 * your inventory and adjust keywords/labels/descriptions/order as needed.
 */
function isNonMtg(item: Item): boolean {
  const hay = `${item.name} ${item.category ?? ""}`.toLowerCase();
  return /\b(pok[eé]mon|pokemon|yu-gi-oh|yugioh|ygo|one piece|lorcana|disney|flesh and blood|\bfab\b|topps)\b/i.test(
    hay,
  );
}

function groupForItem(item: Item): ItemGroup {
  const override = inventoryGroupByKey(item.group_override);
  if (override) return override;

  const n = item.name.toLowerCase();

  if (isNonMtg(item)) {
    return {
      key: "non-mtg",
      label: "Other (non-MTG)",
      description: "Cards and items that aren’t Magic: The Gathering.",
      order: 99,
    };
  }
  if (/\bsecret lair\b/.test(n)) {
    return {
      key: "secret-lair",
      label: "Secret Lair",
      description: "Limited-edition collectible drops, sealed.",
      order: 1,
    };
  }
  if (
    /\b(deck|precon|commander deck|starter deck|challenger deck|intro pack)\b/.test(n) ||
    /\b(planeswalker party|eldrazi unbound|enduring enchantments|sliver swarm)\b/.test(n)
  ) {
    return {
      key: "decks",
      label: "Ready-to-play decks",
      description: "Pre-built decks, no building needed.",
      order: 4,
    };
  }
  if (/\bbundle\b/.test(n)) {
    return { key: "bundles", label: "Bundles", description: "Packs plus extras in one box.", order: 3 };
  }
  if (/\b(boosters?|draft packs?|set packs?|play packs?|collector boosters?|jumpstarts?)\b/.test(n)) {
    return {
      key: "boosters",
      label: "Booster packs",
      description: "Sealed packs with random cards inside.",
      order: 2,
    };
  }
  if (item.kind === "loose") {
    return { key: "singles", label: "Single cards", description: "Individual loose cards.", order: 5 };
  }
  return {
    key: "other-mtg",
    label: "Other MTG products",
    description: "Other Magic: The Gathering products.",
    order: 98,
  };
}

function totalValue(item: Item): number | null {
  if (item.value_cents == null) return null;
  return item.value_cents * item.quantity;
}

// Status helpers. "Out of stock" = quantity 0. "Paused" = !active. Both possible.
function isOutOfStock(item: Item) {
  return item.quantity === 0;
}
function isPaused(item: Item) {
  return !item.active;
}

type LocFilter = "all" | "unassigned" | string;

type StatusFilters = {
  active: boolean;
  paused: boolean;
  outOfStock: boolean; // when true, out-of-stock rows are eligible (still gated by showOutOfStock toggle)
};

export function InventoryClient({
  initial,
  initialHistory,
}: {
  initial: Item[];
  initialHistory: Record<string, PriceHistoryPoint[]>;
}) {
  const [items, setItems] = useState<Item[]>(initial);
  const [history, setHistory] = useState<Record<string, PriceHistoryPoint[]>>(initialHistory);
  const [historyItem, setHistoryItem] = useState<Item | null>(null);
  const [q, setQ] = useState("");
  const [viewMode, setViewMode] = useState<ViewMode>("type");
  const [viewModeReady, setViewModeReady] = useState(false);
  const [locFilter, setLocFilter] = useState<LocFilter>("all");
  const [status, setStatus] = useState<StatusFilters>({ active: true, paused: true, outOfStock: true });
  const [showOutOfStock, setShowOutOfStock] = useState(false);
  const [busy, setBusy] = useState(false);
  const [bulkBusy, setBulkBusy] = useState<"dates" | "prices" | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [locations, setLocations] = useState<Location[]>([]);
  const [manageLocations, setManageLocations] = useState(false);

  const [editing, setEditing] = useState<Item | null | "new">(null);
  const [adjusting, setAdjusting] = useState<Item | null>(null);
  const [adjustQty, setAdjustQty] = useState<number | null>(null);
  const [adjustBusy, setAdjustBusy] = useState(false);
  const [adjustError, setAdjustError] = useState<string | null>(null);

  // Detail/selection for list+detail
  const [detailId, setDetailId] = useState<string | null>(null);
  // Mobile: full-screen detail view when true (detailId set)
  const [mobileDetail, setMobileDetail] = useState(false);

  // Bulk selection mode
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkMoveOpen, setBulkMoveOpen] = useState(false);
  const [bulkMoveLoc, setBulkMoveLoc] = useState<string>("");

  // Menus
  const [viewMenuOpen, setViewMenuOpen] = useState(false);
  const [moreMenuOpen, setMoreMenuOpen] = useState(false);
  const [detailMenuOpen, setDetailMenuOpen] = useState(false);

  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setViewMode(loadViewMode());
    setViewModeReady(true);
  }, []);

  useEffect(() => {
    if (!viewModeReady) return;
    try {
      window.localStorage.setItem(VIEW_MODE_KEY, viewMode);
    } catch {}
  }, [viewMode, viewModeReady]);

  const adjustQtyInvalid = adjustQty == null || !Number.isInteger(adjustQty) || adjustQty < 0;
  const adjustUnchanged = !adjustQtyInvalid && adjusting != null && adjustQty === adjusting.quantity;
  const adjustValidation = adjustQtyInvalid ? "Enter a whole number of 0 or more." : null;

  useEffect(() => {
    fetch("/api/locations")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data) setLocations(data.locations ?? []);
      })
      .catch(() => {});
  }, []);

  const load = useCallback(async () => {
    setBusy(true);
    const params = new URLSearchParams();
    if (locFilter === "unassigned") {
      params.set("unassigned", "true");
    } else if (locFilter !== "all") {
      params.set("location_id", locFilter);
    }
    if (q.trim()) params.set("q", q.trim());
    try {
      const res = await fetch(`/api/inventory?${params.toString()}`);
      if (res.ok) setItems(await res.json());
    } finally {
      setBusy(false);
    }
  }, [q, locFilter]);

  useEffect(() => {
    const t = setTimeout(load, 300);
    return () => clearTimeout(t);
  }, [load]);

  const locName = useCallback(
    (id: string | null) => locations.find((l) => l.id === id)?.name,
    [locations],
  );

  const detailItem = useMemo(() => items.find((i) => i.id === detailId) ?? null, [items, detailId]);

  function flash(message: string) {
    setToast(message);
    setTimeout(() => setToast(null), 2500);
  }

  async function fetchHistory(itemId: string) {
    try {
      const res = await fetch(`/api/inventory/${itemId}/price-history`);
      if (!res.ok) return;
      const data = await res.json().catch(() => null);
      if (Array.isArray(data?.points)) {
        setHistory((prev) => ({ ...prev, [itemId]: data.points }));
      }
    } catch {}
  }

  // Filter + view ordering
  const filtered = useMemo(() => {
    const query = q.trim().toLowerCase();
    return items.filter((i) => {
      if (!showOutOfStock && isOutOfStock(i)) return false;
      const paused = isPaused(i);
      const oos = isOutOfStock(i);
      const matchesStatus =
        (status.active && !paused && !oos) ||
        (status.paused && paused) ||
        (status.outOfStock && oos);
      if (!matchesStatus) return false;
      if (query) {
        const hay = `${i.name} ${i.upc ?? ""} ${i.set_code ?? ""} ${i.notes ?? ""}`.toLowerCase();
        if (!hay.includes(query)) return false;
      }
      return true;
    });
  }, [items, q, showOutOfStock, status]);

  const byValueFlat = useMemo(() => {
    return [...filtered].sort((a, b) => {
      const ta = totalValue(a);
      const tb = totalValue(b);
      if (ta == null && tb == null) return a.name.localeCompare(b.name);
      if (ta == null) return 1;
      if (tb == null) return -1;
      if (tb !== ta) return tb - ta;
      return a.name.localeCompare(b.name);
    });
  }, [filtered]);

  function groupItems(list: Item[]) {
    const map = new Map<string, { group: ItemGroup; items: Item[] }>();
    for (const it of list) {
      const g = groupForItem(it);
      const entry = map.get(g.key);
      if (entry) entry.items.push(it);
      else map.set(g.key, { group: g, items: [it] });
    }
    const groups = Array.from(map.values());
    for (const g of groups) {
      g.items.sort((a, b) => b.quantity - a.quantity || a.name.localeCompare(b.name));
    }
    groups.sort((a, b) => a.group.order - b.group.order || a.group.label.localeCompare(b.group.label));
    return groups;
  }

  const activeGroups = useMemo(() => groupItems(filtered.filter((i) => !isPaused(i))), [filtered]);
  const pausedGroups = useMemo(() => groupItems(filtered.filter((i) => isPaused(i))), [filtered]);

  const visibleItems = useMemo(
    () => (viewMode === "value" ? byValueFlat : [...activeGroups.flatMap((g) => g.items), ...pausedGroups.flatMap((g) => g.items)]),
    [viewMode, byValueFlat, activeGroups, pausedGroups],
  );

  const summary = useMemo(() => {
    let value = 0;
    let units = 0;
    for (const it of filtered) {
      value += (it.value_cents ?? 0) * it.quantity;
      units += it.quantity;
    }
    return { value, units, count: filtered.length };
  }, [filtered]);

  const unpricedCount = useMemo(
    () => items.filter((i) => (i.value_cents == null || !i.image_url) && (i.kind === "sealed" || i.kind === "open" || i.kind === "loose")).length,
    [items],
  );
  const undatedCount = useMemo(
    () => items.filter((i) => i.release_date == null && (i.kind === "sealed" || i.kind === "open" || i.kind === "loose")).length,
    [items],
  );

  // --- actions (reused logic) ---
  async function confirmAdjust(e: React.FormEvent) {
    e.preventDefault();
    if (!adjusting || adjustBusy) return;
    const qty = adjustQty;
    if (qty == null || !Number.isInteger(qty) || qty < 0) {
      setAdjustError("Enter a whole number of 0 or more.");
      return;
    }
    const delta = qty - adjusting.quantity;
    if (delta === 0) return;
    setAdjustBusy(true);
    setAdjustError(null);
    try {
      const res = await fetch("/api/inventory/adjust", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itemId: adjusting.id, delta, reason: delta > 0 ? "add" : "remove" }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setAdjustError(data?.error ?? "Couldn't update stock. Try again.");
        return;
      }
      setAdjusting(null);
      load();
    } catch {
      setAdjustError("Couldn't reach the server. Try again.");
    } finally {
      setAdjustBusy(false);
    }
  }

  async function toggleActive(item: Item) {
    await fetch(`/api/inventory/${item.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ active: !item.active }),
    });
    load();
  }

  async function remove(item: Item) {
    if (item.quantity > 0) {
      const ok = window.confirm(`Delete "${item.name}"? Its ${pluralize(item.quantity, "unit")} of stock will be removed too.`);
      if (!ok) return;
      const adj = await fetch("/api/inventory/adjust", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itemId: item.id, delta: -item.quantity, reason: "remove", note: "Removed with item" }),
      });
      const adjData = await adj.json().catch(() => null);
      if (!adj.ok) {
        flash(adjData?.error ?? "Could not remove stock");
        return;
      }
    } else {
      if (!window.confirm(`Delete "${item.name}"?`)) return;
    }
    const res = await fetch(`/api/inventory/${item.id}`, { method: "DELETE" });
    const data = await res.json().catch(() => null);
    flash(data?.error ?? "Deleted");
    if (detailId === item.id) {
      setDetailId(null);
      setMobileDetail(false);
    }
    load();
  }

  async function refreshPrice(item: Item) {
    setBusy(true);
    try {
      const res = await fetch("/api/inventory/refresh-price", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itemId: item.id }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        flash(data?.error ?? "Refresh failed");
      } else {
        flash(`Value updated: ${centsToUsd(data?.value_cents ?? null)}`);
        void fetchHistory(item.id);
      }
      load();
    } catch {
      flash("Refresh failed — check your connection");
    } finally {
      setBusy(false);
    }
  }

  type BulkData = { refreshed?: number | null; failed?: number; error?: string; historyPoints?: PriceHistoryPoint[] };
  type BulkResp = { ok: boolean; data: BulkData | null };
  async function postBulk(scope: string): Promise<BulkResp> {
    try {
      const res = await fetch("/api/inventory/refresh-price", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scope }),
      });
      const data = (await res.json().catch(() => null)) as BulkData | null;
      return { ok: res.ok && data?.refreshed != null, data };
    } catch {
      return { ok: false, data: null };
    }
  }
  function mergeHistory(resp: BulkResp) {
    const points = resp.data?.historyPoints;
    if (!Array.isArray(points) || points.length === 0) return;
    setHistory((prev) => {
      const next = { ...prev };
      for (const p of points) next[p.item_id] = [...(next[p.item_id] ?? []), p];
      return next;
    });
  }
  async function refreshDatesAndPrices() {
    setBusy(true);
    setBulkBusy("dates");
    const parts: string[] = [];
    try {
      if (undatedCount > 0) {
        const resp = await postBulk("no_release_date");
        if (resp.ok) {
          const n = resp.data?.refreshed ?? 0;
          parts.push(n > 0 ? `Dated ${n} item${n === 1 ? "" : "s"}` : "No dates found yet");
          if (resp.data?.failed) parts.push(`${resp.data.failed} date${resp.data.failed === 1 ? "" : "s"} failed`);
        } else {
          parts.push(resp.data?.error ?? "date lookup failed");
        }
      }
      if (unpricedCount > 0) {
        const resp = await postBulk("unpriced");
        if (resp.ok) {
          mergeHistory(resp);
          const n = resp.data?.refreshed ?? 0;
          parts.push(n > 0 ? `Priced ${n} new item${n === 1 ? "" : "s"}` : "Nothing to price yet");
          if (resp.data?.failed) parts.push(`${resp.data.failed} price${resp.data.failed === 1 ? "" : "s"} failed`);
        } else {
          parts.push(resp.data?.error ?? "price refresh failed");
        }
      }
      flash(parts.join(" · ") || "Nothing to refresh");
    } finally {
      setBusy(false);
      setBulkBusy(null);
      load();
    }
  }
  async function refreshAllPrices() {
    setBusy(true);
    setBulkBusy("prices");
    try {
      const resp = await postBulk("all");
      if (!resp.ok) {
        flash(resp.data?.error ?? "Refresh failed");
      } else {
        mergeHistory(resp);
        const n = resp.data?.refreshed ?? 0;
        const msg = n > 0 ? `Refreshed ${n} price${n === 1 ? "" : "s"}` : "Nothing to refresh";
        flash(resp.data?.failed ? `${msg} · ${resp.data.failed} failed` : msg);
      }
    } finally {
      setBusy(false);
      setBulkBusy(null);
      load();
    }
  }

  async function onImport(files: FileList | null) {
    const file = files?.[0];
    if (!file) return;
    const text = await file.text();
    const res = await fetch("/api/inventory/import", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ csv: text }),
    });
    if (!res.ok) {
      flash("Import failed");
      return;
    }
    const json = await res.json().catch(() => null);
    flash(`Imported: ${json?.created ?? 0} created, ${json?.updated ?? 0} updated, ${json?.skipped ?? 0} skipped`);
    load();
  }

  // Location is editable via the item form; bulk move uses the selection bar.

  // locations management
  async function addLocation() {
    const name = window.prompt("New storage location name", "");
    if (name == null) return;
    const res = await fetch("/api/locations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: name.trim() }),
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      flash(data?.error ?? "Could not add location");
      return;
    }
    setLocations((prev) => [...prev, data].sort((a, b) => a.name.localeCompare(b.name)));
    flash(`Added "${data.name}"`);
  }
  async function renameLocation(loc: Location) {
    const name = window.prompt("Rename storage location", loc.name);
    if (name == null) return;
    const res = await fetch(`/api/locations/${loc.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: name.trim() }),
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      flash(data?.error ?? "Could not rename location");
      return;
    }
    setLocations((prev) => prev.map((l) => (l.id === loc.id ? { ...l, name: data.name } : l)));
    flash(`Renamed to "${data.name}"`);
  }
  async function deleteLocation(loc: Location) {
    if (!window.confirm(`Delete "${loc.name}"? Items there become Unassigned.`)) return;
    const res = await fetch(`/api/locations/${loc.id}`, { method: "DELETE" });
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      flash(data?.error ?? "Could not delete location");
      return;
    }
    setLocations((prev) => prev.filter((l) => l.id !== loc.id));
    if (locFilter === loc.id) setLocFilter("all");
    load();
    flash(`Deleted "${loc.name}"`);
  }

  // selection helpers
  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }
  function clearSelection() {
    setSelected(new Set());
    setSelectMode(false);
    setBulkMoveOpen(false);
  }
  function selectAllVisible() {
    setSelected(new Set(visibleItems.map((i) => i.id)));
  }

  async function bulkSetActive(active: boolean) {
    const ids = Array.from(selected);
    if (ids.length === 0) return;
    let ok = 0;
    for (const id of ids) {
      const res = await fetch(`/api/inventory/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ active }),
      });
      if (res.ok) ok++;
    }
    flash(`${active ? "Resumed" : "Paused"} ${ok} item${ok === 1 ? "" : "s"}`);
    clearSelection();
    load();
  }
  async function bulkMove(locationId: string) {
    const ids = Array.from(selected);
    if (ids.length === 0) return;
    let ok = 0;
    for (const id of ids) {
      const res = await fetch(`/api/inventory/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ location_id: locationId || null }),
      });
      if (res.ok) ok++;
    }
    flash(`Moved ${ok} item${ok === 1 ? "" : "s"}`);
    clearSelection();
    load();
  }
  async function bulkDelete() {
    const ids = Array.from(selected);
    if (ids.length === 0) return;
    if (!window.confirm(`Delete ${ids.length} selected item${ids.length === 1 ? "" : "s"}? Stock will be removed for any that still have units.`)) return;
    let ok = 0;
    for (const id of ids) {
      const item = items.find((i) => i.id === id);
      if (!item) continue;
      if (item.quantity > 0) {
        const adj = await fetch("/api/inventory/adjust", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ itemId: id, delta: -item.quantity, reason: "remove", note: "Removed with item (bulk)" }),
        });
        if (!adj.ok) continue;
      }
      const res = await fetch(`/api/inventory/${id}`, { method: "DELETE" });
      if (res.ok) ok++;
    }
    flash(`Deleted ${ok} item${ok === 1 ? "" : "s"}`);
    if (detailId && selected.has(detailId)) {
      setDetailId(null);
      setMobileDetail(false);
    }
    clearSelection();
    load();
  }

  function openDetail(item: Item) {
    setDetailId(item.id);
    setDetailMenuOpen(false);
    if (typeof window !== "undefined" && window.matchMedia("(max-width: 1023px)").matches) {
      setMobileDetail(true);
    }
  }
  function closeMobileDetail() {
    setMobileDetail(false);
  }

  function exportCsv() {
    const rows = visibleItems;
    downloadTextFile(
      "goodwhilly-inventory.csv",
      toCsv([
        ["name", "kind", "upc", "set_code", "category", "location", "quantity", "unit_cost", "value", "total_value", "foil", "group_override"],
        ...rows.map((i) => [
          i.name,
          i.kind,
          i.upc ?? "",
          i.set_code ?? "",
          i.category ?? "",
          locName(i.location_id) ?? "",
          String(i.quantity),
          i.unit_cost_cents != null ? (i.unit_cost_cents / 100).toFixed(2) : "",
          i.value_cents != null ? (i.value_cents / 100).toFixed(2) : "",
          i.value_cents != null ? ((i.value_cents * i.quantity) / 100).toFixed(2) : "",
          i.is_foil ? "true" : "false",
          i.group_override ?? "",
        ]),
      ]),
      "text/csv",
    );
  }

  // Derive the detail item fresh each render (in case items updated)
  const currentDetail = detailId ? items.find((i) => i.id === detailId) ?? detailItem : null;

  const listContent = (
    <div className="min-h-0 flex-1 overflow-y-auto">
      {filtered.length === 0 ? (
        <div className="card m-3 text-center">
          <p className="text-sm italic text-slate-500 dark:text-slate-400">No items found.</p>
        </div>
      ) : viewMode === "value" ? (
        <ul className="divide-y divide-slate-100 dark:divide-slate-800">
          {byValueFlat.map((item) => (
            <Row
              key={item.id}
              item={item}
              selected={selected.has(item.id)}
              selectMode={selectMode}
              active={detailId === item.id}
              onOpen={() => (selectMode ? toggleSelect(item.id) : openDetail(item))}
              onToggleSelect={() => toggleSelect(item.id)}
              onRefresh={() => refreshPrice(item)}
              onPriceHistory={() => setHistoryItem(item)}
            />
          ))}
        </ul>
      ) : (
        <div>
          {activeGroups.map(({ group, items: gitems }) => (
            <section key={group.key} className="mb-2">
              <div className="sticky top-0 z-[1] bg-slate-100/95 px-3 pb-1 pt-3 backdrop-blur dark:bg-slate-950/95">
                <h2 className="text-sm font-bold text-slate-800 dark:text-slate-100">{group.label}</h2>
                <p className="hint">{group.description}</p>
              </div>
              <ul className="divide-y divide-slate-100 border-y border-slate-100 bg-white dark:divide-slate-800 dark:border-slate-800 dark:bg-slate-900">
                {gitems.map((item) => (
                  <Row
                    key={item.id}
                    item={item}
                    selected={selected.has(item.id)}
                    selectMode={selectMode}
                    active={detailId === item.id}
                    onOpen={() => (selectMode ? toggleSelect(item.id) : openDetail(item))}
                    onToggleSelect={() => toggleSelect(item.id)}
                    onRefresh={() => refreshPrice(item)}
                    onPriceHistory={() => setHistoryItem(item)}
                  />
                ))}
              </ul>
            </section>
          ))}
          {pausedGroups.length > 0 && (
            <section className="mb-2 mt-4">
              <div className="sticky top-0 z-[1] bg-slate-100/95 px-3 pb-1 pt-3 backdrop-blur dark:bg-slate-950/95">
                <h2 className="text-sm font-bold text-slate-800 dark:text-slate-100">Paused</h2>
                <p className="hint">Items hidden from the store, grouped by type.</p>
              </div>
              {pausedGroups.map(({ group, items: gitems }) => (
                <div key={`paused-${group.key}`} className="mb-2">
                  <div className="bg-slate-50 px-3 pb-1 pt-2 dark:bg-slate-900/60">
                    <h3 className="text-xs font-bold uppercase tracking-wide text-slate-600 dark:text-slate-300">{group.label}</h3>
                    <p className="hint">{group.description}</p>
                  </div>
                  <ul className="divide-y divide-slate-100 border-y border-slate-100 bg-white dark:divide-slate-800 dark:border-slate-800 dark:bg-slate-900">
                    {gitems.map((item) => (
                      <Row
                        key={item.id}
                        item={item}
                        selected={selected.has(item.id)}
                        selectMode={selectMode}
                        active={detailId === item.id}
                        onOpen={() => (selectMode ? toggleSelect(item.id) : openDetail(item))}
                        onToggleSelect={() => toggleSelect(item.id)}
                        onRefresh={() => refreshPrice(item)}
                        onPriceHistory={() => setHistoryItem(item)}
                      />
                    ))}
                  </ul>
                </div>
              ))}
            </section>
          )}
        </div>
      )}
    </div>
  );

  return (
    <div className="flex h-[calc(100dvh-8rem)] min-h-[480px] flex-col">
      {/* Header + summary */}
      <div className="mb-3 flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
        <h1 className="text-2xl font-bold">Inventory</h1>
        <p className="text-xs text-slate-500 dark:text-slate-400 sm:text-sm">
          {summary.count} item{summary.count === 1 ? "" : "s"} · {summary.units} units · total{" "}
          <span className="inline-flex items-center rounded-full bg-gradient-to-r from-orange-300 via-orange-500 to-orange-600 px-2 py-0.5 font-semibold text-slate-950 shadow-sm">
            {centsToUsd(summary.value)}
          </span>
        </p>
      </div>

      {/* Top bar. Mobile: line 1 = search + Add, line 2 = By type/value + View + ⋯. sm+: single wrapping row. */}
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <input
          className="input order-1 min-w-0 flex-1 sm:order-none sm:max-w-xs"
          placeholder="Search name / barcode / set…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <button className="btn btn-accent order-2 whitespace-nowrap sm:order-none" onClick={() => setEditing("new")}>+ Add</button>
        <div className="order-3 h-0 basis-full sm:hidden" aria-hidden="true" />
        <div className="order-4 flex flex-1 rounded-lg border border-slate-200 bg-white p-0.5 dark:border-slate-700 dark:bg-slate-900 sm:order-none sm:inline-flex sm:flex-none">
          <button
            type="button"
            className={`flex-1 rounded-md px-3 py-1.5 text-center text-sm font-semibold sm:flex-none ${viewMode === "type" ? "bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900" : "text-slate-600 dark:text-slate-300"}`}
            onClick={() => setViewMode("type")}
          >
            By type
          </button>
          <button
            type="button"
            className={`flex-1 rounded-md px-3 py-1.5 text-center text-sm font-semibold sm:flex-none ${viewMode === "value" ? "bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900" : "text-slate-600 dark:text-slate-300"}`}
            onClick={() => setViewMode("value")}
          >
            By value
          </button>
        </div>

        {/* View menu */}
        <div className="relative order-5 sm:order-none">
          <button type="button" className="btn btn-secondary" onClick={() => { setViewMenuOpen((v) => !v); setMoreMenuOpen(false); }}>
            View
          </button>
          {viewMenuOpen && (
            <Menu onClose={() => setViewMenuOpen(false)}>
              <div className="px-3 py-2 text-xs font-bold uppercase tracking-wide text-slate-500">Filters</div>
              <label className="flex items-center gap-2 px-3 py-1.5 text-sm">
                <input type="checkbox" checked={showOutOfStock} onChange={(e) => setShowOutOfStock(e.target.checked)} />
                Show out of stock
              </label>
              <div className="px-3 py-1 text-xs font-semibold text-slate-500">Location</div>
              <div className="px-3 pb-2">
                <select className="input" value={locFilter} onChange={(e) => setLocFilter(e.target.value as LocFilter)}>
                  <option value="all">All locations</option>
                  <option value="unassigned">Unassigned</option>
                  {locations.map((l) => (<option key={l.id} value={l.id}>{l.name}</option>))}
                </select>
              </div>
              <div className="px-3 py-1 text-xs font-semibold text-slate-500">Status</div>
              <label className="flex items-center gap-2 px-3 py-1 text-sm"><input type="checkbox" checked={status.active} onChange={(e) => setStatus((s) => ({ ...s, active: e.target.checked }))} />In stock & active</label>
              <label className="flex items-center gap-2 px-3 py-1 text-sm"><input type="checkbox" checked={status.paused} onChange={(e) => setStatus((s) => ({ ...s, paused: e.target.checked }))} />Paused</label>
              <label className="flex items-center gap-2 px-3 py-1 pb-2 text-sm"><input type="checkbox" checked={status.outOfStock} onChange={(e) => setStatus((s) => ({ ...s, outOfStock: e.target.checked }))} />Out of stock</label>
              <div className="border-t border-slate-100 px-3 py-2 dark:border-slate-800">
                <button type="button" className="btn btn-secondary w-full" onClick={() => { setManageLocations(true); setViewMenuOpen(false); }}>Manage locations</button>
              </div>
              <div className="border-t border-slate-100 px-3 py-2 dark:border-slate-800">
                <div className="mb-1 text-xs font-semibold text-slate-500">Bulk pricing tools</div>
                <button type="button" className="btn btn-secondary mb-1 w-full justify-start" disabled={busy || (undatedCount === 0 && unpricedCount === 0)} onClick={() => { setViewMenuOpen(false); void refreshDatesAndPrices(); }}>
                  ↻ Fill missing dates & prices {undatedCount + unpricedCount > 0 ? `(${undatedCount + unpricedCount})` : ""}
                </button>
                <button type="button" className="btn btn-secondary w-full justify-start" disabled={busy} onClick={() => { setViewMenuOpen(false); void refreshAllPrices(); }}>
                  $ Re-price all (up to 50)
                </button>
              </div>
            </Menu>
          )}
        </div>

        {/* More ⋯ menu */}
        <div className="relative order-6 sm:order-none">
          <button type="button" className="btn btn-secondary px-3" aria-label="More" onClick={() => { setMoreMenuOpen((v) => !v); setViewMenuOpen(false); }}>⋯</button>
          {moreMenuOpen && (
            <Menu onClose={() => setMoreMenuOpen(false)} align="right">
              <button type="button" className="block w-full px-3 py-3 text-left text-sm hover:bg-slate-50 dark:hover:bg-slate-800" onClick={() => { setSelectMode(true); setMoreMenuOpen(false); }}>Select items…</button>
              <div className="border-t border-slate-100 px-3 pt-2 text-xs font-bold uppercase tracking-wide text-slate-500 dark:border-slate-800">Data</div>
              <button type="button" className="block w-full px-3 py-3 text-left text-sm hover:bg-slate-50 dark:hover:bg-slate-800" onClick={() => { setMoreMenuOpen(false); fileRef.current?.click(); }}>Import CSV</button>
              <button type="button" className="block w-full px-3 py-3 text-left text-sm hover:bg-slate-50 dark:hover:bg-slate-800" onClick={() => { setMoreMenuOpen(false); exportCsv(); }}>Export</button>
            </Menu>
          )}
        </div>
        <input ref={fileRef} type="file" accept=".csv,text/csv" className="hidden" onChange={(e) => onImport(e.target.files)} />
      </div>

      {busy && <p className="mb-1 text-xs text-slate-400">Working… {bulkBusy === "prices" ? "re-pricing" : bulkBusy === "dates" ? "filling dates/prices" : ""}</p>}

      {/* Main area: list + detail (desktop) */}
      <div className="card flex min-h-0 flex-1 overflow-hidden p-0">
        <div className={`flex min-h-0 flex-1 flex-col ${currentDetail ? "lg:max-w-[52%] lg:border-r lg:border-slate-200 lg:dark:border-slate-800" : ""}`}>
          {listContent}
        </div>
        {/* Desktop detail panel */}
        <div className="hidden min-h-0 flex-1 lg:block">
          {currentDetail ? (
            <DetailPanel
              item={currentDetail}
              history={history[currentDetail.id] ?? []}
              locationName={locName(currentDetail.location_id) ?? "Unassigned"}
              onClose={() => setDetailId(null)}
              onEdit={() => setEditing(currentDetail)}
              onAddStock={() => { setAdjusting(currentDetail); setAdjustQty(currentDetail.quantity); setAdjustError(null); }}
              onToggleActive={() => toggleActive(currentDetail)}
              onDelete={() => remove(currentDetail)}
              onRefresh={() => refreshPrice(currentDetail)}
              onHistory={() => setHistoryItem(currentDetail)}
              menuOpen={detailMenuOpen}
              setMenuOpen={setDetailMenuOpen}
            />
          ) : (
            <div className="flex h-full items-center justify-center p-6 text-center">
              <p className="hint">Select an item to see its details.</p>
            </div>
          )}
        </div>
      </div>

      {/* Selection bottom bar */}
      {selectMode && (
        <div className="fixed inset-x-0 bottom-0 z-40 border-t border-slate-200 bg-white p-3 shadow-lg dark:border-slate-800 dark:bg-slate-900 sm:bottom-4 sm:left-1/2 sm:w-auto sm:-translate-x-1/2 sm:rounded-xl sm:border">
          <div className="mb-2 flex items-center justify-between gap-2 text-sm">
            <span className="font-semibold">{selected.size} selected</span>
            <div className="flex gap-2">
              <button type="button" className="text-blue-700 dark:text-blue-400 underline" onClick={selectAllVisible}>Select all</button>
              <button type="button" className="text-slate-500 underline" onClick={clearSelection}>Cancel</button>
            </div>
          </div>
          {bulkMoveOpen ? (
            <div className="flex flex-wrap items-end gap-2">
              <div className="min-w-40 flex-1">
                <label className="label mb-1">Move to location</label>
                <select className="input" value={bulkMoveLoc} onChange={(e) => setBulkMoveLoc(e.target.value)}>
                  <option value="">Unassigned</option>
                  {locations.map((l) => (<option key={l.id} value={l.id}>{l.name}</option>))}
                </select>
              </div>
              <button type="button" className="btn btn-primary" onClick={() => void bulkMove(bulkMoveLoc)}>Move</button>
              <button type="button" className="btn btn-secondary" onClick={() => setBulkMoveOpen(false)}>Back</button>
            </div>
          ) : (
            <div className="flex flex-nowrap gap-1 sm:flex-wrap sm:gap-2">
              <button type="button" className="btn btn-secondary min-w-0 flex-1 px-2 py-2 text-xs sm:flex-none sm:px-3 sm:py-2 sm:text-sm" onClick={() => setBulkMoveOpen(true)}>
                <span className="sm:hidden">Move</span>
                <span className="hidden sm:inline">Move to location</span>
              </button>
              <button type="button" className="btn btn-secondary min-w-0 flex-1 px-2 py-2 text-xs sm:flex-none sm:px-3 sm:py-2 sm:text-sm" onClick={() => void bulkSetActive(false)}>Pause</button>
              <button type="button" className="btn btn-secondary min-w-0 flex-1 px-2 py-2 text-xs sm:flex-none sm:px-3 sm:py-2 sm:text-sm" onClick={() => void bulkSetActive(true)}>Resume</button>
              <button type="button" className="btn btn-danger min-w-0 flex-1 px-2 py-2 text-xs sm:flex-none sm:px-3 sm:py-2 sm:text-sm" onClick={() => void bulkDelete()}>Delete</button>
            </div>
          )}
        </div>
      )}

      {/* Mobile full-screen detail */}
      {mobileDetail && currentDetail && (
        <div className="fixed inset-0 z-50 flex flex-col bg-white dark:bg-slate-950 lg:hidden">
          <div className="flex items-center gap-2 border-b border-slate-200 px-3 py-2 dark:border-slate-800">
            <button type="button" className="btn btn-ghost px-2" onClick={closeMobileDetail}>← Back</button>
            <span className="min-w-0 flex-1 truncate font-semibold">{currentDetail.name}</span>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto">
            <DetailPanel
              item={currentDetail}
              history={history[currentDetail.id] ?? []}
              locationName={locName(currentDetail.location_id) ?? "Unassigned"}
              onClose={closeMobileDetail}
              onEdit={() => setEditing(currentDetail)}
              onAddStock={() => { setAdjusting(currentDetail); setAdjustQty(currentDetail.quantity); setAdjustError(null); }}
              onToggleActive={() => toggleActive(currentDetail)}
              onDelete={() => remove(currentDetail)}
              onRefresh={() => refreshPrice(currentDetail)}
              onHistory={() => setHistoryItem(currentDetail)}
              menuOpen={detailMenuOpen}
              setMenuOpen={setDetailMenuOpen}
              mobileActions
            />
          </div>
        </div>
      )}

      {/* Add is in the top bar (line 1 on mobile); floating + button removed. */}

      {toast && (
        <div className="fixed inset-x-4 bottom-24 z-50 rounded-lg bg-slate-900 px-4 py-2.5 text-center text-sm font-medium text-white shadow-xl sm:bottom-6">
          {toast}
        </div>
      )}

      {/* Modals */}
      <Modal open={editing !== null} onClose={() => setEditing(null)} title={editing === "new" ? "Add item" : "Edit item"}>
        {editing !== null && (
          <ItemForm
            initial={editing === "new" ? null : editing}
            locations={locations}
            onSaved={(saved) => {
              setEditing(null);
              load();
              void fetchHistory(saved.id);
            }}
            onClose={() => setEditing(null)}
          />
        )}
      </Modal>

      <PriceHistoryModal item={historyItem ? (items.find((i) => i.id === historyItem.id) ?? historyItem) : null} onClose={() => setHistoryItem(null)} />

      <Modal open={adjusting !== null} onClose={() => { if (!adjustBusy) setAdjusting(null); }} title="Adjust stock">
        {adjusting && (
          <form onSubmit={confirmAdjust} className="space-y-4">
            <p className="text-sm text-slate-600 dark:text-slate-300">
              <span className="font-semibold">{adjusting.name}</span> — currently {pluralize(adjusting.quantity, "unit")}.
            </p>
            <div className="flex items-center justify-center gap-2">
              <button type="button" className="btn btn-secondary px-4 py-3 text-lg" onClick={() => setAdjustQty((qv) => Math.max(0, (qv ?? 0) - 1))} disabled={adjustBusy || adjustQty == null || adjustQty <= 0} aria-label="Decrease quantity">−</button>
              <NumberInt value={adjustQty} onChange={(v) => { setAdjustQty(v); setAdjustError(null); }} min={0} className="w-24 text-center text-lg font-semibold" />
              <button type="button" className="btn btn-secondary px-4 py-3 text-lg" onClick={() => setAdjustQty((qv) => Math.min(999_999_999, (qv ?? 0) + 1))} disabled={adjustBusy} aria-label="Increase quantity">+</button>
            </div>
            {(adjustError ?? adjustValidation) && (
              <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">{adjustError ?? adjustValidation}</p>
            )}
            <div className="flex justify-end gap-2">
              <button type="button" className="btn btn-ghost" onClick={() => setAdjusting(null)} disabled={adjustBusy}>Cancel</button>
              <button type="submit" className="btn btn-primary" disabled={adjustBusy || adjustValidation != null || adjustUnchanged}>
                {adjustBusy ? "Updating…" : "Update Stock"}
              </button>
            </div>
          </form>
        )}
      </Modal>

      <Modal open={manageLocations} onClose={() => setManageLocations(false)} title="Storage locations">
        <ul className="divide-y divide-slate-100 dark:divide-slate-800">
          {locations.length === 0 && <li className="py-2 text-sm text-slate-500 dark:text-slate-400">No locations yet — add your first box.</li>}
          {locations.map((loc) => (
            <li key={loc.id} className="flex items-center justify-between gap-2 py-1.5">
              <span className="text-sm font-medium">{loc.name}</span>
              <span className="flex gap-1">
                <button className="btn btn-ghost px-2 py-1 text-xs" onClick={() => renameLocation(loc)}>Rename</button>
                <button className="btn btn-ghost px-2 py-1 text-xs text-red-600 dark:text-red-400" onClick={() => deleteLocation(loc)}>Delete</button>
              </span>
            </li>
          ))}
        </ul>
        <button className="btn btn-secondary mt-2 w-full" onClick={addLocation}>+ Add location</button>
      </Modal>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Row (list item)
// ---------------------------------------------------------------------------

function Row({
  item,
  selected,
  selectMode,
  active,
  onOpen,
  onToggleSelect,
  onRefresh,
  onPriceHistory,
}: {
  item: Item;
  selected: boolean;
  selectMode: boolean;
  active: boolean;
  onOpen: () => void;
  onToggleSelect: () => void;
  onRefresh: () => void;
  onPriceHistory: () => void;
}) {
  const tv = totalValue(item);
  const paused = isPaused(item);
  const oos = isOutOfStock(item);
  const dim = paused || oos;

  return (
    <li
      className={`group flex items-center gap-3 px-3 py-2 ${active ? "bg-blue-50 dark:bg-blue-950/30" : "hover:bg-slate-50 dark:hover:bg-slate-800/50"} ${selected ? "bg-blue-50/70 dark:bg-blue-950/20" : ""}`}
    >
      {selectMode && (
        <input
          type="checkbox"
          className="h-5 w-5 shrink-0"
          checked={selected}
          onChange={onToggleSelect}
          onClick={(e) => e.stopPropagation()}
          aria-label={`Select ${item.name}`}
        />
      )}
      <button type="button" className="flex min-w-0 flex-1 items-center gap-3 text-left" onClick={onOpen}>
        <div className={`h-14 w-14 shrink-0 overflow-hidden rounded-md bg-slate-100 dark:bg-slate-800 sm:h-14 sm:w-14 ${dim ? "opacity-50" : ""}`}>
          {item.image_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={item.image_url} alt="" className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-[10px] font-semibold text-slate-400">{kindLabel(item.kind)}</div>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
            <span className={`truncate font-semibold ${dim ? "text-slate-500 dark:text-slate-400" : "text-slate-900 dark:text-slate-100"}`}>{item.name}</span>
            {paused && <span className="badge badge-slate">Paused</span>}
            {oos && <span className="badge badge-red">Out of stock</span>}
          </div>
          {(item.kind === "sealed" || item.is_foil) && (
            <p className="truncate text-xs text-slate-500 dark:text-slate-400">
              {item.kind === "sealed" ? (item.is_foil ? "Sealed · Foil" : "Sealed") : "Foil"}
            </p>
          )}
          <p className="mt-0.5 text-xs text-slate-600 dark:text-slate-300">
            Qty {item.quantity} · {item.value_cents != null ? `${centsToUsd(item.value_cents)} each` : <span className="text-slate-400">No price yet</span>}
            {tv != null && <span className="text-slate-400"> · {centsToUsd(tv)} total</span>}
          </p>
        </div>
        <div className="hidden shrink-0 text-right sm:block">
          {item.value_cents != null ? (
            <>
              <div className="font-semibold text-emerald-700 dark:text-emerald-400">{centsToUsd(item.value_cents)}</div>
              <div className="text-xs text-slate-400">each</div>
            </>
          ) : (
            <div className="text-xs text-slate-400">No price yet</div>
          )}
        </div>
      </button>
      {!selectMode && (
        <div className="flex shrink-0 items-center gap-1">
          <IconButton title="Refresh price" onClick={(e) => { e.stopPropagation(); onRefresh(); }}>↻</IconButton>
          <IconButton title="Price / value (price history)" onClick={(e) => { e.stopPropagation(); onPriceHistory(); }}>$</IconButton>
        </div>
      )}
    </li>
  );
}

function IconButton({ title, onClick, children }: { title: string; onClick: (e: React.MouseEvent) => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      onClick={onClick}
      className="flex h-11 w-11 items-center justify-center rounded-md text-slate-500 hover:bg-slate-100 hover:text-slate-800 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100"
    >
      <span className="text-lg leading-none">{children}</span>
    </button>
  );
}

// ---------------------------------------------------------------------------
// Detail panel
// ---------------------------------------------------------------------------

function DetailPanel({
  item,
  history,
  locationName,
  onClose,
  onEdit,
  onAddStock,
  onToggleActive,
  onDelete,
  onRefresh,
  onHistory,
  menuOpen,
  setMenuOpen,
  mobileActions,
}: {
  item: Item;
  history: PriceHistoryPoint[];
  locationName: string;
  onClose: () => void;
  onEdit: () => void;
  onAddStock: () => void;
  onToggleActive: () => void;
  onDelete: () => void;
  onRefresh: () => void;
  onHistory: () => void;
  menuOpen: boolean;
  setMenuOpen: (v: boolean) => void;
  mobileActions?: boolean;
}) {
  const tv = totalValue(item);
  const paused = isPaused(item);
  const oos = isOutOfStock(item);
  const primaryLabel = paused ? "Resume" : oos ? "Restock" : "Add stock";
  const primaryAction = paused ? onToggleActive : onAddStock;

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-slate-200 px-3 py-2 dark:border-slate-800">
        <span className="text-sm font-semibold text-slate-600 dark:text-slate-300">Details</span>
        {!mobileActions && (
          <button type="button" className="btn btn-ghost px-2 py-1" onClick={onClose} aria-label="Close details">×</button>
        )}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        <div className="mb-4 overflow-hidden rounded-lg bg-slate-100 dark:bg-slate-800">
          {item.image_url ? (
            <ArtworkThumb src={item.image_url} alt={item.name} className="aspect-[4/3] w-full" />
          ) : (
            <div className="flex aspect-[4/3] w-full items-center justify-center text-sm font-semibold text-slate-400">
              No image
            </div>
          )}
        </div>
        <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100">{item.name}</h2>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {paused && <span className="badge badge-slate">Paused</span>}
          {oos && <span className="badge badge-red">Out of stock</span>}
          {item.upc && <span className="badge badge-blue">UPC {item.upc}</span>}
          {item.kind === "sealed" ? (
            <>
              <span className="badge badge-slate">Sealed</span>
              {item.is_foil && <span className="badge badge-slate">Foil</span>}
            </>
          ) : (
            <>
              <span className="badge badge-slate">{kindLabel(item.kind)}</span>
              {item.is_foil && <span className="badge badge-slate">Foil</span>}
            </>
          )}
        </div>

        <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
          <div>
            <dt className="text-xs uppercase tracking-wide text-slate-500">Price each</dt>
            <dd className="font-semibold text-emerald-700 dark:text-emerald-400">
              {item.value_cents != null ? centsToUsd(item.value_cents) : <span className="font-normal text-slate-400">No price yet</span>}
            </dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wide text-slate-500">Quantity</dt>
            <dd className="font-semibold">{item.quantity}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wide text-slate-500">Total value</dt>
            <dd className="font-semibold">{tv != null ? centsToUsd(tv) : <span className="font-normal text-slate-400">—</span>}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wide text-slate-500">Storage location</dt>
            <dd className="font-semibold">{locationName}</dd>
          </div>
          {item.release_date && (
            <div>
              <dt className="text-xs uppercase tracking-wide text-slate-500">Release date</dt>
              <dd>{formatDate(item.release_date)}</dd>
            </div>
          )}
          {item.unit_cost_cents != null && (
            <div>
              <dt className="text-xs uppercase tracking-wide text-slate-500">Cost each</dt>
              <dd>{centsToUsd(item.unit_cost_cents)}</dd>
            </div>
          )}
        </dl>

        <div className="mt-4">
          <span className="text-xs uppercase tracking-wide text-slate-500">Price history</span>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
            {(() => {
              if (history.length === 0) return "No price history yet.";
              if (history.length === 1) return "1 price snapshot so far.";
              const first = history[0];
              const last = history[history.length - 1];
              const change = last.value_cents - first.value_cents;
              const since = formatDate(first.created_at);
              const count = `${history.length} snapshots`;
              if (change > 0) return `Up ${centsToUsd(change)} since ${since} · ${count}`;
              if (change < 0) return `Down ${centsToUsd(Math.abs(change))} since ${since} · ${count}`;
              return `No change since ${since} · ${count}`;
            })()}
          </p>
        </div>

        {/* "Refresh" and "Price history" controls next to item pricing/details */}
        <div className="mt-4 flex flex-wrap gap-2">
          <button type="button" className="btn btn-secondary" onClick={onRefresh}>↻ Refresh price</button>
          <button type="button" className="btn btn-secondary" onClick={onHistory}>Price history</button>
        </div>
      </div>

      <div className="border-t border-slate-200 p-3 dark:border-slate-800">
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" className="btn btn-primary flex-1" onClick={primaryAction}>{primaryLabel}</button>
          <button type="button" className="btn btn-secondary flex-1" onClick={onEdit}>Edit</button>
          <div className="relative">
            <button type="button" className="btn btn-secondary px-3" onClick={() => setMenuOpen(!menuOpen)} aria-label="More actions">⋯</button>
            {menuOpen && (
              <Menu onClose={() => setMenuOpen(false)} align="right" up>
                {!paused ? (
                  <button type="button" className="block w-full px-3 py-2 text-left text-sm hover:bg-slate-50 dark:hover:bg-slate-800" onClick={() => { setMenuOpen(false); onToggleActive(); }}>Pause</button>
                ) : (
                  <button type="button" className="block w-full px-3 py-2 text-left text-sm hover:bg-slate-50 dark:hover:bg-slate-800" onClick={() => { setMenuOpen(false); onToggleActive(); }}>Resume</button>
                )}
                <button type="button" className="block w-full px-3 py-2 text-left text-sm hover:bg-slate-50 dark:hover:bg-slate-800" onClick={() => { setMenuOpen(false); onRefresh(); }}>Refresh price</button>
                <button type="button" className="block w-full px-3 py-2 text-left text-sm text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/40" onClick={() => { setMenuOpen(false); onDelete(); }}>Delete</button>
              </Menu>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Simple anchored menu (popover)
// ---------------------------------------------------------------------------

function Menu({
  children,
  onClose,
  align = "left",
  up = false,
}: {
  children: React.ReactNode;
  onClose: () => void;
  align?: "left" | "right";
  up?: boolean;
}) {
  return (
    <>
      <div className="fixed inset-0 z-30" onClick={onClose} />
      <div
        className={`absolute z-40 min-w-[240px] rounded-xl border border-slate-200 bg-white py-1 shadow-lg dark:border-slate-700 dark:bg-slate-900 ${
          align === "right" ? "right-0" : "left-0"
        } ${up ? "bottom-full mb-1" : "top-full mt-1"}`}
      >
        {children}
      </div>
    </>
  );
}

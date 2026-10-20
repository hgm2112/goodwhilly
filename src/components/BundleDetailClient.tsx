"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { NumberDollars } from "@/components/ui/Modal";
import { ArtworkThumb } from "@/components/ArtworkThumb";
import { bundleCopyCap, bundlePriceCents, bundleToCsv, generateListingText } from "@/lib/bundle";
import { centsToUsd, downloadTextFile, formatDate, formatDateTime, kindLabel, pluralize, truncated } from "@/lib/utils";
import type { BundleStatus, BundleWithItems, Item, Location } from "@/lib/types";

const STATUS_STYLES: Record<BundleStatus, string> = {
  draft: "rounded-full bg-slate-100 dark:bg-slate-800 px-2.5 py-0.5 text-xs font-semibold text-slate-600 dark:text-slate-300",
  allocated: "rounded-full bg-amber-100 dark:bg-amber-950 px-2.5 py-0.5 text-xs font-semibold text-amber-700 dark:text-amber-300",
  listed: "rounded-full bg-emerald-100 dark:bg-emerald-950 px-2.5 py-0.5 text-xs font-semibold text-emerald-700 dark:text-emerald-300",
  sold: "rounded-full bg-red-100 dark:bg-red-950 px-2.5 py-0.5 text-xs font-semibold text-red-700 dark:text-red-300",
  cancelled: "rounded-full bg-slate-100 dark:bg-slate-800 px-2.5 py-0.5 text-xs font-semibold text-slate-600 dark:text-slate-300",
};

interface EbayListingLite {
  ebay_listing_id: string;
  title: string;
  price_cents: number | null;
  shipping_cents?: number | null;
  status: string;
  item_uri?: string | null;
  last_synced_at?: string | null;
}

// Generic listing words that don't distinguish one lot from another.
const SUGGEST_STOP = new Set([
  "the", "and", "a", "an", "of", "for", "with", "or", "to", "in", "on", "at", "by", "from",
  "lot", "sealed", "magic", "gathering", "misc", "mtg", "x", "4x", "new", "official",
]);

function titleTokens(s: string): string[] {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .split(" ")
    .filter((t) => t.length >= 2 && !SUGGEST_STOP.has(t));
}

/** Best ACTIVE listing for a draft title: ≥2 shared meaningful words and
 * ≥30% of the draft's words present. Returns null when nothing fits. */
function suggestListing(draftTitle: string, listings: EbayListingLite[]): string | null {
  const draftTokens = titleTokens(draftTitle);
  if (draftTokens.length < 2) return null;
  let best: { id: string; score: number } | null = null;
  for (const l of listings) {
    const listingTokens = new Set(titleTokens(l.title));
    const shared = draftTokens.filter((t) => listingTokens.has(t)).length;
    const score = shared / draftTokens.length;
    if (shared >= 2 && score >= 0.3 && (!best || score > best.score)) {
      best = { id: l.ebay_listing_id, score };
    }
  }
  return best?.id ?? null;
}

/** Contents editor target: add a line, or edit (substitute/re-quantity) one. */
type ContentsEditor =
  | { mode: "add"; itemId: string; qty: number }
  | { mode: "edit"; lineId: string; itemId: string; qty: number };

/** The sale row linked to this bundle (one at most; set when it was sold). */
export interface BundleSale {
  id: string;
  sold_at: string;
  gross_cents: number;
  fee_cents: number;
  shipping_cents: number;
  net_cents: number;
}

export function BundleDetailClient({
  initial,
  sale,
  linkedListingIds,
}: {
  initial: BundleWithItems;
  sale: BundleSale | null;
  /** eBay listing ids already linked to another live bundle — hidden here. */
  linkedListingIds: string[];
}) {
  const router = useRouter();
  const [bundle, setBundle] = useState(initial);
  const [draft, setDraft] = useState<{ title: string; description: string } | null>(null);
  const [editingDraft, setEditingDraft] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [locations, setLocations] = useState<Location[]>([]);
  const [listingPanel, setListingPanel] = useState<null | "list" | "edit">(null);
  const [listingPrice, setListingPrice] = useState<number | null>(null);
  const [listingShipping, setListingShipping] = useState<number | null>(null);
  const [soldPanel, setSoldPanel] = useState<null | "record">(null);
  const [soldGross, setSoldGross] = useState<number | null>(null);
  const [soldFee, setSoldFee] = useState<number | null>(null);
  const [soldShipping, setSoldShipping] = useState<number | null>(null);
  const [soldBuyer, setSoldBuyer] = useState("");
  const [soldOrder, setSoldOrder] = useState("");
  const [soldNote, setSoldNote] = useState("");
  const [soldDate, setSoldDate] = useState("");
  const [ebayListings, setEbayListings] = useState<EbayListingLite[]>([]);
  const [listingsBusy, setListingsBusy] = useState(false);
  const [markPrompt, setMarkPrompt] = useState(false);
  const [draftTitle, setDraftTitle] = useState<string | null>(null);
  const [pickId, setPickId] = useState("");
  const [inventory, setInventory] = useState<Item[] | null>(null);
  const [editor, setEditor] = useState<ContentsEditor | null>(null);
  const [invQuery, setInvQuery] = useState("");
  const [contentsDirty, setContentsDirty] = useState(false);

  useEffect(() => {
    fetch("/api/locations")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (Array.isArray(data?.locations)) setLocations(data.locations);
      })
      .catch(() => {});
    fetch("/api/listings")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (Array.isArray(data)) {
          setEbayListings(data.filter((l: EbayListingLite) => l.status === "ACTIVE"));
        }
      })
      .catch(() => {});
    fetch("/api/drafts")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (Array.isArray(data)) {
          const mine = data.find(
            (d: { bundle_id?: string | null; title?: string; description?: string | null }) =>
              d.bundle_id === initial.id && d.title,
          );
          if (mine) {
            // Load the saved draft (collapsed) so the button reads
            // "Edit listing draft" from the start — never regenerate here.
            setDraftTitle(mine.title);
            setDraft({ title: mine.title, description: mine.description ?? "" });
          }
        }
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function boxName(locationId: string | null): string {
    if (!locationId) return "Unassigned";
    return locations.find((l) => l.id === locationId)?.name ?? "Unassigned";
  }

  function flash(m: string) {
    setToast(m);
    setTimeout(() => setToast(null), 2500);
  }

  async function copyDraftText(text: string, label: "title" | "description") {
    try {
      await navigator.clipboard.writeText(text);
      flash(`Copied ${label}`);
    } catch {
      flash("Couldn't copy — select the text manually");
    }
  }

  async function api(path: string, init?: RequestInit) {
    const res = await fetch(path, init);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data?.error ?? "Request failed");
    return data;
  }

  async function setStatus(status: BundleStatus) {
    setBusy(true);
    setError(null);
    try {
      const updated = await api(`/api/bundles/${bundle.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      setBundle(updated);
      if (status === "cancelled") {
        const released = updated?._released ?? 0;
        flash(
          released > 0
            ? `Cancelled — released ${pluralize(released, "reserved line")}; stock restored`
            : "Cancelled — reserved stock was restored to inventory",
        );
        router.refresh();
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Update failed");
    } finally {
      setBusy(false);
    }
  }

  function openSoldPanel() {
    setSoldPanel("record");
    setSoldGross(bundle.listing_price_cents ?? bundlePriceCents(bundle.total_value_cents) ?? null);
    setSoldShipping(bundle.shipping_cents ?? null);
    setSoldFee(0);
    setSoldBuyer("");
    setSoldOrder("");
    setSoldNote("");
    setSoldDate(new Date().toISOString().slice(0, 16));
    setError(null);
  }

  async function submitSold() {
    if (!soldGross || soldGross <= 0) {
      setError("Gross must be > 0");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/sales", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          bundleId: bundle.id,
          grossCents: soldGross,
          feeCents: soldFee ?? 0,
          shippingCents: soldShipping ?? 0,
          buyer: soldBuyer.trim() || null,
          ebayOrderId: soldOrder.trim() || null,
          note: soldNote.trim() || null,
          soldAt: soldDate ? new Date(soldDate).toISOString() : undefined,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error ?? "Sale failed");
      }
      setSoldPanel(null);
      setBundle((b) => ({ ...b, status: "sold" }));
      flash("Sale recorded — bundle marked sold");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Sale failed");
    } finally {
      setBusy(false);
    }
  }

  function openListingPanel(mode: "list" | "edit") {
    setListingPanel(mode);
    setListingPrice(bundle.listing_price_cents ?? bundlePriceCents(bundle.total_value_cents));
    setListingShipping(bundle.shipping_cents ?? null);
    setError(null);
  }

  async function saveListing(markListed: boolean) {
    setBusy(true);
    setError(null);
    try {
      const updated = await api(`/api/bundles/${bundle.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status: markListed ? "listed" : bundle.status,
          listingPriceCents: listingPrice ?? null,
          shippingCents: listingShipping ?? null,
        }),
      });
      setBundle(updated);
      setListingPanel(null);
      if (markListed) setMarkPrompt(false);
      flash(markListed ? "Marked listed — Actual Listing Price saved" : "Listing price updated");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Update failed");
    } finally {
      setBusy(false);
    }
  }

  async function fillFromEbay(ebayListingId?: string) {
    setBusy(true);
    setError(null);
    try {
      const updated = await api(`/api/bundles/${bundle.id}/ebay-fill`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(ebayListingId ? { ebayListingId } : {}),
      });
      setBundle(updated);
      setListingPanel(null);
      setMarkPrompt(updated.status === "draft" || updated.status === "allocated");
      flash(
        updated?._synced
          ? "Filled Actual Listing Price & Shipping Fee from eBay"
          : "Filled from last sync — eBay was unreachable",
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't fill from eBay");
    } finally {
      setBusy(false);
    }
  }

  /** The listing is live and its numbers are saved — flip allocated → listed. */
  async function markListedNow() {
    setBusy(true);
    setError(null);
    try {
      const updated = await api(`/api/bundles/${bundle.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "listed" }),
      });
      setBundle(updated);
      setMarkPrompt(false);
      flash("Marked listed — stock stays reserved until it sells");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't mark listed");
    } finally {
      setBusy(false);
    }
  }

  /** Pull the seller's active listings now (the dropdown reads the cache). */
  async function refreshListings() {
    setListingsBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/ebay/sync-listings", { method: "POST" });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(
          data?.code === "EBAY_NOT_CONNECTED"
            ? "Connect your eBay account in Settings first."
            : data?.error ?? "Couldn't sync listings from eBay",
        );
      }
      const refreshed = await fetch("/api/listings")
        .then((r) => (r.ok ? r.json().catch(() => null) : null))
        .catch(() => null);
      if (Array.isArray(refreshed)) {
        const active = (refreshed as EbayListingLite[]).filter((l) => l.status === "ACTIVE");
        setEbayListings(active);
        // Drop a pick that ended (or vanished) since it was selected.
        setPickId((cur) =>
          cur && !active.some((l) => l.ebay_listing_id === cur) ? "" : cur,
        );
      }
      flash("Listings refreshed from eBay");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't sync listings from eBay");
    } finally {
      setListingsBusy(false);
    }
  }

  async function unlinkListing() {
    setBusy(true);
    setError(null);
    try {
      const updated = await api(`/api/bundles/${bundle.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: bundle.status, ebayListingId: null }),
      });
      setBundle(updated);
      setPickId("");
      setMarkPrompt(false);
      flash("Unlinked — saved prices kept");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't unlink");
    } finally {
      setBusy(false);
    }
  }

  async function loadDraft() {
    setBusy(true);
    setError(null);
    try {
      const existing = await api(`/api/bundles/${bundle.id}/draft`);
      if (existing && existing.title) {
        setDraft({ title: existing.title, description: existing.description });
        setEditingDraft(true);
      } else {
        const created = await api(`/api/bundles/${bundle.id}/draft`, { method: "POST" });
        setDraft({ title: created.title, description: created.description });
        setEditingDraft(true);
        router.refresh();
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't generate the draft");
    } finally {
      setBusy(false);
    }
  }

  async function saveDraft() {
    if (!draft) return;
    setBusy(true);
    setError(null);
    try {
      await api(`/api/bundles/${bundle.id}/draft`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: draft.title, description: draft.description }),
      });
      flash("Draft saved to the Drafts tab");
      setEditingDraft(false);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't save the draft");
    } finally {
      setBusy(false);
    }
  }

  function regenerateDraft() {
    if (!draft) return;
    if (
      !window.confirm(
        "Regenerate the draft text? This replaces the title and description above (nothing is saved until you click Save draft).",
      )
    )
      return;
    const fresh = generateListingText({
      name: bundle.name,
      lines: (bundle.items ?? []).map((bi) => ({
        item: bi.item,
        quantity: bi.quantity,
        valueCents: bi.value_cents,
      })),
    });
    setDraft(fresh);
    flash("Regenerated — review it, then Save draft");
  }

  async function remove() {
    if (!window.confirm("Delete this bundle and release its reserved stock?")) return;
    setBusy(true);
    setError(null);
    try {
      await api(`/api/bundles/${bundle.id}`, { method: "DELETE" });
      router.replace("/bundles");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't delete");
      setBusy(false);
    }
  }

  /** Units of `itemId` already in this bundle (optionally ignoring one line). */
  function unitsInBundle(itemId: string, exceptLineId?: string): number {
    return (bundle.items ?? []).reduce(
      (n, bi) => (bi.item_id === itemId && bi.id !== exceptLineId ? n + bi.quantity : n),
      0,
    );
  }

  /** Open the contents editor, loading inventory once on first use. */
  async function openContentsEditor(next: ContentsEditor) {
    setError(null);
    if (inventory) {
      setInvQuery("");
      setEditor(next);
      return;
    }
    setBusy(true);
    try {
      const data = await api("/api/inventory");
      if (!Array.isArray(data)) throw new Error("Couldn't load your inventory");
      setInventory(data as Item[]);
      setInvQuery("");
      setEditor(next);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't load your inventory");
    } finally {
      setBusy(false);
    }
  }

  /** Apply the editor: POST a new line, or PATCH substitution + quantity. */
  async function applyEditor() {
    if (!editor || !editor.itemId) return;
    const currentLine =
      editor.mode === "edit"
        ? (bundle.items ?? []).find((bi) => bi.id === editor.lineId)
        : undefined;
    const chosen = (inventory ?? []).find((it) => it.id === editor.itemId);
    setBusy(true);
    setError(null);
    try {
      const isAdd = editor.mode === "add";
      const updated = await api(
        isAdd
          ? `/api/bundles/${bundle.id}/items`
          : `/api/bundles/${bundle.id}/items/${editor.lineId}`,
        {
          method: isAdd ? "POST" : "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(
            isAdd
              ? { itemId: editor.itemId, quantity: editor.qty }
              : { newItemId: editor.itemId, quantity: editor.qty },
          ),
        },
      );
      setBundle(updated);
      setEditor(null);
      setInvQuery("");
      if (draft) setContentsDirty(true);
      const name = truncated(chosen?.name ?? "item", 40);
      flash(
        isAdd
          ? `Added ${name} ×${editor.qty}`
          : currentLine && editor.itemId !== currentLine.item_id
            ? `Substituted ${name} ×${editor.qty}`
            : `Quantity updated to ×${editor.qty}`,
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't update the bundle");
    } finally {
      setBusy(false);
    }
  }

  /** Drop a line — its reserved units return to inventory. */
  async function removeContentsLine(bi: BundleWithItems["items"][number]) {
    if (
      !window.confirm(
        `Remove ${bi.item.name} from this bundle? ${pluralize(bi.quantity, "unit")} will return to inventory.`,
      )
    )
      return;
    setBusy(true);
    setError(null);
    try {
      const updated = await api(`/api/bundles/${bundle.id}/items/${bi.id}`, { method: "DELETE" });
      setBundle(updated);
      if (draft) setContentsDirty(true);
      if (editor && editor.mode === "edit" && editor.lineId === bi.id) setEditor(null);
      flash(
        `Removed ${truncated(bi.item.name, 40)} — ${pluralize(bi.quantity, "unit")} back in stock`,
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't remove the line");
    } finally {
      setBusy(false);
    }
  }

  const lines = bundle.items ?? [];
  const count = lines.reduce((n, bi) => n + bi.quantity, 0);
  const hasDraft = draft !== null;
  // Contents may be edited until the bundle is listed.
  const editable = bundle.status === "draft" || bundle.status === "allocated";
  const editLine =
    editor && editor.mode === "edit" ? lines.find((bi) => bi.id === editor.lineId) ?? null : null;
  const picked =
    editor && editor.itemId ? (inventory ?? []).find((it) => it.id === editor.itemId) ?? null : null;
  const editorUnchanged = Boolean(
    editor &&
      editor.mode === "edit" &&
      editLine &&
      editor.itemId === editLine.item_id &&
      editor.qty === editLine.quantity,
  );
  // Max quantity for the picked item: its unreserved stock (plus this line's
  // units when it IS this line) and the per-bundle copy cap.
  let editorMaxQty = 99;
  if (editor && picked) {
    const sameLine = Boolean(editLine && editLine.item_id === picked.id);
    const otherUnits = unitsInBundle(picked.id, sameLine && editLine ? editLine.id : undefined);
    const avail = picked.quantity + (sameLine && editLine ? editLine.quantity : 0);
    editorMaxQty = Math.max(
      1,
      Math.min(99, avail, bundleCopyCap(picked.value_cents) - otherUnits),
    );
  }
  const search = invQuery.trim().toLowerCase();
  const candidates = (inventory ?? [])
    .filter((it) => it.active && it.quantity > 0 && (it.value_cents ?? 0) > 0)
    .filter(
      (it) =>
        !search ||
        it.name.toLowerCase().includes(search) ||
        (it.upc ?? "").includes(search) ||
        (it.set_code ?? "").toLowerCase().includes(search),
    )
    .sort((a, b) => a.name.localeCompare(b.name))
    .slice(0, 80);
  // Other bundles' listings aren't link candidates (one listing = one bundle).
  const linkedElsewhere = new Set(linkedListingIds);
  const availableListings = ebayListings.filter(
    (l) => l.ebay_listing_id === bundle.ebay_listing_id || !linkedElsewhere.has(l.ebay_listing_id),
  );
  const hiddenListingCount = ebayListings.length - availableListings.length;
  const listingsSyncedAt = ebayListings.reduce<string | null>((max, l) => {
    const t = l.last_synced_at ?? null;
    return t && (!max || t > max) ? t : max;
  }, null);
  const suggestedId = draftTitle ? suggestListing(draftTitle, availableListings) : null;
  const selectedId = pickId || bundle.ebay_listing_id || suggestedId || "";
  const isLinked = Boolean(bundle.ebay_listing_id);
  const linkedRow = isLinked
    ? ebayListings.find((l) => l.ebay_listing_id === bundle.ebay_listing_id) ?? null
    : null;
  const showPriceLine =
    bundle.listing_price_cents != null ||
    bundle.shipping_cents != null ||
    bundle.status === "listed" ||
    bundle.status === "sold";

  return (
    <div className="space-y-4">
      {/* Header actions */}
      <div className="flex flex-wrap items-center gap-2">
        <span className={STATUS_STYLES[bundle.status]}>{bundle.status}</span>
        <span className="text-xs text-slate-400">
          created {formatDateTime(bundle.created_at)}
        </span>
        <span className="ml-auto flex items-center gap-2">
          {bundle.status !== "sold" && bundle.status !== "cancelled" && (
            <>
              <button className="btn btn-primary" onClick={loadDraft} disabled={busy}>
                {hasDraft ? "Edit listing draft" : "Generate listing draft"}
              </button>
              {bundle.status === "allocated" && (
                <button className="btn btn-secondary" onClick={() => openListingPanel("list")} disabled={busy}>
                  Mark listed
                </button>
              )}
              <button className="btn btn-secondary" onClick={openSoldPanel} disabled={busy}>
                Mark sold
              </button>
              <button className="btn btn-ghost text-red-600 dark:text-red-400" onClick={() => setStatus("cancelled")} disabled={busy}>
                Cancel & release
              </button>
              <button
                className="btn btn-secondary"
                disabled={busy}
                onClick={() =>
                  downloadTextFile(
                    "bundle.csv",
                    bundleToCsv(
                      lines.map((bi) => ({
                        item: bi.item,
                        quantity: bi.quantity,
                        valueCents: bi.value_cents,
                      })),
                      bundle.total_value_cents,
                    ),
                    "text/csv",
                  )
                }
              >
                CSV
              </button>
            </>
          )}
          {bundle.status !== "sold" && (
            <button className="btn btn-ghost text-slate-400" onClick={remove} disabled={busy}>
              Delete
            </button>
          )}
        </span>
      </div>

      {error && <p className="rounded-lg bg-red-50 dark:bg-red-950 px-3 py-2 text-sm text-red-700 dark:text-red-300">{error}</p>}

      {/* Sale ledger — a sold bundle must have a sale row (see /sales). */}
      {bundle.status === "sold" &&
        (sale ? (
          <p className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200">
            <span className="font-semibold">Sold {formatDate(sale.sold_at)}</span>
            <span>
              · {centsToUsd(sale.gross_cents)} gross · {centsToUsd(sale.net_cents)} net
            </span>
            <Link href="/sales" className="font-medium underline">
              View in Sales
            </Link>
          </p>
        ) : (
          <div className="flex flex-wrap items-center gap-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:bg-amber-950 dark:text-amber-200">
            <span className="min-w-0 italic">
              This bundle is sold but has no sale recorded — sales totals are missing it.
            </span>
            <button className="btn btn-accent ml-auto" onClick={openSoldPanel} disabled={busy}>
              Record sale
            </button>
          </div>
        ))}

      {/* Actual Listing Price / Shipping Fee */}
      {listingPanel && (
        <div className="card space-y-3">
          <p className="text-sm font-bold">
            {listingPanel === "list" ? "Mark listed" : "Edit listing price"}
          </p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Actual Listing Price</label>
              <NumberDollars valueCents={listingPrice} onChange={setListingPrice} />
            </div>
            <div>
              <label className="label">Shipping Fee</label>
              <NumberDollars valueCents={listingShipping} onChange={setListingShipping} />
            </div>
          </div>
          <p className="hint">
            {listingPanel === "list"
              ? "The price you actually listed it for on eBay (prefilled with the suggested bundle price) and what you charge for shipping."
              : "Saved values are used to prefill Gross / Shipping when you record this bundle as sold."}
          </p>
          <div className="flex justify-end gap-2 border-t border-slate-100 dark:border-slate-800 pt-3">
            <button className="btn btn-ghost" onClick={() => setListingPanel(null)} disabled={busy}>
              Cancel
            </button>
            <button className="btn btn-primary" onClick={() => saveListing(listingPanel === "list")} disabled={busy}>
              {busy ? "Saving…" : listingPanel === "list" ? "Mark listed" : "Save"}
            </button>
          </div>
        </div>
      )}

      {soldPanel && (
        <div className="card space-y-3">
          <p className="text-sm font-bold">Record sale — bundle sold</p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Gross (charged)</label>
              <NumberDollars valueCents={soldGross} onChange={setSoldGross} />
            </div>
            <div>
              <label className="label">Shipping charged</label>
              <NumberDollars valueCents={soldShipping} onChange={setSoldShipping} />
            </div>
            <div>
              <label className="label">eBay fee</label>
              <NumberDollars valueCents={soldFee} onChange={setSoldFee} />
            </div>
            <div>
              <label className="label">Sale date</label>
              <input
                className="input"
                type="datetime-local"
                value={soldDate}
                onChange={(e) => setSoldDate(e.target.value)}
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Buyer</label>
              <input
                className="input"
                placeholder="username or blank"
                value={soldBuyer}
                onChange={(e) => setSoldBuyer(e.target.value)}
              />
            </div>
            <div>
              <label className="label">eBay order ID</label>
              <input
                className="input"
                placeholder="optional"
                value={soldOrder}
                onChange={(e) => setSoldOrder(e.target.value)}
              />
            </div>
          </div>
          <div>
            <label className="label">Note</label>
            <input
              className="input"
              placeholder="optional context"
              value={soldNote}
              onChange={(e) => setSoldNote(e.target.value)}
            />
          </div>
          <p className="hint">Gross prefills from Actual Listing Price; shipping from Shipping Fee.</p>
          <div className="flex justify-end gap-2 border-t border-slate-100 dark:border-slate-800 pt-3">
            <button className="btn btn-ghost" onClick={() => setSoldPanel(null)} disabled={busy}>
              Cancel
            </button>
            <button className="btn btn-primary" onClick={submitSold} disabled={busy}>
              {busy ? "Recording…" : "Record sale & mark sold"}
            </button>
          </div>
        </div>
      )}

      {showPriceLine && !listingPanel && (
        <p className="flex flex-wrap items-center gap-x-2 text-sm">
          <span className="font-semibold text-blue-700 dark:text-blue-300">
            Actual Listing Price{" "}
            {bundle.listing_price_cents != null ? centsToUsd(bundle.listing_price_cents) : "—"}
          </span>
          <span className="text-slate-400">
            · Shipping Fee {bundle.shipping_cents != null ? centsToUsd(bundle.shipping_cents) : "—"}
          </span>
          <button
            className="text-xs font-medium text-blue-600 dark:text-blue-400 hover:underline"
            onClick={() => openListingPanel("edit")}
            disabled={busy}
          >
            Edit
          </button>
        </p>
      )}

      {/* eBay listing link + auto-fill from synced listings */}
      <div className="card space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm font-bold">eBay listing</p>
          <button
            className="btn btn-secondary px-2.5 py-1 text-xs"
            onClick={refreshListings}
            disabled={listingsBusy}
            title="Pull your current active eBay listings into the app"
          >
            {listingsBusy ? "Refreshing…" : "Refresh from eBay"}
          </button>
        </div>
        {availableListings.length === 0 ? (
          <p className="hint">
            {ebayListings.length === 0
              ? "No active eBay listings synced yet — press “Refresh from eBay” above (new listings only appear after a sync)."
              : "Every active eBay listing is already linked to another bundle. Unlink it there first (cancelled bundles don’t count)."}
          </p>
        ) : (
          <>
            <select
              className="input"
              value={selectedId}
              onChange={(e) => setPickId(e.target.value)}
              disabled={busy || listingsBusy}
            >
              <option value="">— no listing linked —</option>
              {availableListings.map((l) => (
                <option key={l.ebay_listing_id} value={l.ebay_listing_id}>
                  {truncated(l.title, 60)} ·{" "}
                  {l.price_cents != null ? centsToUsd(l.price_cents) : "?"}
                  {!isLinked && l.ebay_listing_id === suggestedId ? " (suggested)" : ""}
                </option>
              ))}
            </select>
            <p className="hint">
              Listings synced {listingsSyncedAt ? formatDateTime(listingsSyncedAt) : "—"} · new eBay
              listings only appear after a refresh.
            </p>
            {!isLinked && suggestedId && selectedId === suggestedId && (
              <p className="text-xs italic text-blue-600 dark:text-blue-400">
                Preselected from this bundle&apos;s listing draft title — confirm to link it.
              </p>
            )}
            {linkedRow && (
              <p className="text-xs text-slate-400">
                Linked {linkedRow.price_cents != null ? centsToUsd(linkedRow.price_cents) : "—"}
                {linkedRow.shipping_cents != null
                  ? ` + ${centsToUsd(linkedRow.shipping_cents)} shipping`
                  : ""}
                {" · synced "}
                {linkedRow.last_synced_at ? formatDateTime(linkedRow.last_synced_at) : "—"}
                {linkedRow.item_uri && (
                  <>
                    {" · "}
                    <a
                      href={linkedRow.item_uri}
                      target="_blank"
                      rel="noreferrer"
                      className="text-blue-600 dark:text-blue-400 hover:underline"
                    >
                      open on eBay
                    </a>
                  </>
                )}
              </p>
            )}
            <div className="flex flex-wrap gap-2 border-t border-slate-100 dark:border-slate-800 pt-2">
              <button
                className="btn btn-primary"
                disabled={busy || listingsBusy || !selectedId}
                onClick={() => fillFromEbay(selectedId)}
              >
                {isLinked && selectedId === bundle.ebay_listing_id
                  ? "Re-fill price & shipping"
                  : "Link & fill price & shipping"}
              </button>
              {isLinked && (
                <button className="btn btn-ghost text-slate-500 dark:text-slate-400" onClick={unlinkListing} disabled={busy}>
                  Unlink
                </button>
              )}
            </div>
            <p className="hint">
              Fills Actual Listing Price + Shipping Fee from that listing — it syncs eBay first so the
              numbers are current. Manual edits afterwards still win until the next refresh.
            </p>
            {hiddenListingCount > 0 && (
              <p className="hint">
                {hiddenListingCount} active listing{hiddenListingCount === 1 ? " is" : "s are"} already
                linked to another bundle and {hiddenListingCount === 1 ? "is" : "are"} hidden.
              </p>
            )}
          </>
        )}
        {markPrompt && (
          <div className="flex flex-wrap items-center gap-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:bg-amber-950 dark:text-amber-200">
            <span className="min-w-0 italic">
              Filled from eBay — mark this bundle as listed?
            </span>
            <span className="ml-auto flex gap-2">
              <button
                className="btn btn-primary px-2.5 py-1 text-xs"
                onClick={markListedNow}
                disabled={busy}
              >
                {busy ? "Saving…" : "Mark listed"}
              </button>
              <button
                className="btn btn-ghost px-2.5 py-1 text-xs"
                onClick={() => setMarkPrompt(false)}
                disabled={busy}
              >
                Not now
              </button>
            </span>
          </div>
        )}
      </div>

      {/* Draft editor */}
      {draft && (
        <div className="card space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-bold">eBay listing draft</p>
            <button className="btn btn-ghost text-xs" onClick={() => setEditingDraft(!editingDraft)}>
              {editingDraft ? "Collapse" : "Expand"}
            </button>
          </div>
          {contentsDirty && (
            <p className="text-xs italic text-amber-600 dark:text-amber-400">
              Contents changed since this draft — hit Regenerate if it looks stale.
            </p>
          )}
          {editingDraft && (
            <>
              <div>
                <div className="flex items-start justify-between">
                  <label className="label">Title</label>
                  <button
                    type="button"
                    className="-mt-1 flex h-7 w-7 items-center justify-center rounded-md text-slate-400 transition hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-700 dark:hover:text-slate-300"
                    title="Copy title"
                    aria-label="Copy title"
                    onClick={() => copyDraftText(draft.title, "title")}
                  >
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      width="15"
                      height="15"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <rect x="9" y="9" width="13" height="13" rx="2" />
                      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                    </svg>
                  </button>
                </div>
                <input
                  className="input"
                  value={draft.title}
                  onChange={(e) => setDraft({ ...draft, title: e.target.value })}
                  maxLength={80}
                />
              </div>
              <div>
                <div className="flex items-start justify-between">
                  <label className="label">Description</label>
                  <button
                    type="button"
                    className="-mt-1 flex h-7 w-7 items-center justify-center rounded-md text-slate-400 transition hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-700 dark:hover:text-slate-300"
                    title="Copy description"
                    aria-label="Copy description"
                    onClick={() => copyDraftText(draft.description, "description")}
                  >
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      width="15"
                      height="15"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <rect x="9" y="9" width="13" height="13" rx="2" />
                      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                    </svg>
                  </button>
                </div>
                <textarea
                  className="input min-h-48 resize-y"
                  value={draft.description}
                  onChange={(e) => setDraft({ ...draft, description: e.target.value })}
                />
              </div>
              <div className="flex justify-end gap-2">
                <button className="btn btn-ghost mr-auto" onClick={regenerateDraft} disabled={busy}>
                  Regenerate
                </button>
                <button className="btn btn-ghost" onClick={() => setEditingDraft(false)}>
                  Close
                </button>
                <button className="btn btn-primary" onClick={saveDraft} disabled={busy}>
                  Save draft
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {/* Contents editor — substitute a line's item, change quantity, add */}
      {editor && (
        <div className="card space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-bold">
              {editor.mode === "add" ? "Add item to bundle" : "Substitute or change quantity"}
            </p>
            <button className="btn btn-ghost text-xs" onClick={() => setEditor(null)} disabled={busy}>
              Close
            </button>
          </div>
          <input
            className="input"
            placeholder="Search inventory by name, UPC or set…"
            value={invQuery}
            onChange={(e) => setInvQuery(e.target.value)}
            disabled={busy}
            autoFocus
          />
          <ul className="max-h-64 divide-y divide-slate-100 dark:divide-slate-800 overflow-y-auto rounded-lg border border-slate-200 dark:border-slate-800">
            {candidates.map((it) => {
              const sameLine = Boolean(editLine && editLine.item_id === it.id);
              const inBundle = unitsInBundle(it.id, sameLine && editLine ? editLine.id : undefined);
              const capRoom = bundleCopyCap(it.value_cents) - inBundle;
              const selected = editor.itemId === it.id;
              const blocked = capRoom <= 0;
              return (
                <li key={it.id}>
                  <button
                    type="button"
                    className={`flex w-full items-center gap-3 px-3 py-2 text-left disabled:opacity-50 ${
                      selected ? "bg-blue-50 dark:bg-blue-950" : "hover:bg-slate-50 dark:hover:bg-slate-800"
                    }`}
                    disabled={busy || blocked}
                    title={blocked ? "This bundle is already at its copy limit for this item" : undefined}
                    onClick={() => {
                      const avail = it.quantity + (sameLine && editLine ? editLine.quantity : 0);
                      const capMax = Math.min(99, avail, capRoom);
                      setEditor({
                        ...editor,
                        itemId: it.id,
                        qty: Math.max(1, Math.min(editor.qty, capMax)),
                      });
                    }}
                  >
                    {it.image_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={it.image_url}
                        alt=""
                        className="h-10 w-8 shrink-0 rounded-sm border border-slate-200 dark:border-slate-800 object-cover"
                      />
                    ) : (
                      <span className="flex h-10 w-8 shrink-0 items-center justify-center rounded-sm border border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-800 text-xs text-slate-400">
                        ?
                      </span>
                    )}
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">
                        {truncated(it.name, 50)}
                      </span>
                      <span className="block text-xs text-slate-400">
                        {kindLabel(it.kind)} · {boxName(it.location_id)} · stock {it.quantity} ·{" "}
                        {centsToUsd(it.value_cents)}
                        {inBundle > 0 ? ` · ×${inBundle} in bundle` : ""}
                        {blocked ? " · maxed out" : ""}
                      </span>
                    </span>
                    {selected && (
                      <span className="shrink-0 text-xs font-semibold text-blue-600 dark:text-blue-400">selected</span>
                    )}
                  </button>
                </li>
              );
            })}
            {candidates.length === 0 && (
              <li className="px-3 py-3 hint">
                No matching in-stock, priced items.
              </li>
            )}
          </ul>

          <div className="flex flex-wrap items-end gap-4">
            <div className="max-w-44">
              <span className="label">Quantity</span>
              <div className="flex items-center gap-1">
                <button
                  className="btn btn-secondary px-3 py-2"
                  onClick={() => setEditor({ ...editor, qty: Math.max(1, editor.qty - 1) })}
                  disabled={busy || editor.qty <= 1}
                  aria-label="Decrease quantity"
                >
                  −
                </button>
                <span className="min-w-10 flex-1 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 py-2 text-center text-sm font-semibold">
                  {editor.qty}
                </span>
                <button
                  className="btn btn-secondary px-3 py-2"
                  onClick={() => setEditor({ ...editor, qty: Math.min(editorMaxQty, editor.qty + 1) })}
                  disabled={busy || editor.qty >= editorMaxQty}
                  aria-label="Increase quantity"
                >
                  +
                </button>
              </div>
            </div>
            <p className="pb-2 hint">
              {picked ? `max ${editorMaxQty}` : "Pick an item above"}
            </p>
            {picked && (
              <p className="ml-auto pb-2 text-sm">
                <span className="font-semibold text-emerald-700 dark:text-emerald-300">
                  {centsToUsd((picked.value_cents ?? 0) * editor.qty)}
                </span>
                <span className="ml-1 text-xs text-slate-400">
                  ({editor.qty} × {centsToUsd(picked.value_cents)}
                  {editLine && editor.itemId !== editLine.item_id
                    ? ` · was ${centsToUsd(editLine.value_cents * editLine.quantity)}`
                    : ""}
                  )
                </span>
              </p>
            )}
          </div>

          {editor.mode === "edit" && editLine && editor.itemId === editLine.item_id && (
            <p className="hint">
              Same item selected — this changes the quantity. Pick another item to substitute.
            </p>
          )}
          {editor.mode === "edit" && editLine && editor.itemId !== editLine.item_id && (
            <p className="hint">
              Swaps out “{truncated(editLine.item.name, 40)}” — its{" "}
              {pluralize(editLine.quantity, "unit")} returns to inventory.
            </p>
          )}

          <div className="flex justify-end gap-2 border-t border-slate-100 dark:border-slate-800 pt-3">
            <button className="btn btn-ghost" onClick={() => setEditor(null)} disabled={busy}>
              Cancel
            </button>
            <button
              className="btn btn-primary"
              onClick={applyEditor}
              disabled={busy || !editor.itemId || editorUnchanged}
            >
              {busy
                ? "Saving…"
                : editor.mode === "add"
                  ? "Add to bundle"
                  : editorUnchanged
                    ? "No changes"
                    : editLine && editor.itemId !== editLine.item_id
                      ? "Substitute"
                      : "Update quantity"}
            </button>
          </div>
        </div>
      )}

      {/* Items */}
      <div className="card p-0">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 dark:border-slate-800 px-4 py-2.5">
          <p className="text-sm font-bold">Contents ({count} items)</p>
          <div className="flex items-center gap-3">
            {editable && (
              <button
                className="btn btn-secondary px-3 py-1.5 text-xs"
                onClick={() => openContentsEditor({ mode: "add", itemId: "", qty: 1 })}
                disabled={busy || editor !== null}
              >
                + Add item
              </button>
            )}
            <p className="text-sm">
              <span className="font-bold text-emerald-700 dark:text-emerald-300">
                {centsToUsd(bundlePriceCents(bundle.total_value_cents))}
              </span>{" "}
              <span className="text-xs text-slate-400">
                price · {centsToUsd(bundle.total_value_cents)} value · fill{" "}
                {centsToUsd(bundle.target_value_cents)}
              </span>
            </p>
          </div>
        </div>
        <ul className="divide-y divide-slate-100 dark:divide-slate-800">
          {lines.map((bi) => (
            <li key={bi.id} className="flex items-center gap-3 px-4 py-2.5">
              {bi.item.image_url ? (
                <ArtworkThumb
                  src={bi.item.image_url}
                  alt={bi.item.name}
                  className="h-12 w-9 shrink-0 rounded-sm border border-slate-200 dark:border-slate-800"
                />
              ) : (
                <span className="flex h-12 w-9 shrink-0 items-center justify-center rounded-sm border border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-800 text-xs text-slate-400">
                  ?
                </span>
              )}
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium">{truncated(bi.item.name, 55)}</span>
                <span className="block text-xs text-slate-400">
                  {kindLabel(bi.item.kind)}
                  {` · ${boxName(bi.item.location_id)}`}
                  {bi.item.set_code ? ` · ${bi.item.set_code}` : ""}
                  {bi.quantity > 1 ? ` · ×${bi.quantity}` : ""}
                </span>
              </span>
              <span className="text-sm">
                <span className="font-semibold text-emerald-700 dark:text-emerald-300">
                  {centsToUsd(bi.value_cents * bi.quantity)}
                </span>
                {bi.unit_cost_cents != null && (
                  <span className="ml-2 hidden text-xs text-slate-400 sm:inline">
                    cost {centsToUsd(bi.unit_cost_cents * bi.quantity)} · margin{" "}
                    {centsToUsd((bi.value_cents - bi.unit_cost_cents) * bi.quantity)}
                  </span>
                )}
              </span>
              {editable && (
                <span className="flex shrink-0 items-center gap-1">
                  <button
                    className="btn btn-ghost px-2 py-1.5 text-xs"
                    disabled={busy}
                    onClick={() =>
                      openContentsEditor({
                        mode: "edit",
                        lineId: bi.id,
                        itemId: bi.item_id,
                        qty: bi.quantity,
                      })
                    }
                  >
                    Edit
                  </button>
                  <button
                    className="btn btn-ghost px-2 py-1.5 text-xs text-red-600 dark:text-red-400"
                    disabled={busy}
                    onClick={() => removeContentsLine(bi)}
                  >
                    Remove
                  </button>
                </span>
              )}
            </li>
          ))}
        </ul>
      </div>

      {toast && (
        <div className="fixed inset-x-4 bottom-16 z-50 rounded-lg bg-slate-900 px-4 py-2.5 text-center text-sm font-medium text-white shadow-xl sm:bottom-6">
          {toast}
        </div>
      )}
    </div>
  );
}
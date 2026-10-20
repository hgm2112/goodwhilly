"use client";

import { useMemo, useState, useEffect, useRef } from "react";
import { useSearchParams } from "next/navigation";
import { centsToUsd, formatDateTime, truncated } from "@/lib/utils";
import type { Listing } from "@/lib/types";

export function ListingsClient({
  initial,
  ebayConnected,
  ebayStatus,
}: {
  initial: Listing[];
  ebayConnected: boolean;
  ebayStatus?: { connected: boolean; viewsEnabled: boolean };
}) {
  const [listings, setListings] = useState(initial);
  const [syncState, setSyncState] = useState<"idle" | "working" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const [viewsWarning, setViewsWarning] = useState<string | null>(null);
  const [showReauth, setShowReauth] = useState(false);
  const searchParams = useSearchParams();
  const [sortKey, setSortKey] = useState<"default" | "views" | "watchers">("default");
  const [sortDir, setSortDir] = useState<"desc" | "asc">("desc");

  // Proactive "Views need reconnect" banner when connected but analytics scope missing.
  useEffect(() => {
    if (ebayConnected && ebayStatus && !ebayStatus.viewsEnabled) {
      setShowReauth(true);
    } else {
      setShowReauth(false);
    }
  }, [ebayConnected, ebayStatus]);

  const didAutoSync = useRef(false);
  useEffect(() => {
    if (searchParams?.get("ebay_connected") === "1" && !didAutoSync.current && syncState === "idle") {
      didAutoSync.current = true;
      sync();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  async function sync() {
    setSyncState("working");
    setError(null);
    try {
      const res = await fetch("/api/ebay/sync-listings", { method: "POST" });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setError(data?.error ?? "Sync failed");
        setSyncState("error");
        if (data?.code === "EBAY_NOT_CONNECTED") setListings([]);
        return;
      }
      const refreshed = await fetch("/api/listings").then((r) =>
        r.ok ? r.json().catch(() => null) : null,
      );
      if (Array.isArray(refreshed)) setListings(refreshed);

      // Surface views availability (the sync route returns stats.views on
      // both success and best-effort failure).
      const v = (data as { views?: { ok?: boolean; code?: string; error?: string } })?.views;
      if (v && !v.ok) {
        if (v.code === "INSUFFICIENT_SCOPE") {
          setViewsWarning("Views unavailable — reconnect eBay in Settings to enable view tracking.");
        } else {
          setViewsWarning(v.error || "Views refresh failed.");
        }
      } else {
        setViewsWarning(null);
      }

      setSyncState("idle");
    } catch {
      setError("Sync failed");
      setSyncState("error");
    }
  }

  const displayed = useMemo(() => {
    if (sortKey === "default") return listings;
    const mult = sortDir === "desc" ? -1 : 1;
    return [...listings].sort((a, b) => {
      const va = sortKey === "views" ? a.views_count : a.watchers_count;
      const vb = sortKey === "views" ? b.views_count : b.watchers_count;
      if (va == null && vb == null) return 0;
      if (va == null) return 1;
      if (vb == null) return -1;
      if (va === vb) return 0;
      return (va - vb) * mult;
    });
  }, [listings, sortKey, sortDir]);

  // Compute last-updated timestamps for the toolbar hint (max over rows).
  const { watchersUpdated, viewsUpdated } = useMemo(() => {
    let wu: string | null = null;
    let vu: string | null = null;
    for (const l of listings) {
      if (l.watchers_refreshed_at && (!wu || l.watchers_refreshed_at > wu)) wu = l.watchers_refreshed_at;
      if (l.views_refreshed_at && (!vu || l.views_refreshed_at > vu)) vu = l.views_refreshed_at;
    }
    return { watchersUpdated: wu, viewsUpdated: vu };
  }, [listings]);

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <button className="btn btn-primary" onClick={sync} disabled={syncState === "working"}>
          {syncState === "working" ? "Syncing…" : "Sync now from eBay"}
        </button>
        <span className="text-xs text-slate-400">
          {listings.length} active listing{listings.length === 1 ? "" : "s"}
        </span>

        {/* Sort control (cards kept; toolbar dropdown like Inventory) */}
        <div className="ml-auto flex items-center gap-1 text-xs">
          <label className="sr-only" htmlFor="listings-sort">Sort</label>
          <select
            id="listings-sort"
            className="input h-8 py-0 text-xs"
            value={sortKey}
            onChange={(e) => {
              const k = e.target.value as "default" | "views" | "watchers";
              if (k !== sortKey) {
                setSortKey(k);
                // sensible default direction for attention metrics
                setSortDir(k === "default" ? "desc" : "desc");
              }
            }}
          >
            <option value="default">Last synced</option>
            <option value="views">Views (90d)</option>
            <option value="watchers">Watchers</option>
          </select>
          <button
            type="button"
            className="btn btn-secondary h-8 px-2 text-xs"
            onClick={() => setSortDir((d) => (d === "desc" ? "asc" : "desc"))}
            title="Toggle sort direction"
            aria-label="Toggle sort direction"
          >
            {sortDir === "desc" ? "↓" : "↑"}
          </button>
        </div>
      </div>

      {showReauth && (
        <div className="mb-3 rounded-lg bg-amber-50 dark:bg-amber-950 px-3 py-2.5 text-sm text-amber-700 dark:text-amber-300">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <span>
              <span className="font-semibold">Views unavailable.</span> Re-authorize eBay once to enable 90-day view tracking.
            </span>
            <a
              href="/api/ebay/connect?returnTo=/listings"
              className="btn btn-secondary shrink-0 px-2.5 py-1 text-xs"
            >
              Enable Views
            </a>
          </div>
        </div>
      )}

      {(watchersUpdated || viewsUpdated) && (
        <p className="mb-2 text-[11px] text-slate-400">
          {watchersUpdated && `Watchers updated ${formatDateTime(watchersUpdated)}`}
          {watchersUpdated && viewsUpdated && " · "}
          {viewsUpdated && `Views updated ${formatDateTime(viewsUpdated)}`}
        </p>
      )}

      {error && <p className="mb-3 rounded-lg bg-red-50 dark:bg-red-950 px-3 py-2 text-sm text-red-700 dark:text-red-300">{error}</p>}
      {viewsWarning && (
        <p className="mb-3 rounded-lg bg-amber-50 dark:bg-amber-950 px-3 py-2 text-sm text-amber-700 dark:text-amber-300">
          {viewsWarning}
        </p>
      )}

      {!ebayConnected && (
        <div className="card text-sm italic text-slate-500 dark:text-slate-400">
          You haven&apos;t connected your eBay account yet. Go to{" "}
          <a href="/settings" className="text-blue-600 dark:text-blue-400 underline">
            Settings
          </a>{" "}
          to link it, then your active listings will appear here (manual sync or the automated daily
          cron).
        </div>
      )}

      {ebayConnected && listings.length === 0 && (
        <div className="card text-sm italic text-slate-500 dark:text-slate-400">
          No active eBay listings found yet. If you know you have some, double-check the sync above.
        </div>
      )}

      {displayed.length > 0 && (
        <ul className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          {displayed.map((l) => (
            <li key={l.id}>
              <a
                href={l.item_uri || `https://www.ebay.com/itm/${l.ebay_listing_id}`}
                target="_blank"
                rel="noopener noreferrer"
                className="card flex items-start gap-3 p-3 transition hover:border-slate-300 dark:hover:border-slate-700 hover:shadow-md"
              >
                {l.image_urls?.[0] && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={l.image_urls[0]}
                    alt=""
                    className="h-14 w-14 shrink-0 rounded-md border border-slate-200 dark:border-slate-800 object-cover"
                  />
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-slate-800 dark:text-slate-200" title={l.title}>
                    {truncated(l.title, 60)}
                  </p>
                  <p className="mt-0.5 text-sm text-emerald-700 dark:text-emerald-300">
                    {l.price_cents != null ? centsToUsd(l.price_cents) : "—"}
                    <span className="ml-1 text-xs font-normal text-slate-400">{l.currency}</span>
                  </p>
                   <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-slate-400">
                     <span className="badge badge-slate">{l.status}</span>
                     {l.quantity_available != null && <span>{l.quantity_available} avail</span>}
                     {l.quantity_sold != null && (
                       <span className="text-emerald-600">{l.quantity_sold} sold</span>
                     )}
                   </div>

                   {/* Attention metrics (Views + Watchers) — placed near title/price for scannability */}
                   <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-slate-500 dark:text-slate-400">
                     <span title="Views (last 90 days from eBay)">👁 {l.views_count ?? "—"}</span>
                     <span title="Watchers">★ {l.watchers_count ?? "—"}</span>
                   </div>
                  <p className="mt-1 text-[11px] text-slate-300">
                    synced {l.last_synced_at ? formatDateTime(l.last_synced_at) : "—"}
                  </p>
                </div>
              </a>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
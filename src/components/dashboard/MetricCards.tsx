import Link from "next/link";
import { Sparkline } from "@/components/dashboard/Sparkline";
import {
  BoxIcon,
  DollarIcon,
  GiftIcon,
  TagIcon,
  TONE_CHIP,
} from "@/components/dashboard/icons";
import type {
  InventoryTotals,
  ListingStats,
  PortfolioTrend,
} from "@/lib/dashboard-metrics";
import { centsToUsd } from "@/lib/utils";

/** The four top-line metric cards (Inventory Value · eBay Listings · Bundles · Net from Sales). */
export function MetricCards({
  totals,
  listingStats,
  bundlesWaiting,
  netSalesCents,
  salesCount30d,
  trend,
}: {
  totals: InventoryTotals;
  listingStats: ListingStats;
  bundlesWaiting: number;
  netSalesCents: number;
  salesCount30d: number;
  trend: PortfolioTrend | null;
}) {
  const sparkValues = trend ? trend.series.map((p) => p.valueCents) : [];
  const listSub =
    listingStats.addedThisWeek > 0
      ? `active right now · ${listingStats.addedThisWeek} new this week`
      : "active right now";
  const bundleSub =
    bundlesWaiting > 0 ? "draft or reserved right now" : "nothing waiting";
  const salesSub =
    salesCount30d > 0
      ? `${salesCount30d} sale${salesCount30d === 1 ? "" : "s"} in the last 30 days`
      : "no sales in the last 30 days";

  return (
    <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
      <Metric
        href="/inventory"
        tone="blue"
        icon={<BoxIcon />}
        title="Inventory Value"
        value={centsToUsd(totals.valueCents)}
        sub={`${totals.units} units across ${totals.itemCount} items`}
        chip={
          trend ? <TrendChip pct={trend.pct} label={trend.label} /> : undefined
        }
        sparkValues={sparkValues}
        tint
      />
      <Metric
        href="/listings"
        tone="sky"
        icon={<TagIcon />}
        title="eBay Listings"
        value={String(listingStats.active)}
        sub={listSub}
      />
      <Metric
        href="/bundles"
        tone="amber"
        icon={<GiftIcon />}
        title="Bundles to finish"
        value={String(bundlesWaiting)}
        sub={bundleSub}
        tint
      />
      <Metric
        href="/sales"
        tone="emerald"
        icon={<DollarIcon />}
        title="Net from sales"
        value={centsToUsd(netSalesCents)}
        sub={salesSub}
      />
    </div>
  );
}

function Metric({
  href,
  tone,
  icon,
  title,
  value,
  sub,
  chip,
  sparkValues,
  tint = false,
}: {
  href: string;
  tone: string;
  icon: React.ReactNode;
  title: string;
  value: string;
  sub: string;
  chip?: React.ReactNode;
  sparkValues?: number[];
  tint?: boolean;
}) {
  const tintClass =
    tint === true
      ? tone === "amber"
        ? "bg-amber-50/60 dark:bg-amber-950/30"
        : "bg-blue-50/60 dark:bg-blue-950/30"
      : "";
  return (
    <Link
      href={href}
      className={`card block p-4 transition hover:-translate-y-0.5 hover:shadow-md ${tintClass}`}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="flex min-w-0 items-center gap-2">
          <span
            className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-white ${TONE_CHIP[tone] ?? TONE_CHIP.blue}`}
          >
            {icon}
          </span>
          <span className="truncate text-sm font-bold dark:text-slate-100">{title}</span>
        </span>
        {chip}
      </div>
      <p className="mt-3 text-2xl font-extrabold tracking-tight dark:text-white">{value}</p>
      <div className="mt-1 flex items-end justify-between gap-2">
        <p className="min-w-0 truncate text-xs text-slate-400 dark:text-slate-500">{sub}</p>
        {sparkValues && sparkValues.length >= 2 && (
          <Sparkline
            values={sparkValues}
            className="h-6 w-16 shrink-0 sm:w-20"
            stroke="#2563eb"
            fill
          />
        )}
      </div>
    </Link>
  );
}

function TrendChip({ pct, label }: { pct: number | null; label?: string }) {
  if (pct == null || !Number.isFinite(pct)) return null;
  const up = pct >= 0;
  return (
    <span
      className={`inline-flex max-w-[55%] shrink-0 items-center gap-1 truncate rounded-full px-2 py-0.5 text-xs font-bold ${
        up
          ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/70 dark:text-emerald-300"
          : "bg-red-50 text-red-600 dark:bg-red-950/70 dark:text-red-300"
      }`}
      title={label ? `${up ? "Up" : "Down"} ${label}` : undefined}
    >
      {up ? "↑" : "↓"} {(Math.abs(pct) * 100).toFixed(1)}%
      {label && <span className="hidden truncate font-medium opacity-70 xl:inline">{label}</span>}
    </span>
  );
}

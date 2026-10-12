import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ebayTitlesForBundles } from "@/lib/bundle";
import { Greeting } from "@/components/dashboard/Greeting";
import { InventoryByGame } from "@/components/dashboard/InventoryByGame";
import { InventoryHealth } from "@/components/dashboard/InventoryHealth";
import { MarketPulse } from "@/components/dashboard/MarketPulse";
import { MetricCards } from "@/components/dashboard/MetricCards";
import { NeedsAttention } from "@/components/dashboard/NeedsAttention";
import { RecentSales } from "@/components/dashboard/RecentSales";
import { RecentlyAdded } from "@/components/dashboard/RecentlyAdded";
import { UpcomingReleases } from "@/components/dashboard/UpcomingReleases";
import {
  attentionTasks,
  gameBreakdown,
  inventoryTotals,
  listingStats,
  portfolioTrend,
  topMovers,
} from "@/lib/dashboard-metrics";
import { fetchReleaseArtwork } from "@/lib/release-art";
import { fetchUpcomingReleases } from "@/lib/releases";
import type {
  Bundle,
  Item,
  Listing,
  PriceHistoryPoint,
  Sale,
} from "@/lib/types";

export const metadata = { title: "Dashboard · goodwhilly" };

const DAY_MS = 86_400_000;

type SaleRow = Sale & {
  item?: { name: string | null } | null;
  bundle?: { name: string | null } | null;
};

type BundleRow = Bundle & { display_name: string };

async function loadDashboard() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [items, bundles, listings, sales, historyRows, profile] = await Promise.all([
    supabase
      .from("items")
      .select("*")
      .eq("owner_id", user.id)
      .order("created_at", { ascending: false })
      .limit(500),
    supabase
      .from("bundles")
      .select("*")
      .eq("owner_id", user.id)
      .order("created_at", { ascending: false })
      .limit(50),
    supabase
      .from("listings")
      .select("*")
      .eq("owner_id", user.id)
      .order("last_synced_at", { ascending: false })
      .limit(100),
    supabase
      .from("sales")
      .select("*, item:items!sales_item_id_fkey(name), bundle:bundles!sales_bundle_id_fkey(name)")
      .eq("owner_id", user.id)
      .order("sold_at", { ascending: false })
      .limit(500),
    supabase
      .from("item_price_history")
      .select("*")
      .eq("owner_id", user.id)
      .order("created_at", { ascending: true })
      .order("id", { ascending: true })
      .limit(5000),
    supabase.from("profiles").select("display_name").eq("id", user.id).maybeSingle(),
  ]);

  // Reserved list shows linked eBay listing titles when a bundle is linked.
  const bundleRows = (bundles.data ?? []) as Bundle[];
  const allocated = bundleRows.filter((b) => b.status === "allocated");
  const titles = await ebayTitlesForBundles(
    supabase,
    user.id,
    allocated.map((b) => b.ebay_listing_id),
  );

  const profileName = (profile.data?.display_name as string | null) ?? null;
  const displayName =
    profileName ||
    (user.user_metadata?.display_name as string | undefined) ||
    user.email?.split("@")[0] ||
    "there";

  return {
    items: (items.data ?? []) as Item[],
    itemsError: items.error?.message ?? null,
    bundles: bundleRows.map((b) => ({
      ...b,
      display_name: titles.get(b.ebay_listing_id ?? "") ?? b.name,
    })) as BundleRow[],
    listings: (listings.data ?? []) as Listing[],
    sales: (sales.data ?? []) as SaleRow[],
    history: (historyRows.data ?? []) as PriceHistoryPoint[],
    displayName,
  };
}

export default async function DashboardPage() {
  const [d, releases] = await Promise.all([loadDashboard(), fetchUpcomingReleases()]);

  const now = Date.now();
  const totals = inventoryTotals(d.items);
  const stats = listingStats(d.listings, now);
  const trend = portfolioTrend(d.items, d.history, { windowDays: 30, now, seriesPoints: 20 });
  const week = portfolioTrend(d.items, d.history, { windowDays: 7, now, seriesPoints: 8 });
  const { gainers, decliners } = topMovers(d.items, d.history, { windowDays: 30, now });
  const games = gameBreakdown(d.items);
  const tasks = attentionTasks(d.items, d.bundles, d.listings);

  // Featured release panel artwork: the release's OWN official image (resolved
  // with the calendar — wiki infobox / press product page) wins; Scryfall
  // art_crop is the MTG-only last resort; null → branded placeholder panel.
  const featured = releases.releases.find((r) => r.date) ?? releases.releases[0] ?? null;
  const featuredArtwork = featured
    ? featured.imageUrl ??
      (await fetchReleaseArtwork(featured.name, featured.game).catch(() => null))
    : null;

  const waiting = d.bundles.filter((b) => b.status === "draft" || b.status === "allocated").length;
  const reserved = d.bundles.filter((b) => b.status === "allocated");
  const sales30 = d.sales.filter((s) => now - Date.parse(s.sold_at) <= 30 * DAY_MS);
  const net30 = sales30.reduce((a, s) => a + (s.net_cents ?? 0), 0);

  return (
    <div className="space-y-4">
      <Greeting name={d.displayName} />

      <MetricCards
        totals={totals}
        listingStats={stats}
        bundlesWaiting={waiting}
        netSalesCents={net30}
        salesCount30d={sales30.length}
        trend={trend}
      />
      <p className="text-xs text-slate-400 dark:text-slate-500">
        {d.itemsError
          ? `Inventory read error: ${d.itemsError}`
          : "Values are resale estimates, summed from every item row (active + paused)."}
      </p>

      <div className="grid items-start gap-4 lg:grid-cols-3">
        {/* Left: attention, game mix, inventory health */}
        <div className="space-y-4">
          <NeedsAttention tasks={tasks} activeListings={stats.active} reserved={reserved} />
          <InventoryByGame slices={games} total={totals.itemCount} />
          <InventoryHealth tasks={tasks} />
        </div>

        {/* Center: recent additions, market pulse */}
        <div className="space-y-4">
          <RecentlyAdded items={d.items} />
          <MarketPulse
            totals={totals}
            trend={trend}
            week={week}
            gainers={gainers}
            decliners={decliners}
            items={d.items}
          />
        </div>

        {/* Right: upcoming releases, recent sales */}
        <div className="space-y-4">
          <UpcomingReleases
            releases={releases.releases}
            errors={releases.errors}
            artwork={featuredArtwork}
          />
          <RecentSales sales={d.sales.slice(0, 8)} activeListings={stats.active} />
        </div>
      </div>
    </div>
  );
}

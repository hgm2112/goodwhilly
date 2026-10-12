import { DashboardCard } from "@/components/dashboard/DashboardCard";
import { Sparkline } from "@/components/dashboard/Sparkline";
import { ActivityIcon } from "@/components/dashboard/icons";
import type {
  InventoryTotals,
  Mover,
  PortfolioTrend,
} from "@/lib/dashboard-metrics";
import type { Item } from "@/lib/types";
import { centsToUsd, truncated } from "@/lib/utils";

/**
 * Value trend + week delta + biggest gainer/decliner + average item value.
 * Every figure is derived from price history — cards with no data say so
 * rather than inventing numbers.
 */
export function MarketPulse({
  totals,
  trend,
  week,
  gainers,
  decliners,
  items,
}: {
  totals: InventoryTotals;
  trend: PortfolioTrend | null;
  week: PortfolioTrend | null;
  gainers: Mover[];
  decliners: Mover[];
  items: Item[];
}) {
  const avgCents =
    totals.units > 0 ? Math.round(totals.valueCents / totals.units) : 0;
  const avgSeries =
    trend && totals.units > 0
      ? trend.series.map((p) => p.valueCents / totals.units)
      : [];

  return (
    <DashboardCard
      title="Market Pulse"
      tone="emerald"
      icon={<ActivityIcon className="h-4 w-4" />}
      headerExtra={
        trend ? (
          <span className="hidden text-xs font-medium text-slate-400 dark:text-slate-500 sm:inline">
            {trend.label}
          </span>
        ) : undefined
      }
    >
      <div className="grid grid-cols-2 gap-3">
        <Sub label="Inventory Value">
          <div className="flex items-center justify-between gap-2">
            <p className="text-lg font-extrabold tracking-tight dark:text-slate-100">
              {centsToUsd(totals.valueCents)}
            </p>
            {trend && <DeltaPct pct={trend.pct} />}
          </div>
          {trend ? (
            <Sparkline
              values={trend.series.map((p) => p.valueCents)}
              className="mt-1 h-6 w-full"
              stroke="#2563eb"
              fill
            />
          ) : (
            <Muted>No price history yet</Muted>
          )}
        </Sub>

        <Sub label="This Week">
          <div className="flex items-center justify-between gap-2">
            <p className="text-lg font-extrabold tracking-tight dark:text-slate-100">
              {week ? signedUsd(week.deltaCents) : "—"}
            </p>
            {week && <DeltaPct pct={week.pct} />}
          </div>
          {week ? (
            <Sparkline
              values={week.series.map((p) => p.valueCents)}
              className="mt-1 h-6 w-full"
              stroke="#2563eb"
              fill
            />
          ) : (
            <Muted>Not enough history yet</Muted>
          )}
        </Sub>

        <Sub label="Biggest Gainer">
          <MoverRow mover={gainers[0]} items={items} tone="up" />
        </Sub>

        <Sub label="Biggest Drop">
          <MoverRow mover={decliners[0]} items={items} tone="down" />
        </Sub>
      </div>

      <div className="mt-3 flex items-center justify-between gap-3 rounded-xl border border-slate-200 px-3 py-2.5 dark:border-slate-800">
        <div className="min-w-0">
          <p className="text-xs font-semibold text-slate-400 dark:text-slate-500">
            Average Item Value
          </p>
          <p className="text-lg font-extrabold tracking-tight dark:text-slate-100">
            {centsToUsd(avgCents)}
          </p>
        </div>
        {avgSeries.length >= 2 ? (
          <Sparkline values={avgSeries} className="h-7 w-24 shrink-0" stroke="#2563eb" fill />
        ) : (
          <Muted>—</Muted>
        )}
      </div>
    </DashboardCard>
  );
}

function Sub({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-slate-200 p-3 dark:border-slate-800">
      <p className="text-xs font-semibold text-slate-400 dark:text-slate-500">{label}</p>
      <div className="mt-1">{children}</div>
    </div>
  );
}

function Muted({ children }: { children: React.ReactNode }) {
  return (
    <p className="mt-1 text-xs text-slate-400 dark:text-slate-500">{children}</p>
  );
}

function DeltaPct({ pct }: { pct: number | null }) {
  if (pct == null || !Number.isFinite(pct)) return null;
  const up = pct >= 0;
  return (
    <span
      className={`shrink-0 text-xs font-bold ${
        up ? "text-emerald-600 dark:text-emerald-400" : "text-red-500 dark:text-red-400"
      }`}
    >
      {up ? "↑" : "↓"} {(Math.abs(pct) * 100).toFixed(1)}%
    </span>
  );
}

function MoverRow({
  mover,
  items,
  tone,
}: {
  mover: Mover | undefined;
  items: Item[];
  tone: "up" | "down";
}) {
  if (!mover) {
    return <Muted>Needs at least two price points</Muted>;
  }
  const item = items.find((i) => i.id === mover.itemId);
  const color =
    tone === "up"
      ? "text-emerald-600 dark:text-emerald-400"
      : "text-red-500 dark:text-red-400";
  return (
    <div className="flex items-center gap-2.5">
      {item?.image_url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={item.image_url}
          alt=""
          className="h-10 w-10 shrink-0 rounded-lg border border-slate-200 object-cover dark:border-slate-800"
        />
      ) : (
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-[10px] font-bold text-slate-400 dark:bg-slate-800">
          {tone === "up" ? "↑" : "↓"}
        </span>
      )}
      <div className="min-w-0 flex-1">
        <p className="truncate text-xs font-semibold dark:text-slate-200" title={mover.name}>
          {truncated(mover.name, 26)}
        </p>
        <p className={`text-sm font-extrabold ${color}`}>
          {tone === "up" ? "↑" : "↓"} {Math.abs(mover.pct * 100).toFixed(1)}%
        </p>
      </div>
    </div>
  );
}

function signedUsd(cents: number): string {
  const sign = cents < 0 ? "−" : "+";
  return `${sign}${centsToUsd(Math.abs(cents))}`;
}

"use client";

import Link from "next/link";
import { ArtworkThumb } from "@/components/ArtworkThumb";
import { DashboardCard } from "@/components/dashboard/DashboardCard";
import { BoxIcon } from "@/components/dashboard/icons";
import type { Item } from "@/lib/types";
import { centsToUsd, kindLabel, truncated } from "@/lib/utils";

/** Six newest inventory rows as artwork tiles (horizontal scroll on phones). */
export function RecentlyAdded({ items }: { items: Item[] }) {
  const recent = items.slice(0, 6);
  if (recent.length === 0) {
    return (
      <DashboardCard title="Recently Added" tone="violet" icon={<BoxIcon className="h-4 w-4" />}>
        <p className="py-4 text-center text-sm text-slate-500 dark:text-slate-400">
          Nothing here yet — scan or add your first item.
        </p>
      </DashboardCard>
    );
  }

  return (
    <DashboardCard
      title="Recently Added"
      tone="violet"
      icon={<BoxIcon className="h-4 w-4" />}
      action={{ href: "/inventory", label: "View all" }}
    >
      <div className="grid min-w-0 grid-cols-2 gap-3 sm:grid sm:grid-cols-3 sm:gap-3 sm:overflow-visible">
        {recent.map((item) => (
          <RecentTile key={item.id} item={item} />
        ))}
      </div>
    </DashboardCard>
  );
}

function RecentTile({ item }: { item: Item }) {
  // Display the main product name bold and the deck variant muted below it.
  const colon = item.name.lastIndexOf(":");
  const main = colon > 0 ? item.name.slice(0, colon).trim() : item.name;
  const sub = colon > 0 ? item.name.slice(colon + 1).trim() : null;
  const meta = sub ?? item.category ?? kindLabel(item.kind);

  return (
    <div className="group min-w-0 w-full sm:w-auto">
      <div className="relative aspect-square overflow-hidden rounded-lg border border-slate-200 bg-slate-100 dark:border-slate-800 dark:bg-slate-800">
        {item.image_url ? (
          <ArtworkThumb src={item.image_url} alt={item.name} className="h-full w-full" />
        ) : (
          <div className="flex h-full w-full flex-col items-center justify-center gap-1 text-slate-400 dark:text-slate-500">
            <BoxIcon className="h-6 w-6" />
            <span className="px-1 text-center text-[10px] font-semibold uppercase">
              {kindLabel(item.kind)}
            </span>
          </div>
        )}
      </div>
      <Link
        href="/inventory"
        className="mt-1.5 block truncate text-xs font-bold dark:text-slate-200 group-hover:text-blue-600 dark:group-hover:text-blue-400"
        title={item.name}
      >
        {truncated(main, 28)}
      </Link>
      <p className="truncate text-[11px] text-slate-400 dark:text-slate-500" title={meta}>
        {truncated(meta, 28)}
      </p>
      <p className="text-xs font-bold dark:text-slate-200">
        {item.value_cents != null ? (
          centsToUsd(item.value_cents)
        ) : (
          <span className="text-amber-600 dark:text-amber-400">needs price</span>
        )}
      </p>
    </div>
  );
}

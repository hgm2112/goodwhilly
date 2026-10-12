import Link from "next/link";
import { DashboardCard } from "@/components/dashboard/DashboardCard";
import { ReceiptIcon } from "@/components/dashboard/icons";
import type { Sale } from "@/lib/types";
import { centsToUsd } from "@/lib/utils";

type SaleRow = Sale & {
  item?: { name: string | null } | null;
  bundle?: { name: string | null } | null;
};

/** Recent sales list; empty state points at the active listings instead. */
export function RecentSales({
  sales,
  activeListings,
}: {
  sales: SaleRow[];
  activeListings: number;
}) {
  return (
    <DashboardCard
      title="Recent Sales"
      tone="emerald"
      icon={<ReceiptIcon className="h-4 w-4" />}
      action={{ href: "/sales", label: "View all" }}
    >
      {sales.length === 0 ? (
        <div className="flex flex-col items-center py-6 text-center">
          <span className="mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100 text-slate-400 dark:bg-slate-800 dark:text-slate-500">
            <ReceiptIcon className="h-7 w-7" />
          </span>
          <p className="text-sm font-bold dark:text-slate-100">No sales yet</p>
          <p className="mt-1 max-w-[42ch] text-xs text-slate-400 dark:text-slate-500">
            Your first sale will show up here with net profit after fees.
            {activeListings > 0 && ` You have ${activeListings} active listing${activeListings === 1 ? "" : "s"} ready to sell.`}
          </p>
          <Link href="/listings" className="btn btn-primary mt-3 text-xs">
            View listings
          </Link>
        </div>
      ) : (
        <ul className="divide-y divide-slate-100 dark:divide-slate-800">
          {sales.map((s) => (
            <li key={s.id} className="flex items-center justify-between gap-2 py-2">
              <span className="min-w-0">
                <span className="block truncate text-sm font-medium dark:text-slate-200">
                  {s.item?.name ?? s.bundle?.name ?? "Sale"}
                </span>
                <span className="block text-xs text-slate-400 dark:text-slate-500">
                  {s.sold_at.slice(0, 10)} · {s.buyer ?? "—"} · qty {s.quantity}
                </span>
              </span>
              <span className="shrink-0 text-sm font-semibold text-emerald-700 dark:text-emerald-400">
                {centsToUsd(s.net_cents)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </DashboardCard>
  );
}

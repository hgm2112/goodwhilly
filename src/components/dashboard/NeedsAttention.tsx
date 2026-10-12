import Link from "next/link";
import { DashboardCard } from "@/components/dashboard/DashboardCard";
import {
  ArrowIcon,
  BellIcon,
  CheckIcon,
  ChevronIcon,
  TONE_COUNT,
} from "@/components/dashboard/icons";
import type { AttentionTask } from "@/lib/dashboard-metrics";
import type { Bundle } from "@/lib/types";
import { formatDateTime, truncated } from "@/lib/utils";

/** Real attention states + the reserved-bundles list + a green active-listings summary. */
export function NeedsAttention({
  tasks,
  activeListings,
  reserved,
}: {
  tasks: AttentionTask[];
  activeListings: number;
  reserved: Bundle[];
}) {
  return (
    <DashboardCard
      title="Needs Attention"
      tone="red"
      icon={<BellIcon className="h-4 w-4" />}
    >
      {tasks.length > 0 ? (
        <ul className="-mx-2 space-y-0.5">
          {tasks.map((t) => (
            <li key={t.key}>
              <Link
                href={t.href}
                className="flex items-center gap-3 rounded-lg px-2 py-2 transition hover:bg-slate-50 dark:hover:bg-slate-800/70"
              >
                <span
                  className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold ${TONE_COUNT[t.tone] ?? TONE_COUNT.slate}`}
                >
                  {t.count}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold dark:text-slate-100">
                    {t.title}
                  </span>
                  <span className="block truncate text-xs text-slate-400 dark:text-slate-500">
                    {t.sub}
                  </span>
                </span>
                <ChevronIcon className="h-4 w-4 shrink-0 text-slate-300 dark:text-slate-600" />
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <div className="flex items-center gap-3 rounded-lg bg-emerald-50 px-3 py-3 dark:bg-emerald-950/40">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
            <CheckIcon className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <p className="text-sm font-bold text-emerald-800 dark:text-emerald-200">
              Nothing needs attention
            </p>
            <p className="text-xs text-emerald-600 dark:text-emerald-400">
              Every item is priced, stocked and active.
            </p>
          </div>
        </div>
      )}

      {reserved.length > 0 && (
        <div className="mt-3 border-t border-slate-100 pt-3 dark:border-slate-800">
          <p className="mb-1.5 text-xs font-bold uppercase tracking-wide text-slate-400 dark:text-slate-500">
            Reserved in bundles
          </p>
          <ul className="divide-y divide-slate-100 dark:divide-slate-800">
            {reserved.slice(0, 4).map((b) => (
              <li key={b.id} className="flex items-center justify-between gap-2 py-1.5">
                <Link
                  href={`/bundles/${b.id}`}
                  className="truncate text-sm text-blue-600 hover:underline dark:text-blue-400"
                >
                  {truncated(b.name, 40)}
                </Link>
                <span className="shrink-0 text-xs text-slate-400">
                  created {formatDateTime(b.created_at).split(" ")[0]}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {activeListings > 0 && (
        <div className="mt-3 flex items-center gap-2.5 rounded-lg bg-emerald-50 px-3 py-2.5 dark:bg-emerald-950/40">
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-emerald-600 text-white">
            <CheckIcon className="h-4 w-4" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-bold text-emerald-800 dark:text-emerald-200">
              {activeListings} listings are active
            </p>
            <p className="truncate text-xs text-emerald-600 dark:text-emerald-400">
              Everything looks good on eBay
            </p>
          </div>
          <ArrowIcon className="h-4 w-4 shrink-0 text-emerald-500" />
        </div>
      )}
    </DashboardCard>
  );
}

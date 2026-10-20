import Link from "next/link";
import { ArrowIcon, LayersIcon } from "@/components/dashboard/icons";
import type { AttentionTask } from "@/lib/dashboard-metrics";

/**
 * Gradient summary/promo card (the template's "Boost Sales" slot, used for
 * real inventory health instead): counts drawn from the same attention tasks.
 */
export function InventoryHealth({ tasks }: { tasks: AttentionTask[] }) {
  const count = (key: string) => tasks.find((t) => t.key === key)?.count ?? 0;
  const parts = [
    count("unpriced") > 0 ? `${count("unpriced")} unpriced` : null,
    count("out_of_stock") > 0 ? `${count("out_of_stock")} out of stock` : null,
    count("paused") > 0 ? `${count("paused")} paused` : null,
  ].filter((s): s is string => s !== null);

  return (
    <section className="card relative w-full min-w-0 overflow-hidden border-blue-500/40 bg-gradient-to-br from-blue-600 to-blue-700 p-4 text-white dark:from-blue-700 dark:to-blue-800">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-bold">Inventory health</p>
          <p className="mt-1 text-xs italic text-blue-100">
            {parts.length > 0
              ? `${parts.join(" · ")} · everything else is healthy`
              : "Everything is priced, in stock and active."}
          </p>
        </div>
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white/15">
          <LayersIcon className="h-5 w-5" />
        </span>
      </div>
      <Link
        href="/inventory"
        className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-white px-3 py-1.5 text-xs font-bold text-blue-700 shadow-sm transition hover:bg-blue-50"
      >
        Review inventory
        <ArrowIcon className="h-3.5 w-3.5" />
      </Link>
    </section>
  );
}

import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { BundleBuilder } from "@/components/BundleBuilder";
import { ChevronIcon } from "@/components/dashboard/icons";
import { bundleDisplayNames, bundlePriceCents } from "@/lib/bundle";
import { centsToUsd, truncated } from "@/lib/utils";

export const metadata = { title: "Bundles · goodwhilly" };

const PILL: Record<string, string> = {
  allocated: "badge-amber",
  listed: "badge-green",
  sold: "badge-red",
  draft: "badge-slate",
};

const GROUPS = [
  { key: "allocated", label: "Allocated" },
  { key: "listed", label: "Listed" },
  { key: "sold", label: "Sold" },
  { key: "draft", label: "Draft" },
];

export default async function BundlesPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: bundles } = await supabase
    .from("bundles")
    .select("*, bundle_items(quantity)")
    .eq("owner_id", user.id)
    .order("created_at", { ascending: false });

  // Cancelled bundles are hidden from this page (their stock was released).
  const visible = (bundles ?? []).filter(
    (b: { status: string }) => b.status !== "cancelled",
  );

  const names = await bundleDisplayNames(
    supabase,
    user.id,
    visible.map((b: { id: string; name: string; ebay_listing_id: string | null }) => ({
      id: b.id,
      name: b.name,
      ebay_listing_id: b.ebay_listing_id,
    })),
  );

  const wrapped = visible.map(
    (b: {
      id: string;
      name: string;
      ebay_listing_id: string | null;
      target_value_cents: number;
      total_value_cents: number;
      status: string;
      listing_price_cents: number | null;
      shipping_cents: number | null;
      created_at: string;
      bundle_items?: Array<{ quantity: number }>;
    }) => ({
      id: b.id,
      name: names.get(b.id) ?? b.name,
      target_value_cents: b.target_value_cents,
      total_value_cents: b.total_value_cents,
      status: b.status,
      listing_price_cents: b.listing_price_cents,
      shipping_cents: b.shipping_cents,
      listingLabel: [
        ...(b.shipping_cents != null ? [`ship ${centsToUsd(b.shipping_cents)}`] : []),
      ].join(" · "),
      created_at: b.created_at,
      item_count: (b.bundle_items ?? []).reduce(
        (n: number, x: { quantity: number }) => n + x.quantity,
        0,
      ),
    }),
  );

  return (
    <div className="grid min-w-0 items-start gap-4 lg:grid-cols-5">
      <div className="min-w-0 space-y-3 lg:col-span-3">
        <h1 className="text-sm font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">Generated bundles</h1>
        {wrapped.length === 0 ? (
          <div className="card text-sm text-slate-500 dark:text-slate-400">
            {(bundles ?? []).length > 0
              ? "No active bundles — cancelled bundles are hidden from this page."
              : "No bundles yet. Use the builder to create a mystery bundle from your current stock — stock is reserved the moment you create it."}
          </div>
        ) : (
          <div className="space-y-4">
            {GROUPS.map((g) => {
              const rows = wrapped.filter((b) => b.status === g.key);
              if (!rows.length) return null;
              return (
                <details key={g.key} open className="group">
                  <summary className="flex cursor-pointer list-none select-none items-center gap-2 rounded-lg px-1 py-1 hover:bg-slate-50 dark:hover:bg-slate-800/60 [&::-webkit-details-marker]:hidden">
                    <ChevronIcon className="h-4 w-4 shrink-0 text-slate-400 transition-transform group-open:rotate-90" />
                    <span className="text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                      {g.label}
                    </span>
                    <span className="text-xs text-slate-400">({rows.length})</span>
                  </summary>
                  <ul className="mt-2 space-y-2">
                    {rows.map((b) => (
                      <li key={b.id}>
                        <Link
                          href={`/bundles/${b.id}`}
                          className="card flex min-w-0 items-center justify-between gap-3 transition hover:border-blue-300 dark:hover:border-blue-700"
                        >
                          <span className="flex min-w-0 flex-1 items-center gap-2.5">
                            <span>
                              <span className="min-w-0 block truncate text-sm font-semibold">{truncated(b.name, 60)}</span>
                              <span className="block text-xs text-slate-400">
                                {b.item_count} items · created {b.created_at.slice(0, 10)} ·{" "}
                                <span className={`badge align-middle ${PILL[b.status] ?? "badge-slate"}`}>
                                  {b.status}
                                </span>
                              </span>
                            </span>
                          </span>
                          <span className="shrink-0 text-right text-sm">
                            <span className="font-bold text-emerald-700 dark:text-emerald-300">
                              {centsToUsd(
                                b.listing_price_cents ?? bundlePriceCents(b.total_value_cents),
                              )}
                            </span>
                            <span className="ml-1 text-xs text-slate-400">
                              {b.listingLabel ? `${b.listingLabel} · ` : ""}
                              {centsToUsd(b.total_value_cents)} value
                            </span>
                          </span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                </details>
              );
            })}
          </div>
        )}
      </div>

      <div className="min-w-0 lg:col-span-2">
        <h1 className="mb-2 text-sm font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">Bundle builder</h1>
        <BundleBuilder />
      </div>
    </div>
  );
}

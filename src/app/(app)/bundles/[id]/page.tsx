import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { BundleDetailClient } from "@/components/BundleDetailClient";
import { bundleDisplayNames, bundlePriceCents } from "@/lib/bundle";
import { centsToUsd, truncated } from "@/lib/utils";

export const metadata = { title: "Bundle · goodwhilly" };

export default async function BundleDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data, error } = await supabase
    .from("bundles")
    .select("*, bundle_items(*, item:items(*))")
    .eq("id", id)
    .eq("owner_id", user.id)
    .single();

  // PGRST116 = no rows matched; anything else is a real failure, not a 404.
  if (error && error.code !== "PGRST116") throw error;
  if (!data) notFound();

  const normalized = {
    ...data,
    items: data.bundle_items ?? [],
  };

  const count = (data.bundle_items ?? []).reduce(
    (n: number, bi: { quantity: number }) => n + bi.quantity,
    0,
  );

  const names = await bundleDisplayNames(supabase, user.id, [data]);
  const displayName = names.get(data.id) ?? data.name;

  // Listings already linked to another live bundle (cancelled bundles are
  // archived — their listings may be reused) stay out of this page's linker.
  const { data: linkedBundles } = await supabase
    .from("bundles")
    .select("id, ebay_listing_id")
    .eq("owner_id", user.id)
    .not("ebay_listing_id", "is", null)
    .neq("id", data.id)
    .neq("status", "cancelled");
  const linkedListingIds = (linkedBundles ?? [])
    .map((b: { ebay_listing_id: string | null }) => b.ebay_listing_id)
    .filter((x: string | null): x is string => Boolean(x));

  const { data: sale } = await supabase
    .from("sales")
    .select("id, sold_at, gross_cents, fee_cents, shipping_cents, net_cents")
    .eq("bundle_id", data.id)
    .eq("owner_id", user.id)
    .order("sold_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const stockNote =
    data.status === "sold"
      ? "· sold — its stock was already deducted"
      : data.status === "cancelled"
        ? "· cancelled — its stock was released"
        : "· stock for these items is currently reserved";

  return (
    <div className="space-y-3">
      <div className="flex min-w-0 items-center justify-between gap-3">
        <h1 className="min-w-0 truncate text-lg font-bold">{truncated(displayName, 60)}</h1>
        <span className="shrink-0 text-sm text-slate-400">
          <span className="font-semibold text-emerald-700 dark:text-emerald-300">{centsToUsd(bundlePriceCents(data.total_value_cents))}</span> price · {centsToUsd(data.total_value_cents)} value · {count} items
        </span>
      </div>
      <p className="hint">
        <Link href="/bundles" className="text-blue-600 dark:text-blue-400 hover:underline">
          ← Back to bundles
        </Link>{" "}
        {stockNote}
      </p>
      <BundleDetailClient
        initial={normalized}
        sale={sale ?? null}
        linkedListingIds={linkedListingIds}
      />
    </div>
  );
}
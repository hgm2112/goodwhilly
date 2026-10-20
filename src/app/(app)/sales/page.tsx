import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { SalesClient } from "@/components/SalesClient";
import type { SaleRow } from "@/components/SalesClient";
import { bundleDisplayNames } from "@/lib/bundle";

export const metadata = { title: "Sales · goodwhilly" };

export default async function SalesPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [sales, items, bundles] = await Promise.all([
    supabase
      .from("sales")
      .select(
        "*, item:items!sales_item_id_fkey(name, kind), bundle:bundles!sales_bundle_id_fkey(name)",
      )
      .eq("owner_id", user.id)
      .order("sold_at", { ascending: false })
      .limit(500),
      supabase
        .from("items")
        .select("*")
        .eq("owner_id", user.id)
        .eq("active", true)
        .gt("quantity", 0)
        .order("name"),
    supabase.from("bundles").select("*").eq("owner_id", user.id),
  ]);

  const names = await bundleDisplayNames(
    supabase,
    user.id,
    (bundles.data ?? []).map((b: { id: string; name: string; ebay_listing_id: string | null }) => ({
      id: b.id,
      name: b.name,
      ebay_listing_id: b.ebay_listing_id,
    })),
  );

  return (
    <SalesClient
      initial={(sales.data ?? []).map((s: SaleRow) => ({
        ...s,
        bundle_display_name: s.bundle_id ? names.get(s.bundle_id) ?? s.bundle?.name ?? null : null,
      }))}
      items={items.data ?? []}
      bundles={(bundles.data ?? []).map((b) => ({
        ...b,
        display_name: names.get(b.id) ?? b.name,
      }))}
    />
  );
}
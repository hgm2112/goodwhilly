import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ListingsClient } from "@/components/ListingsClient";
import { createAdminClient } from "@/lib/supabase/admin";

export const metadata = { title: "eBay Listings · goodwhilly" };

export default async function ListingsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [listings, tokens] = await Promise.all([
    supabase
      .from("listings")
      .select("*")
      .eq("owner_id", user.id)
      .order("last_synced_at", { ascending: false })
      .limit(500),
    createAdminClient()
      .from("ebay_tokens")
      .select("scope")
      .eq("owner_id", user.id)
      .maybeSingle(),
  ]);

  const scopeStr = typeof tokens.data?.scope === "string" ? tokens.data.scope : "";
  const ebayStatus = {
    connected: Boolean(tokens.data),
    viewsEnabled: Boolean(scopeStr && scopeStr.includes("sell.analytics.readonly")),
  };

  return (
    <ListingsClient
      initial={listings.data ?? []}
      ebayConnected={ebayStatus.connected}
      ebayStatus={ebayStatus}
    />
  );
}
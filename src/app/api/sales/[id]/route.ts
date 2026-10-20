import { NextResponse } from "next/server";
import { authUser, apiError, getIntParam } from "@/lib/api-helper";

type Params = { params: Promise<{ id: string }> };

/**
 * PATCH /api/sales/:id — edit the money/details of a recorded sale.
 *
 * The ledger link is immutable (`item_id`/`bundle_id`) and so is `quantity`
 * (stock was already moved when the sale was recorded). Net is always
 * recomputed as gross − fee.
 */
export async function PATCH(request: Request, { params }: Params) {
  const auth = await authUser();
  if (!auth) return apiError("Unauthorized", 401);
  const { supabase, user } = auth;
  const { id } = await params;
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return apiError("Invalid body");

  const { data: sale, error } = await supabase
    .from("sales")
    .select("*")
    .eq("id", id)
    .eq("owner_id", user.id)
    .single();
  if (error || !sale) return apiError("Sale not found", 404);

  const update: Record<string, unknown> = {};

  if (body.grossCents !== undefined) {
    const gross = getIntParam(String(body.grossCents));
    if (gross == null || gross <= 0) return apiError("grossCents must be > 0");
    update.gross_cents = gross;
  }
  for (const [wire, column] of [
    ["feeCents", "fee_cents"],
    ["shippingCents", "shipping_cents"],
  ] as const) {
    if (body[wire] === undefined) continue;
    const value = getIntParam(String(body[wire]));
    if (value == null || value < 0) return apiError(`${wire} must be a non-negative integer (cents)`);
    update[column] = value;
  }
  update.net_cents =
    Number(update.gross_cents ?? sale.gross_cents) - Number(update.fee_cents ?? sale.fee_cents);

  if (body.soldAt !== undefined) {
    const soldAt = new Date(String(body.soldAt));
    if (Number.isNaN(soldAt.getTime())) return apiError("soldAt must be a valid date");
    update.sold_at = soldAt.toISOString();
  }
  if (body.buyer !== undefined) {
    update.buyer = body.buyer ? String(body.buyer).slice(0, 120) : null;
  }
  if (body.note !== undefined) {
    update.note = body.note ? String(body.note).slice(0, 500) : null;
  }
  if (body.ebayOrderId !== undefined) {
    update.ebay_order_id = body.ebayOrderId ? String(body.ebayOrderId).slice(0, 120) : null;
  }

  const { data: updated, error: updateError } = await supabase
    .from("sales")
    .update(update)
    .eq("id", id)
    .eq("owner_id", user.id)
    .select()
    .single();
  if (updateError) {
    if (String(updateError.message).toLowerCase().includes("duplicate")) {
      return apiError("A sale with this eBay order ID is already recorded", 409);
    }
    return apiError(updateError.message, 500, { code: "DB" });
  }
  return NextResponse.json(updated);
}

/** DELETE /api/sales/:id — remove a sale record and restore stock. */
export async function DELETE(_request: Request, { params }: Params) {
  const auth = await authUser();
  if (!auth) return apiError("Unauthorized", 401);
  const { supabase, user } = auth;
  const { id } = await params;

  const { data: sale } = await supabase
    .from("sales")
    .select("*")
    .eq("id", id)
    .eq("owner_id", user.id)
    .single();
  if (!sale) return apiError("Sale not found", 404);

  if (sale.item_id) {
    await supabase
      .from("items")
      .update({
        quantity: (
          (await supabase.from("items").select("quantity").eq("id", sale.item_id).single()).data
            ?.quantity ?? 0
        ) + sale.quantity,
      })
      .eq("id", sale.item_id);
    await supabase.from("item_movements").insert({
      item_id: sale.item_id,
      owner_id: user.id,
      delta: sale.quantity,
      reason: "adjust",
      note: `Sale #${sale.id} deleted`,
    });
  }

  if (sale.bundle_id) {
    await supabase.from("bundles").update({ status: "listed" }).eq("id", sale.bundle_id);
  }

  const { error } = await supabase.from("sales").delete().eq("id", id).eq("owner_id", user.id);
  if (error) return apiError(error.message, 500, { code: "DB" });
  return NextResponse.json({ ok: true });
}
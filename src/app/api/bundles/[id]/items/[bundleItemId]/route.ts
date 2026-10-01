import { NextResponse } from "next/server";
import { authUser, apiError, readJson } from "@/lib/api-helper";
import { contentsApiError, patchContentsLine, removeContentsLine } from "@/lib/bundle-contents";

type Params = { params: Promise<{ id: string; bundleItemId: string }> };

/**
 * PATCH /api/bundles/:id/items/:bundleItemId — substitute the line's item
 * and/or set its quantity while the bundle is still draft/allocated.
 * Body: { newItemId?, quantity? } — omit/empty `newItemId` to keep the item
 * (quantity-only change), omit `quantity` to keep the quantity (swap with the
 * same line count). Returns the full bundle.
 */
export async function PATCH(request: Request, { params }: Params) {
  const auth = await authUser();
  if (!auth) return apiError("Unauthorized", 401);
  const { supabase, user } = auth;
  const { id, bundleItemId } = await params;

  const body = await readJson(request);
  const newItemId =
    typeof body.newItemId === "string" && body.newItemId.trim() ? body.newItemId.trim() : null;
  const quantity =
    body.quantity === undefined || body.quantity === null ? null : Number(body.quantity);
  if (quantity !== null && !Number.isInteger(quantity)) return apiError("quantity must be an integer");

  try {
    const bundle = await patchContentsLine(supabase, user.id, id, bundleItemId, newItemId, quantity);
    return NextResponse.json(bundle);
  } catch (e) {
    return contentsApiError(e);
  }
}

/** DELETE /api/bundles/:id/items/:bundleItemId — drop the line and release
 * its reserved stock back to inventory. Returns the full bundle. */
export async function DELETE(request: Request, { params }: Params) {
  const auth = await authUser();
  if (!auth) return apiError("Unauthorized", 401);
  const { supabase, user } = auth;
  const { id, bundleItemId } = await params;

  try {
    const bundle = await removeContentsLine(supabase, user.id, id, bundleItemId);
    return NextResponse.json(bundle);
  } catch (e) {
    return contentsApiError(e);
  }
}

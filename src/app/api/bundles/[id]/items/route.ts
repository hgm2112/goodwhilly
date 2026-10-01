import { NextResponse } from "next/server";
import { authUser, apiError, readJson } from "@/lib/api-helper";
import { addLine, contentsApiError } from "@/lib/bundle-contents";

type Params = { params: Promise<{ id: string }> };

/**
 * POST /api/bundles/:id/items — add (or merge) a contents line while the
 * bundle is still draft/allocated (before it is listed).
 * Body: { itemId, quantity } — quantity 1..99; stock, eligibility and the
 * per-bundle copy caps are enforced server-side. Returns the full bundle.
 */
export async function POST(request: Request, { params }: Params) {
  const auth = await authUser();
  if (!auth) return apiError("Unauthorized", 401);
  const { supabase, user } = auth;
  const { id } = await params;

  const body = await readJson(request);
  const itemId = typeof body.itemId === "string" ? body.itemId.trim() : "";
  if (!itemId) return apiError("itemId is required");
  const quantity = typeof body.quantity === "number" ? body.quantity : NaN;
  if (!Number.isInteger(quantity)) return apiError("quantity must be an integer");

  try {
    const bundle = await addLine(supabase, user.id, id, itemId, quantity);
    return NextResponse.json(bundle);
  } catch (e) {
    return contentsApiError(e);
  }
}

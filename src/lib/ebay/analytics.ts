import { createAdminClient } from "@/lib/supabase/admin";

export interface ViewsRefreshResult {
  ok: boolean;
  updated: number;
  error?: string;
  code?: "INSUFFICIENT_SCOPE" | "EBAY_ERROR" | "PARSE";
}

const TRAFFIC_URL = "https://api.ebay.com/sell/analytics/v1/traffic_report";
const WINDOW_DAYS = 90;

function yyyymmdd(d: Date): string {
  return d.toISOString().slice(0, 10).replace(/-/g, "");
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

/**
 * Fetch LISTING_VIEWS_TOTAL (real page views) for the given listing IDs
 * via the eBay Analytics Traffic Report (bulk, <=200 IDs per call).
 * Writes views_count + views_refreshed_at for IDs present in the report.
 * IDs absent from the report are left unchanged (we do not fabricate 0).
 *
 * The caller is responsible for providing a fresh user access token.
 * Best-effort: returns a structured result instead of throwing so the
 * main listing sync can continue even if views are unavailable.
 */
export async function refreshListingViews(
  ownerId: string,
  accessToken: string,
  itemIds: string[],
): Promise<ViewsRefreshResult> {
  if (!itemIds.length) return { ok: true, updated: 0 };

  const supabase = createAdminClient();
  const now = new Date().toISOString();
  const start = yyyymmdd(new Date(Date.now() - (WINDOW_DAYS - 1) * 24 * 60 * 60 * 1000));
  const end = yyyymmdd(new Date());

  let updated = 0;

  for (const batch of chunk(itemIds, 200)) {
    const filter = `listing_ids:{${batch.join("|")}},date_range:[${start}..${end}]`;
    const url = `${TRAFFIC_URL}?dimension=LISTING&metric=LISTING_VIEWS_TOTAL&filter=${encodeURIComponent(filter)}`;

    let res: Response;
    try {
      res = await fetch(url, {
        headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" },
      });
    } catch (err) {
      return {
        ok: false,
        updated,
        error: err instanceof Error ? err.message : "network error",
        code: "EBAY_ERROR",
      };
    }

    const text = await res.text();

    if (res.status === 403) {
      // Common when the token lacks sell.analytics.readonly (or the legacy
      // app was never granted the Sell Analytics API product).
      return { ok: false, updated, error: text.slice(0, 400), code: "INSUFFICIENT_SCOPE" };
    }
    if (!res.ok) {
      return { ok: false, updated, error: `HTTP ${res.status}: ${text.slice(0, 300)}`, code: "EBAY_ERROR" };
    }

    let payload: unknown;
    try {
      payload = JSON.parse(text);
    } catch {
      return { ok: false, updated, error: "invalid json", code: "PARSE" };
    }

    const p = (payload ?? {}) as Record<string, unknown>;
    const dims = (p.dimensions ?? []) as unknown[];
    const mets = (p.metrics ?? []) as unknown[];

    const dim = dims.find((d) => (d as Record<string, unknown>)?.name === "LISTING") || dims[0];
    const metric = mets.find((m) => (m as Record<string, unknown>)?.name === "LISTING_VIEWS_TOTAL") || mets[0];

    const dimValsRaw = (dim as Record<string, unknown>)?.dimensionValues;
    const metValsRaw = (metric as Record<string, unknown>)?.metricValues;
    const dimVals: unknown[] = Array.isArray(dimValsRaw) ? dimValsRaw : [];
    const metVals: unknown[] = Array.isArray(metValsRaw) ? metValsRaw : [];

    for (let i = 0; i < dimVals.length; i++) {
      const dv = (dimVals[i] ?? {}) as Record<string, unknown>;
      const id = String(dv.value ?? "");
      if (!id) continue;
      const mv = (metVals[i] ?? {}) as Record<string, unknown>;
      const raw = mv.value;
      const val = raw != null ? Number(raw) : null;
      const centsSafe = Number.isFinite(val) ? Math.max(0, Math.round(val as number)) : null;

      // Only touch rows that appear in the report.
      // Absent entries stay as-is (we never write 0 for "no data").
      const { error } = await supabase
        .from("listings")
        .update({ views_count: centsSafe, views_refreshed_at: now })
        .eq("owner_id", ownerId)
        .eq("ebay_listing_id", id);

      if (!error) updated++;
    }
  }

  return { ok: true, updated };
}

import { createAdminClient } from "@/lib/supabase/admin";

export interface ViewsRefreshResult {
  ok: boolean;
  updated: number;
  error?: string;
  code?: "INSUFFICIENT_SCOPE" | "EBAY_ERROR" | "PARSE";
}

const TRAFFIC_URL = "https://api.ebay.com/sell/analytics/v1/traffic_report";
const WINDOW_DAYS = 90;

export interface TrafficDateRange {
  start: string;
  end: string;
}

export interface AnalyticsDateHelpers {
  pacificDateISO: typeof pacificDateISO;
  addDaysToIsoDate: typeof addDaysToIsoDate;
  buildTrafficReportDateRange: typeof buildTrafficReportDateRange;
}

export function pacificDateISO(date: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Los_Angeles",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

export function addDaysToIsoDate(iso: string, days: number): string {
  const parts = iso
    .split("-")
    .map((p) => Number(p));
  const base = new Date(
    Date.UTC(parts[0], parts[1] - 1, parts[2], 12, 0, 0),
  );
  base.setUTCDate(base.getUTCDate() + days);
  return [
    base.getUTCFullYear(),
    String(base.getUTCMonth() + 1).padStart(2, "0"),
    String(base.getUTCDate()).padStart(2, "0"),
  ].join("-");
}

export function compactDate(iso: string): string {
  return iso.replace(/-/g, "");
}

export function isoFromCompact(compact: string): string {
  return `${compact.slice(0, 4)}-${compact.slice(4, 6)}-${compact.slice(6, 8)}`;
}

export function isValidCompactDate(value: string): boolean {
  if (!/^\d{8}$/.test(value)) return false;
  const iso = isoFromCompact(value);
  const parsed = new Date(`${iso}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === iso;
}

/**
 * eBay's Traffic Report filters support the YYYYMMDD form using the
 * America/Los_Angeles timezone. Today's data is not available yet, so the
 * report always ends on the previous completed day; the start is derived
 * from that end date to keep the intended inclusive window length.
 */
export function buildTrafficReportDateRange(
  now: Date = new Date(),
  windowDays: number = WINDOW_DAYS,
): TrafficDateRange {
  if (!Number.isInteger(windowDays) || windowDays < 1 || windowDays > 90) {
    throw new Error(`invalid eBay analytics windowDays: ${String(windowDays)}`);
  }

  const todayPacific = pacificDateISO(now);
  const endIso = addDaysToIsoDate(todayPacific, -1);
  const startIso = addDaysToIsoDate(endIso, -(windowDays - 1));
  const start = compactDate(startIso);
  const end = compactDate(endIso);

  if (!isValidCompactDate(start) || !isValidCompactDate(end) || start > end) {
    throw new Error(
      `invalid eBay analytics date range: start=${start}, end=${end}`,
    );
  }

  return { start, end };
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

  let range: TrafficDateRange;
  try {
    range = buildTrafficReportDateRange();
  } catch (err) {
    return {
      ok: false,
      updated: 0,
      error: err instanceof Error ? err.message : "invalid date range",
      code: "EBAY_ERROR",
    };
  }

  const { start, end } = range;

  if (process.env.NODE_ENV !== "production") {
    console.log(
      `[ebay/analytics] Traffic report date range (America/Los_Angeles, completed day): ${start}..${end}`,
    );
  }

  const supabase = createAdminClient();
  const now = new Date().toISOString();

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
    // eBay returns one report record per listing, with LISTING_ID and
    // LISTING_VIEWS_TOTAL inside that record's dimensionValues/metricValues.
    // (It does not use the old aggregate `dimensions`/`metrics` shape.)
    const recordsRaw = Array.isArray(p.records) ? p.records : [];

    if (process.env.NODE_ENV !== "production") {
      console.log(
        `[ebay/analytics] Traffic report returned ${recordsRaw.length} records`,
      );
    }

    for (const rawRecord of recordsRaw) {
      const rec = (rawRecord ?? {}) as Record<string, unknown>;
      const dimVals: unknown[] = Array.isArray(rec.dimensionValues)
        ? rec.dimensionValues
        : [];
      const metVals: unknown[] = Array.isArray(rec.metricValues)
        ? rec.metricValues
        : [];

      const firstDim = (dimVals[0] ?? {}) as Record<string, unknown>;
      const id = String(firstDim.value ?? "");
      if (!id) continue;

      const firstMet = (metVals[0] ?? {}) as Record<string, unknown>;
      const raw = firstMet.value;
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

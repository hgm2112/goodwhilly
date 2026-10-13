/**
 * Phase-0 verification probe for listing metrics (Views + Watchers).
 *
 * Two independent, READ-ONLY checks against the real eBay account:
 *
 *   1. WATCHERS — one GetMyeBaySelling page; prints whether each <Item>
 *      carries <WatchCount> (and the values). If present → the existing
 *      sync can parse it with ZERO extra API calls.
 *
 *   2. VIEWS — GET /sell/analytics/v1/traffic_report with metric
 *      LISTING_VIEWS_TOTAL for up to 200 of the account's active listing
 *      IDs, real 90-day window. Prints HTTP status + body. Expected BEFORE
 *      the sell.analytics.readonly scope is granted: 403 insufficient_scope.
 *      Expected AFTER re-connecting eBay with the new scope list: 200 with
 *      real per-listing view totals.
 *
 * Nothing is written to the DB (a token refresh is used locally only).
 * Exit code 0 only when BOTH checks pass (watchers present AND traffic
 * report 200) — during Phase 0 an exit of 1 with the scope finding is the
 * EXPECTED outcome.
 *
 * Usage: npx tsx scripts/probe-listing-metrics.ts
 * Env:   .env.local (auto-loaded)
 */
import { readFileSync } from "node:fs";
import { createDecipheriv } from "node:crypto";

const TRADING_API = "https://api.ebay.com/ws/api.dll";
const TRAFFIC_URL = "https://api.ebay.com/sell/analytics/v1/traffic_report";
const FALLBACK_SCOPES =
  "https://api.ebay.com/oauth/api_scope https://api.ebay.com/oauth/api_scope/sell.listing.read https://api.ebay.com/oauth/api_scope/sell.inventory.readonly";

function loadEnvLocal(): void {
  try {
    const text = readFileSync(".env.local", "utf8");
    for (const line of text.split("\n")) {
      if (!line || line.trim().startsWith("#")) continue;
      const eq = line.indexOf("=");
      if (eq < 0) continue;
      const key = line.slice(0, eq).trim();
      const value = line.slice(eq + 1).trim();
      if (!(key in process.env)) process.env[key] = value;
    }
  } catch {
    // env may already be exported
  }
}

function decryptSecret(stored: string): string {
  const prefix = "enc:";
  if (!stored.startsWith(prefix)) return stored;
  const hex = process.env.EBAY_TOKEN_ENCRYPTION_KEY;
  if (!hex) throw new Error("EBAY_TOKEN_ENCRYPTION_KEY missing; cannot decrypt tokens");
  const key = Buffer.from(hex, "hex");
  const raw = Buffer.from(stored.slice(prefix.length), "base64");
  const iv = raw.subarray(0, 12);
  const tag = raw.subarray(12, 28);
  const data = raw.subarray(28);
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8");
}

function grab(xml: string, tag: string): string | null {
  const m = xml.match(new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tag}>`));
  return m ? m[1].trim() : null;
}

interface TokenRow {
  access_token: string;
  refresh_token: string;
  expires_at: string | null;
  scope: string | null;
}

async function getAccessToken(baseUrl: string, serviceKey: string): Promise<string> {
  const res = await fetch(
    `${baseUrl}/rest/v1/ebay_tokens?select=access_token,refresh_token,expires_at,scope&limit=1`,
    { headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` } },
  );
  if (!res.ok) throw new Error(`token read failed (${res.status}): ${await res.text()}`);
  const rows = (await res.json()) as TokenRow[];
  if (!rows.length) throw new Error("no ebay_tokens row — connect eBay first");
  const row = rows[0];

  const expires = row.expires_at ? new Date(row.expires_at).getTime() : 0;
  if (row.access_token && expires - Date.now() > 120_000) return decryptSecret(row.access_token);

  // Refresh with the scope the row was granted (post-Phase-1 rows carry the
  // real granted set incl. analytics; older rows carry the legacy constant).
  const refresh = decryptSecret(row.refresh_token);
  const tokenRes = await fetch("https://api.ebay.com/identity/v1/oauth2/token", {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${process.env.EBAY_CLIENT_ID}:${process.env.EBAY_CLIENT_SECRET}`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refresh,
      scope: row.scope || FALLBACK_SCOPES,
    }),
  });
  if (!tokenRes.ok) throw new Error(`refresh failed (${tokenRes.status}): ${await tokenRes.text()}`);
  const fresh = (await tokenRes.json()) as { access_token: string };
  return fresh.access_token;
}

function yyyymmdd(d: Date): string {
  return d.toISOString().slice(0, 10).replace(/-/g, "");
}

async function main(): Promise<void> {
  loadEnvLocal();
  const baseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!baseUrl || !serviceKey) throw new Error("missing Supabase env");

  const token = await getAccessToken(baseUrl, serviceKey);
  console.log("access token acquired\n");

  // ── 1. Watchers: does GetMyeBaySelling carry WatchCount? ────────────────
  const body = `<?xml version="1.0" encoding="utf-8"?>
<GetMyeBaySellingRequest xmlns="urn:ebay:apis:eBLBaseComponents">
  <ActiveList>
    <Pagination>
      <EntriesPerPage>200</EntriesPerPage>
      <PageNumber>1</PageNumber>
    </Pagination>
  </ActiveList>
  <RequesterCredentials><eBayAuthToken>${token}</eBayAuthToken></RequesterCredentials>
</GetMyeBaySellingRequest>`;

  const res = await fetch(TRADING_API, {
    method: "POST",
    headers: {
      "X-EBAY-API-COMPATIBILITY-LEVEL": "967",
      "X-EBAY-API-SITEID": "0",
      "X-EBAY-API-VERSION": "1207",
      "X-EBAY-API-APP-NAME": process.env.EBAY_CLIENT_ID ?? "",
      "X-EBAY-API-DEV-NAME": process.env.EBAY_DEV_ID ?? "",
      "X-EBAY-API-CERT-NAME": process.env.EBAY_CLIENT_SECRET ?? "",
      "X-EBAY-API-CALL-NAME": "GetMyeBaySelling",
      "Content-Type": "text/xml",
    },
    body,
  });
  const xml = await res.text();
  const ack = grab(xml, "Ack");
  console.log(`[watchers] GetMyeBaySelling HTTP ${res.status} · Ack=${ack ?? "?"}`);
  if (ack !== "Success") {
    console.log(xml.slice(0, 800));
    process.exit(1);
  }

  const items = [...xml.matchAll(/<Item>([\s\S]*?)<\/Item>/g)].map((m) => m[1]);
  const withWatch = items.filter((i) => grab(i, "WatchCount") != null);
  console.log(`[watchers] items on page: ${items.length} · carrying <WatchCount>: ${withWatch.length}`);
  const sampleIds: string[] = [];
  for (const item of items.slice(0, 12)) {
    const id = grab(item, "ItemID") ?? "?";
    if (sampleIds.length < 200) sampleIds.push(id);
    const wc = grab(item, "WatchCount");
    const title = (grab(item, "Title") ?? "").slice(0, 44);
    console.log(`  ${wc != null ? `watchers=${wc}` : "NO WatchCount"} · ${id} · ${title}`);
  }
  for (const item of items.slice(12)) {
    const id = grab(item, "ItemID");
    if (id) sampleIds.push(id);
  }
  const watchersOk = withWatch.length > 0;
  console.log(`[watchers] RESULT: ${watchersOk ? "PASS — parse <WatchCount> during sync (0 extra calls)" : "FAIL — tag absent; needs a GetSellerList fallback"}`);
  const missing = items.filter((i) => grab(i, "WatchCount") == null);

  // 1c. Decisive: GetSellerList with IncludeWatchCount=true + ReturnAll is
  // documented to emit WatchCount EXPLICITLY (including 0). If the items
  // that lack <WatchCount> in GetMyeBaySelling show an explicit 0 here,
  // then absent-in-GetMyeBaySelling == ZERO watchers (eBay omits zero-valued
  // XML fields) and parsing absent as 0 is truthful, not fabricated.
  if (missing.length) {
    console.log("\n[watchers] cross-check via GetSellerList (IncludeWatchCount=true, DetailLevel=ReturnAll)…");
    const now = new Date();
    const from = new Date(now.getTime() - 1 * 24 * 60 * 60 * 1000).toISOString();
    const to = new Date(now.getTime() + 119 * 24 * 60 * 60 * 1000).toISOString();
    const slBody = `<?xml version="1.0" encoding="utf-8"?>
<GetSellerListRequest xmlns="urn:ebay:apis:eBLBaseComponents">
  <IncludeWatchCount>true</IncludeWatchCount>
  <EndTimeFrom>${from}</EndTimeFrom>
  <EndTimeTo>${to}</EndTimeTo>
  <DetailLevel>ReturnAll</DetailLevel>
  <Pagination><EntriesPerPage>200</EntriesPerPage><PageNumber>1</PageNumber></Pagination>
  <RequesterCredentials><eBayAuthToken>${token}</eBayAuthToken></RequesterCredentials>
</GetSellerListRequest>`;
    const sres = await fetch(TRADING_API, {
      method: "POST",
      headers: {
        "X-EBAY-API-COMPATIBILITY-LEVEL": "967",
        "X-EBAY-API-SITEID": "0",
        "X-EBAY-API-VERSION": "1207",
        "X-EBAY-API-APP-NAME": process.env.EBAY_CLIENT_ID ?? "",
        "X-EBAY-API-DEV-NAME": process.env.EBAY_DEV_ID ?? "",
        "X-EBAY-API-CERT-NAME": process.env.EBAY_CLIENT_SECRET ?? "",
        "X-EBAY-API-CALL-NAME": "GetSellerList",
        "Content-Type": "text/xml",
      },
      body: slBody,
    });
    const sxml = await sres.text();
    console.log(`[watchers] GetSellerList HTTP ${sres.status} · Ack=${grab(sxml, "Ack") ?? "?"}`);
    if (grab(sxml, "Ack") === "Success") {
      const sItems = [...sxml.matchAll(/<Item>([\s\S]*?)<\/Item>/g)].map((m) => m[1]);
      for (const sItem of sItems) {
        const id = grab(sItem, "ItemID");
        if (!id || !sampleIds.includes(id)) continue;
        const swc = grab(sItem, "WatchCount");
        const gmc = items.find((i) => grab(i, "ItemID") === id);
        const gwc = gmc ? grab(gmc, "WatchCount") : null;
        console.log(
          `  ${id} · GetMyeBaySelling=${gwc ?? "absent"} · GetSellerList=${swc != null ? swc : "absent"}`,
        );
      }
    } else {
      console.log(sxml.slice(0, 600));
    }
  }

  if (missing.length) {
    console.log(`\n[watchers] cross-checking ${Math.min(missing.length, 2)} item(s) missing WatchCount via GetItem…`);
    for (const item of missing.slice(0, 2)) {
      const id = grab(item, "ItemID") ?? "?";
      const getBody = `<?xml version="1.0" encoding="utf-8"?>
<GetItemRequest xmlns="urn:ebay:apis:eBLBaseComponents">
  <ItemID>${id}</ItemID>
  <DetailLevel>ReturnAll</DetailLevel>
  <RequesterCredentials><eBayAuthToken>${token}</eBayAuthToken></RequesterCredentials>
</GetItemRequest>`;
      const gres = await fetch(TRADING_API, {
        method: "POST",
        headers: {
          "X-EBAY-API-COMPATIBILITY-LEVEL": "967",
          "X-EBAY-API-SITEID": "0",
          "X-EBAY-API-VERSION": "1207",
          "X-EBAY-API-APP-NAME": process.env.EBAY_CLIENT_ID ?? "",
          "X-EBAY-API-DEV-NAME": process.env.EBAY_DEV_ID ?? "",
          "X-EBAY-API-CERT-NAME": process.env.EBAY_CLIENT_SECRET ?? "",
          "X-EBAY-API-CALL-NAME": "GetItem",
          "Content-Type": "text/xml",
        },
        body: getBody,
      });
      const gxml = await gres.text();
      const gwc = grab(gxml, "WatchCount");
      console.log(
        `  GetItem ${id} → Ack=${grab(gxml, "Ack") ?? "?"} · WatchCount ${gwc != null ? `EXPLICITLY "${gwc}"` : "absent"}${gwc == null ? "" : Number(gwc) === 0 ? " (0 ⇒ absent = zero watchers)" : " (real value)"}`,
      );
    }
  }

  // ── 2. Views: Analytics Traffic Report (LISTING_VIEWS_TOTAL) ────────────
  console.log("");
  const ids = sampleIds.slice(0, 200);
  if (!ids.length) {
    console.log("[views] no active listing IDs to query — skipping traffic report check");
    process.exit(watchersOk ? 0 : 1);
  }
  const start = yyyymmdd(new Date(Date.now() - 89 * 24 * 60 * 60 * 1000));
  const end = yyyymmdd(new Date());
  const filter = `listing_ids:{${ids.join("|")}},date_range:[${start}..${end}]`;
  const url = `${TRAFFIC_URL}?dimension=LISTING&metric=LISTING_VIEWS_TOTAL&filter=${encodeURIComponent(filter)}`;
  const traffic = await fetch(url, {
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
  });
  const trafficText = await traffic.text();
  console.log(`[views] GET traffic_report (${ids.length} listing ids, ${start}..${end}) → HTTP ${traffic.status}`);
  try {
    const parsed = JSON.parse(trafficText);
    console.log(JSON.stringify(parsed, null, 2).slice(0, 3000));
  } catch {
    console.log(trafficText.slice(0, 3000));
  }
  const viewsOk = traffic.status === 200;
  if (viewsOk) {
    console.log("[views] RESULT: PASS — sell.analytics.readonly granted; real view totals retrievable.");
  } else if (traffic.status === 403 || /insufficient|scope/i.test(trafficText)) {
    console.log(
      "[views] RESULT: scope missing — add sell.analytics.readonly to EBAY_SCOPES and RE-CONNECT eBay in Settings, then re-run this probe.",
    );
  } else {
    console.log("[views] RESULT: unexpected response — inspect above before implementing.");
  }

  console.log(`\nSUMMARY: watchers ${watchersOk ? "PASS" : "FAIL"} · views ${viewsOk ? "PASS" : "FAIL"}`);
  process.exit(watchersOk && viewsOk ? 0 : 1);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});

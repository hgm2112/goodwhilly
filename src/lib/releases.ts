/**
 * Upcoming product releases for the dashboard: MTG (incl. Secret Lair drops)
 * and Pokémon, merged into one chronological list.
 *
 * Sources (no API keys, no new deps):
 *   - MTG: mtg.wiki `Category:Upcoming releases` via the MediaWiki API —
 *     the category tracks announced sets/Secret Lair drops before Scryfall
 *     indexes them. Keeps `Infobox set` pages (drops books/films/comics and
 *     `/Commander` subpages); pages without an infobox release date are shown
 *     as TBA (most Secret Lair drops announce late).
 *   - Pokémon: the official press site's product schedule table
 *     (press.pokemon.com), parsed with a regex over the static HTML.
 *
 * Artwork (`UpcomingRelease.imageUrl` — resolved once per cache fill, so
 * the dashboard never searches for images on page load):
 *   - MTG/Secret Lair: every infobox carries `|image = <file>`; the file is
 *     resolved to a hotlinkable thumbnail on the wiki's own `files.mtg.wiki`
 *     CDN via ONE batched `prop=imageinfo` call per 6h fill (the wiki's
 *     PageImages/REST extensions are not installed — probed). Official set
 *     logos, product renders and Secret Lair drop art.
 *   - Pokémon: the schedule table has no images; each upcoming product page
 *     on the official gamespress-powered press site carries the per-set
 *     logo on `imguscdn.gamespress.com`. Those URLs are SIGNED (a `sky=`
 *     hash — any param edit returns 403), so they are used verbatim at the
 *     size the page serves (240px, ample for the dashboard). Fetched once
 *     per upcoming product, 6h-cached per URL (negatives included).
 *   - Everything is fail-soft: a failed image phase just leaves `imageUrl`
 *     null and the UI shows its branded placeholder. No image is ever
 *     hardcoded or invented; dates/categories/sorting are unaffected.
 *
 * Results are cached in-memory for 6h (module-level, like the eBay app
 * token) — `imageUrl` rides along in that same cache. Each source is
 * fetched independently in try/catch so one failure still returns the
 * other's rows; failures are reported as `errors[]`.
 */

export interface UpcomingRelease {
  name: string;
  /** "MTG" | "Secret Lair" | "Pokémon" — display badge. */
  label: string;
  game: "mtg" | "pokemon";
  /** `YYYY-MM-DD`, or null when the release date is still TBA. */
  date: string | null;
  url: string | null;
  /**
   * Official publisher/wiki artwork for the release (see module docs),
   * resolved when the calendar was fetched and cached with it. Null when
   * unavailable — callers show a branded placeholder, never a guess.
   */
  imageUrl: string | null;
}

export interface ReleasesResult {
  releases: UpcomingRelease[];
  /** One message per source that failed; empty when everything loaded. */
  errors: string[];
}

const CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const EMPTY_RETRY_MS = 5 * 60 * 1000;
let cached: { at: number; ttl: number; result: ReleasesResult } | null = null;

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function todayDateOnly(): string {
  return new Date().toISOString().slice(0, 10);
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

/** Decode the few HTML entities that show up in titles (&#233;, &amp;, …). */
function decodeEntities(s: string): string {
  return s
    .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec: string) => String.fromCodePoint(parseInt(dec, 10)))
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'");
}

async function fetchText(url: string, userAgent: string): Promise<string> {
  const res = await fetch(url, {
    headers: { "User-Agent": userAgent, Accept: "*/*" },
    signal: AbortSignal.timeout(10_000),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.text();
}

/** Decode HTML entities and require a bare https URL; anything else → null. */
function cleanImageUrl(u: string | null | undefined): string | null {
  if (!u) return null;
  const s = decodeEntities(u.trim());
  return /^https:\/\/\S+$/i.test(s) ? s : null;
}

/**
 * The infobox's `|image =` value as a local file name ("Foo bar.png"), or
 * null. Handles both plain values and `[[File:Foo bar.png|250px|alt=…]]`.
 */
function infoboxImageFile(wikitext: string): string | null {
  const m = /\|\s*image\s*=\s*([^\n]+)/i.exec(wikitext);
  if (!m) return null;
  let v = m[1].trim();
  if (v.startsWith("[[")) v = v.replace(/^\[\[/, "").split("]]")[0];
  v = v.split("|")[0].trim().replace(/^File:/i, "");
  return /\.(png|jpe?g|webp|gif)$/i.test(v) ? v : null;
}

/**
 * Batch-resolve `File:` names → hotlinkable thumbnail URLs (one API call
 * per 40 titles). Keys are lowercased file names. Never throws — a failed
 * phase just means fewer images.
 */
async function resolveFileUrls(files: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (files.length === 0) return out;
  const titles = files.map((f) => `File:${f.replace(/_/g, " ")}`);
  for (let i = 0; i < titles.length; i += 40) {
    const chunk = titles.slice(i, i + 40);
    const url =
      "https://mtg.wiki/api.php?action=query" +
      `&titles=${encodeURIComponent(chunk.join("|"))}` +
      "&prop=imageinfo&iiprop=url&iiurlwidth=640&format=json";
    const body = await fetchText(url, "goodwhilly/1.0 (inventory app release calendar)");
    const json = JSON.parse(body) as {
      query?: {
        pages?: Record<
          string,
          { title?: string; imageinfo?: Array<{ thumburl?: string; url?: string }> }
        >;
      };
    };
    for (const page of Object.values(json.query?.pages ?? {})) {
      const title = String(page.title ?? "").replace(/^File:/i, "");
      const info = page.imageinfo?.[0];
      const u = cleanImageUrl(info?.thumburl) ?? cleanImageUrl(info?.url);
      if (u) out.set(title.toLowerCase(), u);
    }
  }
  return out;
}

/** MTG upcoming releases (incl. Secret Lair) from mtg.wiki's Upcoming category. */
async function fetchMtgReleases(today: string): Promise<UpcomingRelease[]> {
  const url =
    "https://mtg.wiki/api.php?action=query" +
    "&generator=categorymembers&gcmtitle=Category:Upcoming_releases&gcmtype=page&gcmlimit=50" +
    "&prop=revisions|info&inprop=url&rvprop=content&rvslots=main&format=json";
  const body = await fetchText(url, "goodwhilly/1.0 (inventory app release calendar)");
  const json = JSON.parse(body) as {
    query?: { pages?: Record<string, Record<string, unknown>> };
  };
  const pages = Object.values(json.query?.pages ?? {});

  const out: UpcomingRelease[] = [];
  const imageFileByTitle = new Map<string, string | null>();
  for (const page of pages) {
    const title = String(page.title ?? "").trim();
    if (!title || title.includes("/")) continue; // skip /Commander etc. subpages
    const revisions = page.revisions as Array<{ slots?: { main?: { "*": string } } }> | undefined;
    const wikitext = revisions?.[0]?.slots?.main?.["*"] ?? "";
    if (!/\{\{\s*Infobox set\b/i.test(wikitext)) continue; // books/films/etc.

    // |release = {{start date and age|2026|10|2}} — the standard infobox date.
    let date: string | null = null;
    const iso = /\|\s*release\s*=\s*\{\{\s*start date and age\|(\d{4})\|(\d{1,2})\|(\d{1,2})/i.exec(
      wikitext,
    );
    if (iso) {
      date = `${iso[1]}-${pad(Number(iso[2]))}-${pad(Number(iso[3]))}`;
    } else {
      // Fallback: a plain-text release value ("October 2, 2026").
      const plain = /\|\s*release\s*=\s*([^\n|}]+)/i.exec(wikitext);
      if (plain) {
        const m = /^([A-Za-z]+)\s+(\d{1,2}),\s*(\d{4})$/.exec(plain[1].trim());
        if (m) {
          const month = MONTHS.findIndex((name) => name.toLowerCase() === m[1].toLowerCase());
          if (month >= 0) date = `${m[3]}-${pad(month + 1)}-${pad(Number(m[2]))}`;
        }
      }
    }

    if (date && date < today) continue; // already released
    imageFileByTitle.set(title, infoboxImageFile(wikitext));
    const fullurl = typeof page.fullurl === "string" ? page.fullurl : null;
    out.push({
      name: title,
      label: /^Secret Lair/i.test(title) ? "Secret Lair" : "MTG",
      game: "mtg",
      date,
      url: fullurl ?? `https://mtg.wiki/${encodeURIComponent(title.replace(/ /g, "_"))}`,
      imageUrl: null,
    });
  }

  // Official artwork: resolve every infobox image file in one batched call.
  // Fail-soft — a failed phase just leaves all MTG `imageUrl`s null.
  try {
    const files = [...new Set([...imageFileByTitle.values()].filter((f): f is string => !!f))];
    const urls = await resolveFileUrls(files);
    for (const rel of out) {
      const file = imageFileByTitle.get(rel.name);
      rel.imageUrl = file ? (urls.get(file.toLowerCase()) ?? null) : null;
    }
  } catch {
    /* image resolution unavailable — placeholders will show */
  }
  return out;
}

/** One row of the official press-site TCG product schedule. */
export interface PokemonScheduleRow {
  name: string;
  /** `YYYY-MM-DD`, or null when unparseable/TBA. */
  date: string | null;
  url: string;
}

const SCHEDULE_TTL_MS = 6 * 60 * 60 * 1000;
let scheduleCache: { at: number; rows: PokemonScheduleRow[] } | null = null;

/**
 * Full press.pokemon.com TCG schedule (`period=All` — includes PAST
 * releases), cached 6h. Shared by the dashboard's upcoming list (which
 * filters `date < today` itself) and the release-date resolver (which needs
 * the past). Never caches an empty parse (site change / block) so callers
 * with their own retry logic keep working.
 */
export async function fetchPokemonSchedule(): Promise<PokemonScheduleRow[]> {
  if (scheduleCache && Date.now() - scheduleCache.at < SCHEDULE_TTL_MS) {
    return scheduleCache.rows;
  }

  const html = await fetchText(
    "https://press.pokemon.com/en/Items/Schedule?period=All&types=3",
    "Mozilla/5.0 (goodwhilly release calendar)",
  );

  const rowRe =
    /<a class="prod-name" href="([^"]+)">([\s\S]*?)<\/a>[\s\S]*?<td class="td-date">\s*([\s\S]*?)\s*<\/td>/g;
  const rows: PokemonScheduleRow[] = [];
  let m: RegExpExecArray | null;
  while ((m = rowRe.exec(html)) !== null) {
    const name = decodeEntities(m[2].replace(/<[^>]+>/g, "").trim());
    const rawDate = decodeEntities(m[3].replace(/<[^>]+>/g, "").trim());
    if (!name) continue;
    const dm = /^([A-Za-z]+)\s+(\d{1,2}),\s*(\d{4})$/.exec(rawDate);
    let date: string | null = null;
    if (dm) {
      const month = MONTHS.findIndex((name2) => name2.toLowerCase() === dm[1].toLowerCase());
      if (month >= 0) date = `${dm[3]}-${pad(month + 1)}-${pad(Number(dm[2]))}`;
    }
    const href = m[1];
    rows.push({
      name,
      date,
      url: href.startsWith("http") ? href : `https://press.pokemon.com${href}`,
    });
  }

  if (rows.length) scheduleCache = { at: Date.now(), rows };
  return rows;
}

/** Future Pokémon TCG products from the official press-site schedule table. */
async function fetchPokemonReleases(today: string): Promise<UpcomingRelease[]> {
  const rows = await fetchPokemonSchedule();
  const out: UpcomingRelease[] = [];
  for (const row of rows) {
    if (row.date && row.date < today) continue; // already released
    out.push({
      name: row.name,
      label: "Pokémon",
      game: "pokemon",
      date: row.date,
      url: row.url,
      imageUrl: null,
    });
  }

  // Official artwork: each press product page carries the per-set logo on
  // the gamespress CDN. Fetched once per upcoming product (≤ a dozen,
  // once per 6h fill), fail-soft per row — a failure just means null.
  const imageResults = await Promise.allSettled(
    out.map((r) => (r.url ? fetchPokemonProductImage(r.url) : Promise.resolve(null))),
  );
  out.forEach((rel, i) => {
    const settled = imageResults[i];
    rel.imageUrl = settled.status === "fulfilled" ? settled.value : null;
  });
  return out;
}

const POKEMON_IMAGE_TTL_MS = 6 * 60 * 60 * 1000;
const pokemonImageCache = new Map<string, { at: number; url: string | null }>();

/**
 * Per-set logo from an official press product page. The gamespress CDN URLs
 * are SIGNED (`sky=` hash — editing any param 403s), so the exact URL the
 * page serves is used verbatim. Negatives are cached too; never throws.
 */
async function fetchPokemonProductImage(productUrl: string): Promise<string | null> {
  const hit = pokemonImageCache.get(productUrl);
  if (hit && Date.now() - hit.at < POKEMON_IMAGE_TTL_MS) return hit.url;

  let url: string | null = null;
  try {
    const html = await fetchText(productUrl, "Mozilla/5.0 (goodwhilly release calendar)");
    // <img class="productLogo" src="https://imguscdn.gamespress.com/…?w=240&amp;…&amp;sky=…">
    const tag =
      /<img[^>]*class="[^"]*productLogo[^"]*"[^>]*>/i.exec(html) ??
      /<img[^>]*alt="Image of [^"]*"[^>]*>/i.exec(html);
    const src = tag ? /src="([^"]+)"/i.exec(tag[0])?.[1] : undefined;
    url = cleanImageUrl(src);
  } catch {
    url = null;
  }

  pokemonImageCache.set(productUrl, { at: Date.now(), url });
  return url;
}

/** Dated releases ascending first, TBA last (stable by name within a bucket). */
function byDate(a: UpcomingRelease, b: UpcomingRelease): number {
  if (a.date && b.date) return a.date.localeCompare(b.date) || a.name.localeCompare(b.name);
  if (a.date) return -1;
  if (b.date) return 1;
  return a.name.localeCompare(b.name);
}

/** Merged MTG + Pokémon future releases, cached for 6h. Never throws. */
export async function fetchUpcomingReleases(): Promise<ReleasesResult> {
  if (cached && Date.now() - cached.at < cached.ttl) return cached.result;

  const today = todayDateOnly();
  const [mtg, pokemon] = await Promise.all([
    fetchMtgReleases(today).then(
      (releases) => ({ releases, error: null as string | null }),
      (err: unknown) => ({
        releases: [] as UpcomingRelease[],
        error: `MTG releases failed: ${err instanceof Error ? err.message : "unknown error"}`,
      }),
    ),
    fetchPokemonReleases(today).then(
      (releases) => ({ releases, error: null as string | null }),
      (err: unknown) => ({
        releases: [] as UpcomingRelease[],
        error: `Pokémon releases failed: ${err instanceof Error ? err.message : "unknown error"}`,
      }),
    ),
  ]);

  const errors = [mtg.error, pokemon.error].filter((e): e is string => Boolean(e));
  const result: ReleasesResult = {
    releases: [...mtg.releases, ...pokemon.releases].sort(byDate),
    errors,
  };
  // A hit caches for 6h; an empty result (outage/blip) retries in 5 min.
  cached = {
    at: Date.now(),
    ttl: result.releases.length > 0 ? CACHE_TTL_MS : EMPTY_RETRY_MS,
    result,
  };
  return result;
}

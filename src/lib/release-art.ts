import { findSetForProduct, searchCards } from "@/lib/scryfall";
import type { ScryfallCard } from "@/lib/types";

/**
 * Best-effort official artwork for the dashboard's featured release.
 * Resolves via Scryfall only (MTG): the release name → set match used by the
 * release-date resolver, then a representative card's `art_crop`; falling
 * back to an EXACT card-name match. Pokémon/Secret Lair/other releases and
 * anything unresolvable return null so the caller shows the styled panel —
 * never a guessed image. Results (including misses) cache for 6h.
 */

const CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const cache = new Map<string, { at: number; url: string | null }>();

function artOf(card: ScryfallCard): string | null {
  const uris = card.image_uris as
    | { art_crop?: string; large?: string; normal?: string }
    | undefined;
  return uris?.art_crop ?? uris?.large ?? uris?.normal ?? null;
}

export async function fetchReleaseArtwork(
  name: string,
  game: "mtg" | "pokemon",
): Promise<string | null> {
  if (game !== "mtg") return null; // Scryfall has no Pokémon sets

  const key = name.trim().toLowerCase();
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.url;

  let url: string | null = null;
  try {
    const match = await findSetForProduct(name);
    if (match) {
      const cards = await searchCards(`s:${match.code}`);
      for (const card of cards) {
        const art = artOf(card);
        if (art) {
          url = art;
          break;
        }
      }
    }
    if (!url) {
      const cards = await searchCards(`!"${name}"`);
      const exact = cards.find((c) => c.name.trim().toLowerCase() === key);
      if (exact) url = artOf(exact);
    }
  } catch {
    url = null;
  }

  cache.set(key, { at: Date.now(), url });
  return url;
}

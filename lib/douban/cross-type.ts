import { creditsMatch, normalizedName } from "../media-match";
import { validSeasonDate } from "../tmdb/season-match";
import type { Media, MediaDetail, MediaType } from "../types";

/** A fallback candidate costs one detail request, so the cross-type pool stays tighter than the ordinary one. */
const MAX_CROSS_CANDIDATES = 4;
/** Cross-medium candidates must share the Douban year; an adjacent year would be a different work. */
const YEAR = /^\d{4}$/;

const clean = (value: unknown) => typeof value === "string" ? value.normalize("NFKC").replace(/\p{Cf}/gu, "").trim() : "";
function people(value: unknown) {
  return Array.isArray(value) ? value.flatMap(person => {
    const raw = person && typeof person === "object" && !Array.isArray(person) ? person as Record<string, unknown> : {};
    return [raw.name, raw.latin_name].filter((name): name is string => typeof name === "string" && !!name.trim());
  }) : [];
}

/**
 * Douban files TV movies, specials and single-episode documentaries as tv (is_tv, episodes_count 1) while TMDB holds
 * them as movie, so an in-medium search can never see them. Only that direction is opened: the reverse pattern has no
 * equivalent cause in Douban's data, and a movie-to-tv retry would add a request to every unmatched film.
 */
export function crossTypeFallback(raw: Record<string, unknown>, mediaType: MediaType): MediaType | null {
  return mediaType === "tv" ? "movie" : null;
}

/** The release days the Douban record states. Only complete dates count; a bare year never confirms a day. */
export function sourceReleaseDates(raw: Record<string, unknown>): Set<string> {
  const values = [raw.release_date, ...(Array.isArray(raw.pubdate) ? raw.pubdate : [])];
  return new Set(values.flatMap(value => {
    if (typeof value !== "string") return [];
    const date = value.trim().match(/^\d{4}-\d{2}-\d{2}(?=$|[\s(（T])/)?.[0];
    return date && validSeasonDate(date) ? [date] : [];
  }));
}

/** Verified cross-type identity: the candidate belongs to the work itself, never to a same-name remake. */
function crossTypeConfirms(detail: MediaDetail, original: string, names: Set<string>): boolean {
  const candidates = [detail.title, detail.originalTitle].filter((name): name is string => typeof name === "string" && !!name.trim());
  if (!candidates.length) return false;
  const originalMatches = !!original && candidates.some(name => normalizedName(name) === normalizedName(original));
  return originalMatches || candidates.some(name => names.has(normalizedName(name)));
}

/**
 * Items for which the cross-type path already ran. The matcher reaches this module from its own empty-candidate
 * exit, so a caller that also retries across media must be able to tell an already answered attempt from an
 * untried one; without that signal the same search, subject and candidates would be fetched a second time.
 * The entry is written before any request, and the window is longer than the matcher's five minute negative cache
 * so a cached miss always still reports as attempted.
 */
const attempted = new Map<string, number>();
const ATTEMPT_TTL = 10 * 60_000;
const MAX_ATTEMPTS = 500;
const attemptKey = (item: Media) => [item.mediaType, item.doubanId ?? "", item.year, item.title].join("\u0000");

/** Whether the cross-type path already ran for this item during the current window. */
export function crossTypeAttempted(item: Media): boolean {
  const at = attempted.get(attemptKey(item));
  return at !== undefined && Date.now() - at < ATTEMPT_TTL;
}

/**
 * Resolve a work whose Douban medium disagrees with TMDB, only when the own-medium search returned nothing at all.
 * The branch answers with the single most credible candidate or not at all; it never picks the first plausible hit,
 * and it never relaxes exactMediaCandidates, which stays scoped to the item's own medium.
 */
export async function resolveCrossType(
  item: Media,
  raw: Record<string, unknown>,
  ownMediumSearches: Media[][],
  dependencies: { search: (title: string, year: string, media: MediaType) => Promise<Media[]>; detail: (media: MediaType, id: string) => Promise<{ detail: MediaDetail }> },
  fallbackMediaType: MediaType | null = crossTypeFallback(raw, item.mediaType),
): Promise<Media | null> {
  // The branch is cross-type by construction: a fallback that repeats the item's own medium would silently become a
  // second in-medium search and is refused instead.
  if (!fallbackMediaType || fallbackMediaType === item.mediaType || !YEAR.test(item.year)) return null;
  // Recorded as soon as the branch is entered and before any request: a caller that retries across media itself needs
  // to know this path already ran, including when a guard below refuses it.
  const key = attemptKey(item);
  attempted.delete(key);
  attempted.set(key, Date.now());
  while (attempted.size > MAX_ATTEMPTS) attempted.delete(attempted.keys().next().value!);
  // Zero own-medium results only; a non-empty pool that failed identity checks is never widened across media.
  if (!ownMediumSearches.length || !ownMediumSearches.every(results => Array.isArray(results) && results.length === 0)) return null;
  const original = clean(raw.original_title);
  const names = new Set([item.title, original].map(clean).filter(Boolean).map(normalizedName).filter(Boolean));
  if (!names.size) return null;
  // The original title is the more discriminating query, so it is asked first and the localised title second.
  const searchNames = [...new Set([original, clean(item.title)].filter(Boolean))];
  const pool: Media[] = [];
  for (const name of searchNames) {
    const results = await dependencies.search(name, item.year, fallbackMediaType);
    if (!Array.isArray(results)) continue;
    pool.push(...results);
    if (pool.length >= MAX_CROSS_CANDIDATES) break;
  }
  const candidates = [...new Map(pool.map(candidate => [candidate.id, candidate])).values()]
    .filter(candidate => candidate.mediaType === fallbackMediaType && typeof candidate.id === "number" && Number.isSafeInteger(candidate.id) && candidate.id > 0
      && candidate.year === item.year && [candidate.title, candidate.originalTitle].some(name => names.has(normalizedName(name))))
    .slice(0, MAX_CROSS_CANDIDATES);
  if (!candidates.length) return null;
  const evidence = { directors: people(raw.directors), actors: people(raw.actors) };
  const sourceDates = sourceReleaseDates(raw);
  const verified: Media[] = [];
  // Every candidate is inspected: the branch may only answer when exactly one survives, so no early exit is allowed.
  for (const candidate of candidates) {
    const { detail } = await dependencies.detail(fallbackMediaType, String(candidate.id));
    if (detail.id !== candidate.id || detail.mediaType !== fallbackMediaType || !validSeasonDate(detail.releaseDate)) continue;
    if (!crossTypeConfirms(detail, original, names)) continue;
    const creditsConfirmed = creditsMatch(detail, evidence);
    /**
     * Cross-type-only evidence, for works whose credits cannot be compared across the language boundary.
     * Some TMDB movies carry no director and credit their cast under names Douban never stores, so a single
     * overlapping actor is all the credit evidence that exists and creditsMatch cannot fire. There, an exactly
     * equal original title together with the very same release day is a stronger identity fact than name
     * similarity: it is only trusted while the filtered pool holds exactly one candidate, so it can never
     * choose between two equally plausible works, and it stays confined to this branch. The ordinary
     * in-medium path keeps its creditsMatch-only acceptance untouched.
     */
    const dateConfirmed = candidates.length === 1 && !!original
      && normalizedName(detail.originalTitle) === normalizedName(original)
      && sourceDates.has(detail.releaseDate);
    if (!creditsConfirmed && !dateConfirmed) continue;
    verified.push({ ...candidate, mediaType: fallbackMediaType, year: item.year, releaseDate: detail.releaseDate,
      posterPath: detail.posterPath, posterFallbacks: undefined, backdropPath: null, overview: detail.overview, imdbId: detail.imdbId });
  }
  return verified.length === 1 ? verified[0] : null;
}

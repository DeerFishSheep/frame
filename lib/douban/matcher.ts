import { creditsMatch, exactMediaCandidates, normalizedName, searchTitle } from "../media-match";
import type { Media, MediaDetail, MediaType } from "../types";

const object = (value: unknown): Record<string, unknown> => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
function people(value: unknown) {
  return Array.isArray(value) ? value.flatMap(person => [object(person).name, object(person).latin_name].filter((name): name is string => typeof name === "string" && !!name.trim())) : [];
}

/** Resolve same-title remakes from real credits; never choose the first popular search result. */
export function createDoubanMatcher(dependencies: {
  search: (title: string, year: string, media: MediaType) => Promise<Media[]>;
  subject: (media: MediaType, id: string) => Promise<{ data: unknown }>;
  detail: (media: MediaType, id: string) => Promise<{ detail: MediaDetail }>;
  now?: () => number;
}) {
  const cache = new Map<string, { match: Media | null; at: number }>(), inflight = new Map<string, Promise<Media | null>>();
  const now = dependencies.now ?? Date.now;
  async function resolve(item: Media): Promise<Media | null> {
    if (!/^\d{4}$/.test(item.year)) return null;
    const searched = [...await dependencies.search(item.title, item.year, item.mediaType)];
    let candidates = exactMediaCandidates(searched, item.title, item.year, item.mediaType);
    if (candidates.length === 1) return candidates[0];
    if (!item.doubanId) return null;
    const raw = object((await dependencies.subject(item.mediaType, item.doubanId)).data);
    const original = typeof raw.original_title === "string" ? raw.original_title.trim() : "";
    if (original) {
      const byOriginal = candidates.filter(candidate => normalizedName(candidate.originalTitle) === normalizedName(original));
      if (byOriginal.length) candidates = byOriginal;
      else if (normalizedName(original) !== normalizedName(searchTitle(item.title, item.mediaType))) {
        const originals = await dependencies.search(original, item.year, item.mediaType);
        searched.push(...originals);
        candidates = exactMediaCandidates(originals, original, item.year, item.mediaType);
      }
      if (candidates.length === 1) return candidates[0];
    }
    const evidence = { directors: people(raw.directors), actors: people(raw.actors) };
    if (!evidence.directors.length && evidence.actors.length < 2) return null;
    // TMDB's year filter can return the correct festival-year film with a later theatrical date.
    // Preserve that candidate, but require credits even when it is the only adjacent-year result.
    if (item.mediaType === "movie") {
      const names = new Set([item.title, original].filter(Boolean).map(name => normalizedName(searchTitle(name, "movie"))));
      candidates = searched.filter(candidate => candidate.mediaType === "movie" && /^\d{4}$/.test(candidate.year)
        && Math.abs(Number(candidate.year) - Number(item.year)) <= 1
        && [candidate.title, candidate.originalTitle].some(name => names.has(normalizedName(name))));
    }
    candidates = [...new Map(candidates.map(candidate => [candidate.id, candidate])).values()];
    if (!candidates.length || candidates.length > 4) return null;
    const verified: Media[] = [];
    for (const candidate of candidates) {
      if (typeof candidate.id !== "number") continue;
      const { detail } = await dependencies.detail(candidate.mediaType, String(candidate.id));
      if (detail.id === candidate.id && detail.mediaType === candidate.mediaType && creditsMatch(detail, evidence)) verified.push({ ...candidate, imdbId: detail.imdbId });
    }
    return verified.length === 1 ? verified[0] : null;
  }
  return (item: Media): Promise<Media | null> => {
    const key = `${item.mediaType}:${item.doubanId}:${item.title}:${item.year}`, previous = cache.get(key);
    if (previous && now() - previous.at < (previous.match ? 60 : 5) * 60_000) return Promise.resolve(previous.match);
    const pending = inflight.get(key); if (pending) return pending;
    const promise = resolve(item).then(match => {
      cache.delete(key); cache.set(key, { match, at: now() });
      while (cache.size > 500) cache.delete(cache.keys().next().value!);
      return match;
    }).finally(() => inflight.delete(key));
    inflight.set(key, promise); return promise;
  };
}

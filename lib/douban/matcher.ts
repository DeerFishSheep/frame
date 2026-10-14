import { creditsMatch, exactMediaCandidates, normalizedName } from "../media-match";
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
    let candidates = exactMediaCandidates(await dependencies.search(item.title, item.year, item.mediaType), item.title, item.year, item.mediaType);
    if (candidates.length === 1) return candidates[0];
    if (!item.doubanId) return null;
    const raw = object((await dependencies.subject(item.mediaType, item.doubanId)).data);
    const original = typeof raw.original_title === "string" ? raw.original_title.trim() : "";
    if (original) {
      const byOriginal = candidates.filter(candidate => normalizedName(candidate.originalTitle) === normalizedName(original));
      candidates = byOriginal.length ? byOriginal : exactMediaCandidates(await dependencies.search(original, item.year, item.mediaType), original, item.year, item.mediaType);
      if (candidates.length === 1) return candidates[0];
    }
    if (candidates.length < 2 || candidates.length > 4) return null;
    const evidence = { directors: people(raw.directors), actors: people(raw.actors) };
    if (!evidence.directors.length && evidence.actors.length < 2) return null;
    const verified: Media[] = [];
    for (const candidate of candidates) {
      if (typeof candidate.id !== "number") continue;
      const { detail } = await dependencies.detail(candidate.mediaType, String(candidate.id));
      if (creditsMatch(detail, evidence)) verified.push({ ...candidate, imdbId: detail.imdbId });
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

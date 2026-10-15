import { creditsMatch, exactMediaCandidates, normalizedName, searchTitle, tvSeasonNumber } from "../media-match";
import type { Media, MediaDetail, MediaType } from "../types";
import { validSeasonDate, type TvSeasonEvidence, type TvSeriesEvidence } from "../tmdb/season-match";

const object = (value: unknown): Record<string, unknown> => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
function people(value: unknown) {
  return Array.isArray(value) ? value.flatMap(person => [object(person).name, object(person).latin_name].filter((name): name is string => typeof name === "string" && !!name.trim())) : [];
}

function seasonSourceDates(raw: Record<string, unknown>): Set<string> {
  const values = [raw.release_date, ...(Array.isArray(raw.pubdate) ? raw.pubdate : [])];
  return new Set(values.flatMap(value => {
    if (typeof value !== "string") return [];
    const date = value.trim().match(/^\d{4}-\d{2}-\d{2}(?=$|[\s(（T])/)?.[0];
    return date && validSeasonDate(date) ? [date] : [];
  }));
}
const episodeCount = (value: unknown) => typeof value === "number" && Number.isSafeInteger(value) && value > 0 ? value : undefined;

/** Resolve same-title remakes from real credits; never choose the first popular search result. */
export function createDoubanMatcher(dependencies: {
  search: (title: string, year: string, media: MediaType) => Promise<Media[]>;
  subject: (media: MediaType, id: string) => Promise<{ data: unknown }>;
  detail: (media: MediaType, id: string) => Promise<{ detail: MediaDetail }>;
  seasonCandidates?: (title: string) => Promise<Media[]>;
  seasonEvidence?: (id: number, seasonNumber: number) => Promise<TvSeasonEvidence | null>;
  seriesEvidence?: (id: number) => Promise<TvSeriesEvidence | null>;
  now?: () => number;
}) {
  const cache = new Map<string, { match: Media | null; at: number }>(), inflight = new Map<string, Promise<Media | null>>();
  const now = dependencies.now ?? Date.now;
  async function resolveSeason(item: Media, seasonNumber: number): Promise<Media | null> {
    if (!item.doubanId || !dependencies.seasonCandidates || !dependencies.seasonEvidence) return null;
    const raw = object((await dependencies.subject("tv", item.doubanId)).data);
    if (raw.year !== undefined && String(raw.year) !== item.year) return null;
    if (typeof raw.title === "string" && tvSeasonNumber(raw.title) !== null && tvSeasonNumber(raw.title) !== seasonNumber) return null;
    const original = typeof raw.original_title === "string" ? raw.original_title.trim() : "";
    if (original && tvSeasonNumber(original) !== null && tvSeasonNumber(original) !== seasonNumber) return null;
    const evidence = { directors: people(raw.directors), actors: people(raw.actors) };
    const sourceDates = seasonSourceDates(raw);
    const sourceEpisodes = episodeCount(raw.episodes_count);
    const wantedOriginal = original ? normalizedName(searchTitle(original, "tv")) : "";
    const names = new Set([item.title, original].filter(Boolean).map(name => normalizedName(searchTitle(name, "tv"))));
    const filter = (items: Media[]) => items.filter(candidate => candidate.mediaType === "tv" && typeof candidate.id === "number" && Number.isSafeInteger(candidate.id) && candidate.id > 0
      && /^\d{4}$/.test(candidate.year) && Number(candidate.year) <= Number(item.year)
      && [candidate.title, candidate.originalTitle].some(name => names.has(normalizedName(name))));
    let candidates = filter(await dependencies.seasonCandidates(item.title));
    if (!candidates.length && original && normalizedName(searchTitle(original, "tv")) !== normalizedName(searchTitle(item.title, "tv"))) {
      candidates = filter(await dependencies.seasonCandidates(original));
    }
    candidates = [...new Map(candidates.map(candidate => [candidate.id, candidate])).values()];
    if (!candidates.length || candidates.length > 4) return null;
    const verified: Media[] = [];
    for (const candidate of candidates) {
      const season = await dependencies.seasonEvidence(Number(candidate.id), seasonNumber);
      if (!season || season.seriesId !== candidate.id || season.seasonNumber !== seasonNumber
        || !validSeasonDate(season.airDate) || season.airDate.slice(0, 4) !== item.year) continue;
      const returnedEpisodes = episodeCount(season.episodeCount);
      if (sourceEpisodes !== undefined && returnedEpisodes !== undefined && sourceEpisodes !== returnedEpisodes) continue;
      // Region coverage differs between providers and must not determine a work's identity.
      const metadataConfirmed = candidates.length === 1 && !!wantedOriginal && normalizedName(candidate.originalTitle) === wantedOriginal
        && (!sourceDates.size || sourceDates.has(season.airDate));
      if (!metadataConfirmed && !creditsMatch(season, evidence)) {
        // This fallback confirms series identity only. Season facts and displayed credits stay seasonal.
        const wantedActors = new Set(evidence.actors.map(normalizedName).filter(Boolean));
        if (!dependencies.seriesEvidence || wantedActors.size < 2) continue;
        const series = await dependencies.seriesEvidence(Number(candidate.id));
        if (!series || series.seriesId !== candidate.id) continue;
        const matchedIds = new Set<number>(), matchedNames = new Set<string>();
        for (const actor of series.actors) {
          if (!Number.isSafeInteger(actor.id) || actor.id < 1) continue;
          const names = actor.names.map(normalizedName).filter(name => wantedActors.has(name));
          if (!names.length) continue;
          matchedIds.add(actor.id);
          for (const name of names) matchedNames.add(name);
        }
        if (matchedIds.size < 2 || matchedNames.size < 2) continue;
      }
      verified.push({ ...candidate, seasonNumber: season.seasonNumber, year: item.year, releaseDate: season.airDate, posterPath: season.posterPath, posterFallbacks: undefined, backdropPath: null,
        overview: season.overview, imdbId: season.imdbId });
    }
    return verified.length === 1 ? verified[0] : null;
  }
  async function resolve(item: Media): Promise<Media | null> {
    if (!/^\d{4}$/.test(item.year)) return null;
    const seasonNumber = item.mediaType === "tv" ? tvSeasonNumber(item.title) : null;
    if (seasonNumber !== null) return resolveSeason(item, seasonNumber);
    if (item.mediaType === "tv" && searchTitle(item.title, "tv") !== item.title.normalize("NFKC").replace(/\p{Cf}/gu, "").trim()) return null;
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

import { creditsMatch, exactMediaCandidates, normalizedName, searchTitle } from "../media-match";
import type { Media, MediaDetail, MediaType } from "../types";
import { readDoubanIdentity } from "./identity";
import { validSeasonDate, type TvSeasonEvidence, type TvSeriesEvidence, type TvWorkEvidence } from "../tmdb/season-match";

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

/** Resolve same-title remakes from real credits; never choose the first popular search result. */
export function createDoubanMatcher(dependencies: {
  search: (title: string, year: string, media: MediaType) => Promise<Media[]>;
  subject: (media: MediaType, id: string) => Promise<{ data: unknown }>;
  detail: (media: MediaType, id: string) => Promise<{ detail: MediaDetail }>;
  seasonCandidates?: (title: string) => Promise<Media[]>;
  seasonEvidence?: (id: number, seasonNumber: number) => Promise<TvSeasonEvidence | null>;
  seriesEvidence?: (id: number) => Promise<TvSeriesEvidence | null>;
  workEvidence?: (id: number) => Promise<TvWorkEvidence | null>;
  now?: () => number;
}) {
  const cache = new Map<string, { match: Media | null; at: number }>(), inflight = new Map<string, Promise<Media | null>>();
  const now = dependencies.now ?? Date.now;
  async function resolveTv(item: Media): Promise<Media | null> {
    if (!item.doubanId) return null;
    const raw = object((await dependencies.subject("tv", item.doubanId)).data);
    if (raw.year !== undefined && String(raw.year) !== item.year) return null;
    const identity = readDoubanIdentity(item, raw);
    if (identity.ambiguousSeason) return null;
    const seasonNumber = identity.seasonNumber;
    if (seasonNumber !== undefined && !dependencies.seasonEvidence) return null;
    const names = new Set(identity.names.map(normalizedName));
    const evidence = { directors: people(raw.directors), actors: people(raw.actors) };
    const sourceDates = seasonSourceDates(raw);
    const directName = (candidate: Media) => [candidate.title, candidate.originalTitle].some(name => names.has(normalizedName(name)));
    const pool = new Map<number, Media>();
    const queryNames = [item.title, typeof raw.original_title === "string" ? raw.original_title : "", ...identity.names].filter(Boolean);
    const queryMap = new Map<string, string>();
    for (const name of queryNames) { const key = normalizedName(searchTitle(name, "tv")); if (key && !queryMap.has(key)) queryMap.set(key, name); }
    const queries = [...queryMap.values()].slice(0, 3);
    for (const name of queries) {
      const found = dependencies.seasonCandidates ? await dependencies.seasonCandidates(name) : await dependencies.search(name, item.year, "tv");
      for (const candidate of found) if (candidate.mediaType === "tv" && typeof candidate.id === "number" && Number.isSafeInteger(candidate.id) && candidate.id > 0
        && /^\d{4}$/.test(candidate.year) && Number(candidate.year) <= Number(item.year)) pool.set(candidate.id, candidate);
    }
    const exact = [...pool.values()].filter(directName);
    const candidates = exact.length ? exact : [...pool.values()];
    if (!candidates.length || candidates.length > 4) return null;
    if (seasonNumber === undefined) {
      const verified: Media[] = [];
      for (const candidate of candidates) {
        if (candidate.year !== item.year) continue;
        if (directName(candidate) && candidates.length === 1) { verified.push(candidate); continue; }
        if (!dependencies.workEvidence) continue;
        const work = await dependencies.workEvidence(Number(candidate.id));
        if (!work || work.seriesId !== candidate.id || !validSeasonDate(work.firstAirDate) || work.firstAirDate.slice(0, 4) !== item.year
          || !work.names.some(name => names.has(normalizedName(name)))) continue;
        if (candidates.length === 1 || creditsMatch(work, evidence)) verified.push({ ...candidate, imdbId: work.imdbId });
      }
      return verified.length === 1 ? verified[0] : null;
    }
    const asSeason = (candidate: Media, season: TvSeasonEvidence): Media => ({ ...candidate, seasonNumber: season.seasonNumber,
      sourceSeasonNumber: seasonNumber, year: item.year, releaseDate: season.airDate, posterPath: season.posterPath, posterFallbacks: undefined, backdropPath: null,
      overview: season.overview, imdbId: season.imdbId });
    const verified: Media[] = [];
    for (const candidate of candidates) {
      const season = await dependencies.seasonEvidence!(Number(candidate.id), seasonNumber);
      if (!season || season.seriesId !== candidate.id || season.seasonNumber !== seasonNumber
        || !validSeasonDate(season.airDate) || season.airDate.slice(0, 4) !== item.year) continue;
      if (!directName(candidate) && !season.aliases?.some(alias => names.has(normalizedName(alias)))) continue;
      const metadataConfirmed = candidates.length === 1 && names.has(normalizedName(candidate.originalTitle))
        && (!sourceDates.size || sourceDates.has(season.airDate));
      if (!metadataConfirmed && !creditsMatch(season, evidence)) {
        const wantedActors = new Set(evidence.actors.map(normalizedName).filter(Boolean));
        if (!dependencies.seriesEvidence || wantedActors.size < 2) continue;
        const series = await dependencies.seriesEvidence(Number(candidate.id));
        if (!series || series.seriesId !== candidate.id) continue;
        const matchedIds = new Set<number>(), matchedNames = new Set<string>();
        for (const actor of series.actors) {
          if (!Number.isSafeInteger(actor.id) || actor.id < 1) continue;
          const matches = actor.names.map(normalizedName).filter(name => wantedActors.has(name));
          if (!matches.length) continue;
          matchedIds.add(actor.id); for (const name of matches) matchedNames.add(name);
        }
        if (matchedIds.size < 2 || matchedNames.size < 2) continue;
      }
      verified.push(asSeason(candidate, season));
    }
    if (verified.length) return verified.length === 1 ? verified[0] : null;
    // Some providers call a new standalone sequel season 2, while TMDB starts its own season 1.
    // This is a separate-record check, not a blind season-number rewrite.
    if (seasonNumber <= 1 || !dependencies.workEvidence) return null;
    const standalone: Media[] = [];
    for (const candidate of candidates) {
      if (candidate.year !== item.year) continue;
      const work = await dependencies.workEvidence(Number(candidate.id));
      if (!work || work.seriesId !== candidate.id || !validSeasonDate(work.firstAirDate) || work.firstAirDate.slice(0, 4) !== item.year
        || !work.names.some(name => names.has(normalizedName(name))) || !sourceDates.has(work.firstAirDate)
        || !creditsMatch({ ...work, directors: [] }, { ...evidence, directors: [] })) continue;
      const first = await dependencies.seasonEvidence!(Number(candidate.id), 1);
      if (!first || first.seriesId !== candidate.id || first.seasonNumber !== 1 || first.airDate !== work.firstAirDate) continue;
      standalone.push(asSeason(candidate, first));
    }
    return standalone.length === 1 ? standalone[0] : null;
  }
  async function resolve(item: Media): Promise<Media | null> {
    if (!/^\d{4}$/.test(item.year)) return null;
    if (item.mediaType === "tv") return resolveTv(item);
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
    const identityNames = readDoubanIdentity(item, raw).names;
    const nameSet = new Set(identityNames.map(normalizedName));
    const named = () => searched.filter(candidate => candidate.mediaType === item.mediaType && [candidate.title, candidate.originalTitle].some(name => nameSet.has(normalizedName(name))));
    if (!named().length) {
      const alias = identityNames.find(name => normalizedName(name) !== normalizedName(item.title) && normalizedName(name) !== normalizedName(original));
      if (alias) searched.push(...await dependencies.search(alias, item.year, item.mediaType));
    }
    const sameYear = [...new Map(named().filter(candidate => candidate.year === item.year).map(candidate => [candidate.id, candidate])).values()];
    if (sameYear.length === 1) return sameYear[0];
    const evidence = { directors: people(raw.directors), actors: people(raw.actors) };
    if (!evidence.directors.length && evidence.actors.length < 2) return null;
    // TMDB's year filter can return the correct festival-year film with a later theatrical date.
    // Preserve that candidate, but require credits even when it is the only adjacent-year result.
    if (item.mediaType === "movie") {
      const names = new Set(readDoubanIdentity(item, raw).names.map(name => normalizedName(searchTitle(name, "movie"))));
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

import { creditsMatch, exactMediaCandidates, innerSeasonNumber, normalizedName, seasonMarkerNumber, searchTitle, tvSeasonNumber } from "../media-match";
import type { Media, MediaDetail, MediaType } from "../types";
import { validSeasonDate, type TvSeasonEvidence, type TvSeriesEvidence, type TvSeriesSeason, type TvWorkEvidence } from "../tmdb/season-match";

const object = (value: unknown): Record<string, unknown> => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
function people(value: unknown) {
  return Array.isArray(value) ? value.flatMap(person => [object(person).name, object(person).latin_name].filter((name): name is string => typeof name === "string" && !!name.trim())) : [];
}

const clean = (value: unknown) => typeof value === "string" ? value.normalize("NFKC").replace(/\p{Cf}/gu, "").trim() : "";
/**
 * How many identities one match may inspect. The bound protects request cost, not correctness: a candidate whose
 * own name or official alias is one of the Douban names states its identity by itself, so it can answer from
 * inside a truncated pool. Only a candidate identified by the pool's shape rather than by its own record
 * requires the whole pool to have been inspected.
 */
const MAX_CANDIDATES = 8;
/** Alias lookups are the most expensive extra request, so their results are reused across items. */
const MAX_ALIAS_CACHE = 2000;

/** Any explicit season marker, even an unparsable or out-of-range one, blocks the bare-number fallback. */
function hasSeasonMarker(title: string): boolean {
  return /(?:第[一二三四五六七八九十零百\d]+季|(?:^|\s)(?:Season\s*\d+|S\d+)|시즌\s*\d+)\s*$/i.test(title.normalize("NFKC").replace(/\p{Cf}/gu, "").trim());
}
/** Candidate search names for a known season. Explicit season suffixes are always stripped; a bare trailing number is stripped only from the primary title and only when it equals the confirmed season. */
function seasonQueryNames(item: Media, raw: Record<string, unknown>, original: string, seasonNumber: number): Set<string> {
  const names = new Set<string>();
  const add = (value: unknown) => { const name = clean(value); if (name) names.add(normalizedName(searchTitle(name, "tv"))); };
  add(item.title);
  add(raw.title);
  add(original);
  add(item.originalTitle);
  if (Array.isArray(raw.aka)) for (const value of raw.aka) add(value);
  for (const value of [item.title, raw.title]) {
    const primary = clean(value);
    const suffix = /^(.*\D)(\d+)\s*$/.exec(primary);
    if (suffix && Number(suffix[2]) === seasonNumber && suffix[1].trim().length >= 2) names.add(normalizedName(suffix[1].trim()));
  }
  return names;
}

/** Season hints from every name a record carries: title, original title and Douban aliases. A unique hint is the season, conflicting hints are none. */
export function sourceSeasonNumber(item: Media, raw: Record<string, unknown>): number | null {
  const names = [item.title, clean(raw.title), clean(raw.original_title), item.originalTitle, ...(Array.isArray(raw.aka) ? raw.aka : [])];
  const hints = [...new Set(names.map(clean).filter(Boolean).map(tvSeasonNumber).filter((value): value is number => value !== null))];
  return hints.length === 1 ? hints[0] : null;
}

export function seasonSourceDates(raw: Record<string, unknown>): Set<string> {
  const values = [raw.release_date, ...(Array.isArray(raw.pubdate) ? raw.pubdate : [])];
  return new Set(values.flatMap(value => {
    if (typeof value !== "string") return [];
    const date = value.trim().match(/^\d{4}-\d{2}-\d{2}(?=$|[\s(（T])/)?.[0];
    return date && validSeasonDate(date) ? [date] : [];
  }));
}

/**
 * The cross-medium fallback is its own module: Douban files TV movies, specials and single-episode
 * documentaries as tv while TMDB holds them as movie, so an in-medium search can never see them.
 * It is re-exported here because callers treat the matcher as the entry point to matching.
 */
export { crossTypeFallback, resolveCrossType } from "./cross-type";
import { resolveCrossType } from "./cross-type";

/** Resolve same-title remakes from real credits; never choose the first popular search result. */
export function createDoubanMatcher(dependencies: {
  search: (title: string, year: string, media: MediaType) => Promise<Media[]>;
  subject: (media: MediaType, id: string) => Promise<{ data: unknown }>;
  detail: (media: MediaType, id: string) => Promise<{ detail: MediaDetail }>;
  seasonCandidates?: (title: string) => Promise<Media[]>;
  seasonEvidence?: (id: number, seasonNumber: number) => Promise<TvSeasonEvidence | null>;
  seriesEvidence?: (id: number) => Promise<TvSeriesEvidence | null>;
  workEvidence?: (id: number) => Promise<TvWorkEvidence | null>;
  seriesSeasons?: (id: number) => Promise<TvSeriesSeason[] | null>;
  now?: () => number;
}) {
  const cache = new Map<string, { match: Media | null; at: number }>(), inflight = new Map<string, Promise<Media | null>>();
  // Candidate names never change, so alias evidence is cached across every item that shares the candidate.
  const aliasCache = new Map<string, Promise<Set<string>>>();
  const now = dependencies.now ?? Date.now;
  /** Every official name of a candidate. Series aliases are an identity fact, not a search hint. */
  function aliasNames(candidate: Media): Promise<Set<string>> {
    if (candidate.mediaType !== "tv" || !dependencies.workEvidence) return Promise.resolve(new Set<string>());
    const key = candidate.mediaType + ":" + candidate.id, cached = aliasCache.get(key);
    if (cached) return cached;
    const request = (async () => {
      try {
        const work = await dependencies.workEvidence!(Number(candidate.id));
        if (!work || work.seriesId !== candidate.id) return new Set<string>();
        return new Set(work.names.map(normalizedName).filter(Boolean));
      } catch { return new Set<string>(); }
    })();
    aliasCache.set(key, request);
    while (aliasCache.size > MAX_ALIAS_CACHE) aliasCache.delete(aliasCache.keys().next().value!);
    return request;
  }
  /** Identity for the ordinary path: an exact name match, or a candidate whose official aliases carry the Douban name. */
  function identityHolds(candidate: Media, names: Set<string>, aliases: Set<string>, allowAlias: boolean): boolean {
    if ([candidate.title, candidate.originalTitle].some(name => names.has(normalizedName(name)))) return true;
    if (!allowAlias) return false;
    for (const name of aliases) if (names.has(name)) return true;
    return false;
  }
  /** An official alias on the season record is a Douban name: that candidate belongs to the same work. */
  function aliasConfirms(aliases: string[] | undefined, names: Set<string>): boolean {
    return !!aliases?.some(alias => names.has(normalizedName(alias)));
  }
  /** The same fact for the ordinary path, where the candidate's aliases were already normalized into a set. */
  const aliasMatches = (aliases: Set<string>, names: Set<string>) => [...aliases].some(name => names.has(name));
  /** Two independent facts, used only where the source record carries no credits to check at all. */
  const releaseDateConfirms = (releaseDate: string | null | undefined, sourceDates: Set<string>) =>
    !!releaseDate && sourceDates.has(releaseDate);
  /** The stripped original name plus the season premiere date identify the work even when the pool holds remakes. */
  function metadataConfirms(candidate: Media, wantedOriginal: string, sourceDates: Set<string>, airDate: string): boolean {
    return !!wantedOriginal && normalizedName(candidate.originalTitle) === wantedOriginal && (!sourceDates.size || sourceDates.has(airDate));
  }
  async function resolveSeason(item: Media, seasonNumber: number, prefetched?: Record<string, unknown>): Promise<Media | null> {
    if (!item.doubanId || !dependencies.seasonCandidates || !dependencies.seasonEvidence) return null;
    const raw = prefetched ?? object((await dependencies.subject("tv", item.doubanId)).data);
    if (raw.year !== undefined && String(raw.year) !== item.year) return null;
    if (typeof raw.title === "string" && tvSeasonNumber(raw.title) !== null && tvSeasonNumber(raw.title) !== seasonNumber) return null;
    const original = typeof raw.original_title === "string" ? raw.original_title.trim() : "";
    if (original && tvSeasonNumber(original) !== null && tvSeasonNumber(original) !== seasonNumber) return null;
    const evidence = { directors: people(raw.directors), actors: people(raw.actors) };
    const sourceDates = seasonSourceDates(raw);
    // searchTitle strips every season marker, so a localised suffix such as "시즌3" never breaks the name comparison.
    const wantedOriginal = original ? normalizedName(searchTitle(original, "tv")) : "";
    const names = seasonQueryNames(item, raw, original, seasonNumber);
    const plausible = (items: Media[]) => items.filter(candidate => candidate.mediaType === "tv" && typeof candidate.id === "number" && Number.isSafeInteger(candidate.id) && candidate.id > 0
      && /^\d{4}$/.test(candidate.year) && Number(candidate.year) <= Number(item.year));
    // A candidate is named when its title or original name is one of the Douban names.
    const nameHits = (items: Media[]) => items.filter(candidate => [candidate.title, candidate.originalTitle].some(name => names.has(normalizedName(name))));
    const unique = (items: Media[]) => [...new Map(items.map(candidate => [candidate.id, candidate])).values()];
    // Each query is searched only until a Douban name answers, so the pool stays small and the trace stays readable.
    const search = async (queryNames: string[]) => {
      const found: Media[] = [];
      for (const query of queryNames) {
        found.push(...plausible(await dependencies.seasonCandidates!(query)));
        if (nameHits(found).length) break;
      }
      return unique(found);
    };
    // The Douban titles are the authoritative queries. Douban aliases are official names on the TMDB side and are
    // only searched when those titles found nothing at all; searching them unconditionally would flood the pool.
    const titles = [...new Set([item.title, original].map(clean).filter(Boolean))];
    let pool = await search(titles);
    if (!pool.length) {
      const aliases = [...new Set((Array.isArray(raw.aka) ? raw.aka : []).map(clean).filter(Boolean))];
      if (aliases.length) pool = await search(aliases);
    }
    if (!pool.length) return null;
    const searched = nameHits(pool);
    /**
     * The season a candidate holds for the number the source states. A provider may number the same run differently
     * (TMDB counts every seasonal run of a long series as its own season), so when the number alone finds nothing, the
     * season record's own name and premiere date locate it. That pairing identifies the series as well, and the season
     * number that is loaded is always the provider's own.
     */
    const seasonFor = async (candidate: Media): Promise<{ season: TvSeasonEvidence; viaName: boolean } | null> => {
      // A season that cannot describe this source record is not evidence: the provider may hold a different run
      // under that number (TMDB numbers every seasonal run of a long series separately), and its year would be
      // rejected below anyway. Falling through lets the record's own names locate the right one.
      const direct = await dependencies.seasonEvidence!(Number(candidate.id), seasonNumber);
      if (direct && direct.seriesId === candidate.id && direct.seasonNumber === seasonNumber
        && validSeasonDate(direct.airDate) && direct.airDate.slice(0, 4) === item.year) return { season: direct, viaName: false };
      if (!dependencies.seriesSeasons) return null;
      const listed = await dependencies.seriesSeasons(Number(candidate.id)).catch(() => null);
      if (!listed) return null;
      for (const entry of listed) {
        if (seasonMarkerNumber(entry.name) !== seasonNumber || !validSeasonDate(entry.airDate)) continue;
        if (sourceDates.size ? !sourceDates.has(entry.airDate) : entry.airDate.slice(0, 4) !== item.year) continue;
        const season = await dependencies.seasonEvidence!(Number(candidate.id), entry.seasonNumber);
        if (season && season.seriesId === candidate.id && season.seasonNumber === entry.seasonNumber) return { season, viaName: true };
      }
      return null;
    };
    // Identity comes from names and season evidence; the unique survivor is the answer, several stay ambiguous.
    const verify = async (list: Media[]): Promise<Media[]> => {
      // A set above the bound is refused before any evidence request: deciding from a truncated set could let a wrong
      // candidate look like the only survivor.
      if (!list.length || list.length > MAX_CANDIDATES) return [];
      // Season evidence already carries the series aliases, so the identity checks cost no extra request here.
      const located = await Promise.all(list.map(seasonFor));
      const seasons = located.map(entry => entry?.season ?? null);
      // The stripped original name plus the season premiere date identify the work, but such a fact can only speak for
      // one candidate: when several share it, none of them is identified by it and credits must decide.
      const byMetadata = list.filter((candidate, index) => {
        const season = seasons[index];
        return !!season && metadataConfirms(candidate, wantedOriginal, sourceDates, season.airDate);
      });
      const identified = list.filter((candidate, index) => {
        const season = seasons[index];
        // A season located by its own name and premiere date states the identity of its series by itself.
        return !!season && (!!located[index]?.viaName || aliasConfirms(season.aliases, names) || byMetadata.includes(candidate));
      });
      // A Douban title without a season marker cannot state its own season, so the season number came from an alias or
      // a bare trailing number. There, a single candidate whose season premieres exactly on the Douban release date is
      // the work itself: the season record and the release day agree, and no second identity exists to confuse it with.
      const dateOnlyConfirms = !hasSeasonMarker(item.title) && list.length === 1 && sourceDates.size > 0;
      const verified: Media[] = [];
      for (let index = 0; index < list.length; index++) {
        const candidate = list[index], season = seasons[index];
        if (!season || season.seriesId !== candidate.id
          || !validSeasonDate(season.airDate) || season.airDate.slice(0, 4) !== item.year) continue;
        // A candidate found by name states identity itself; a pool candidate needs the season record to carry one of
        // those names, or the stripped original name plus the season premiere date.
        if (!searched.includes(candidate) && !identified.includes(candidate)) continue;
        // Identity comes from names and season evidence. A season premiere equal to the Douban release date confirms the
        // work even when the pool holds remakes, so uniqueness is decided by the evidence, not by the pool size.
        const metadataConfirmed = byMetadata.length === 1 && byMetadata[0] === candidate;
        if (!metadataConfirmed && !(dateOnlyConfirms && sourceDates.has(season.airDate)) && !creditsMatch(season, evidence)) {
          // This fallback confirms series identity only. Season facts and displayed credits stay seasonal.
          const wantedActors = new Set(evidence.actors.map(normalizedName).filter(Boolean));
          if (!dependencies.seriesEvidence || wantedActors.size < 2) continue;
          const series = await dependencies.seriesEvidence(Number(candidate.id));
          if (!series || series.seriesId !== candidate.id) continue;
          const matchedIds = new Set<number>(), matchedNames = new Set<string>();
          for (const actor of series.actors) {
            if (!Number.isSafeInteger(actor.id) || actor.id < 1) continue;
            const actorNames = actor.names.map(normalizedName).filter(name => wantedActors.has(name));
            if (!actorNames.length) continue;
            matchedIds.add(actor.id);
            for (const name of actorNames) matchedNames.add(name);
          }
          if (matchedIds.size < 2 || matchedNames.size < 2) continue;
        }
        verified.push({ ...candidate, seasonNumber: season.seasonNumber, year: item.year, releaseDate: season.airDate, posterPath: season.posterPath, posterFallbacks: undefined, backdropPath: null,
          overview: season.overview, imdbId: season.imdbId });
      }
      return verified;
    };
    // A named candidate can still be same-name noise; the whole pool is then the last identity source, where only a
    // candidate the season record itself identifies may answer.
    let outcome = searched.length ? await verify(searched) : [];
    if (!outcome.length) outcome = searched.length === pool.length ? outcome : await verify(pool);
    if (outcome.length) return outcome.length === 1 ? outcome[0] : null;
    // Some providers number a standalone sequel as a later season, while TMDB lists it as its own series with season 1.
    // Only a separate, uniquely verified series record is accepted here; season numbers are never rewritten blindly.
    if (seasonNumber < 2 || !dependencies.workEvidence) return null;
    // The standalone fallback inspects the whole pool, so an oversized pool is refused here as well.
    if (pool.length > MAX_CANDIDATES) return null;
    const standalone: Media[] = [];
    for (const candidate of pool) {
      if (candidate.year !== item.year || typeof candidate.id !== "number") continue;
      const work = await dependencies.workEvidence(candidate.id);
      if (!work || work.seriesId !== candidate.id || !validSeasonDate(work.firstAirDate) || work.firstAirDate.slice(0, 4) !== item.year
        || !work.names.some(name => names.has(normalizedName(name)))) continue;
      if (sourceDates.size && !sourceDates.has(work.firstAirDate)) continue;
      const first = await dependencies.seasonEvidence(Number(candidate.id), 1);
      if (!first || first.seriesId !== candidate.id || first.seasonNumber !== 1 || first.airDate !== work.firstAirDate) continue;
      standalone.push({ ...candidate, seasonNumber: 1, year: item.year, releaseDate: first.airDate, posterPath: first.posterPath, posterFallbacks: undefined, backdropPath: null,
        overview: first.overview, imdbId: first.imdbId });
    }
    return standalone.length === 1 ? standalone[0] : null;
  }
  async function resolve(item: Media): Promise<Media | null> {
    if (!/^\d{4}$/.test(item.year)) return null;
    if (item.mediaType === "tv") {
      // An explicit season suffix or a bare trailing number (问心2) states the season by itself.
      const seasonNumber = tvSeasonNumber(item.title);
      if (seasonNumber !== null) return resolveSeason(item, seasonNumber);
      // A season number inside the name (晚酌的流派5：夏篇) is not a statement the name makes on its own, so it only
      // authorizes an attempt; when the season path finds nothing the ordinary path below still decides.
      const innerSeason = innerSeasonNumber(item.title);
      if (innerSeason !== null) {
        const bySeason = await resolveSeason(item, innerSeason);
        if (bySeason) return bySeason;
      }
      if (searchTitle(item.title, "tv") !== clean(item.title)) return null;
    }
    const searched = [...await dependencies.search(item.title, item.year, item.mediaType)];
    let candidates = exactMediaCandidates(searched, item.title, item.year, item.mediaType);
    // A unique exact name and year is the answer; nothing else is requested for it.
    if (candidates.length === 1) return candidates[0];
    if (!item.doubanId) return null;
    const raw = object((await dependencies.subject(item.mediaType, item.doubanId)).data);
    // A sequel whose Douban title carries no season marker (只是朋友2：梦想天开, TXQ FICTION 神木隆之介) is only
    // recognisable through the aliases this record holds. The ordinary search has already failed here, so the season
    // path costs nothing on the unique name+year fast path above.
    if (item.mediaType === "tv" && !hasSeasonMarker(item.title)) {
      const seasonNumber = sourceSeasonNumber(item, raw);
      if (seasonNumber !== null) return resolveSeason(item, seasonNumber, raw);
    }
    const original = typeof raw.original_title === "string" ? raw.original_title.trim() : "";
    if (original) {
      const byOriginal = candidates.filter(candidate => normalizedName(candidate.originalTitle) === normalizedName(original));
      if (byOriginal.length) candidates = byOriginal;
      else if (normalizedName(original) !== normalizedName(searchTitle(item.title, item.mediaType))) {
        const originals = await dependencies.search(original, item.year, item.mediaType);
        searched.push(...originals);
        // The second search may confirm nothing while the first one already held the work (e.g. a translated title
        // the provider stores under its own original name). Replacing the candidates there loses a real answer.
        const exactOriginals = exactMediaCandidates(originals, original, item.year, item.mediaType);
        if (exactOriginals.length) candidates = exactOriginals;
      }
      if (candidates.length === 1) return candidates[0];
    }
    const evidence = { directors: people(raw.directors), actors: people(raw.actors) };
    const sourceDates = seasonSourceDates(raw);
    // Credits are one identity source among several. A record that carries none is a gap in the source data, not a
    // verdict: the checks below still decide, and where none of them can, the answer stays unmatched.
    const hasCredits = evidence.directors.length > 0 || evidence.actors.length >= 2;
    // The Douban record carries official names: its title, its original title and its aliases (aka). A candidate whose
    // own name is one of them states its identity. Every medium reads the same three, because a source title often
    // carries a descriptor the provider does not use ("坂本日常 真人版" against "SAKAMOTO DAYS") and the alias is then
    // the only name both sides share.
    const names = new Set([item.title, original, ...(Array.isArray(raw.aka) ? raw.aka : [])].map(clean).filter(Boolean).map(normalizedName));
    const named = (candidate: Media) => [candidate.title, candidate.originalTitle].some(name => names.has(normalizedName(name)));
    // The exact-name filter needs the year to agree, but a series' own year is its first season while the Douban
    // record states the year of the season it describes. A candidate the provider returned for our names is still a
    // candidate when the years agree on the medium's own terms; the identity checks below decide it, not the filter.
    const yearAgrees = (candidate: Media) => item.mediaType === "movie"
      ? /^\d{4}$/.test(candidate.year) && Math.abs(Number(candidate.year) - Number(item.year)) <= 1
      : candidate.year === item.year;
    let pool = candidates.length ? candidates : searched.filter(yearAgrees);
    // TMDB's year filter can return the correct festival-year film with a later theatrical date.
    // Preserve that candidate, but require credits even when it is the only adjacent-year result.
    if (item.mediaType === "movie") {
      pool = searched.filter(candidate => candidate.mediaType === "movie" && /^\d{4}$/.test(candidate.year)
        && Math.abs(Number(candidate.year) - Number(item.year)) <= 1 && named(candidate));
    }
    pool = [...new Map(pool.map(candidate => [candidate.id, candidate])).values()];
    if (pool.length > MAX_CANDIDATES) return null;
    // A work Douban files under the other medium (see resolveCrossType) is only reachable from an empty own-medium pool.
    if (!pool.length) return resolveCrossType(item, raw, [searched], dependencies);
    // Aliases cost one request per candidate, so they are only read when a name cannot answer or credits cannot decide.
    const needsAliases = !hasCredits || pool.some(candidate => !named(candidate));
    const aliasSets = needsAliases ? await Promise.all(pool.map(candidate => aliasNames(candidate))) : pool.map(() => new Set<string>());
    const verified: Media[] = [];
    for (let index = 0; index < pool.length; index++) {
      const candidate = pool[index];
      if (typeof candidate.id !== "number" || !identityHolds(candidate, names, aliasSets[index], !named(candidate))) continue;
      const { detail } = await dependencies.detail(candidate.mediaType, String(candidate.id));
      if (detail.id !== candidate.id || detail.mediaType !== candidate.mediaType) continue;
      // Credits decide whenever the record carries them. Without any, identity needs two independent facts at once:
      // an official alias equal to a Douban name and the release date itself.
      const confirmed = creditsMatch(detail, evidence)
        || !hasCredits && aliasMatches(aliasSets[index], names) && releaseDateConfirms(detail.releaseDate, sourceDates);
      if (confirmed) verified.push({ ...candidate, imdbId: detail.imdbId });
    }
    return verified.length === 1 ? verified[0] : null;
  }
  return (item: Media): Promise<Media | null> => {
    const key = item.mediaType + ":" + item.doubanId + ":" + item.title + ":" + item.year, previous = cache.get(key);
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

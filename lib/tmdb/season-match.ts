import { searchTitle } from "../media-match";
import type { Media, MediaDetail } from "../types";
import { TmdbError, type createTmdbClient } from "./client";
import { normalizeMedia, object } from "./normalize";

export interface TvSeasonEvidence extends Pick<MediaDetail, "directors" | "cast"> {
  seriesId: number;
  seasonNumber: number;
  airDate: string;
  episodeCount?: number;
  aliases?: string[];
  posterPath: string | null;
  overview: string;
  imdbId: string | null;
}
export interface TvSeriesEvidence {
  seriesId: number;
  /** Aliases belong to one person ID and can never count as multiple actors. */
  actors: { id: number; names: string[] }[];
}
export interface TvWorkEvidence extends Pick<MediaDetail, "directors" | "cast"> {
  seriesId: number;
  names: string[];
  firstAirDate: string;
  imdbId: string | null;
}
const text = (value: unknown) => typeof value === "string" ? value.trim() : "";
const list = (value: unknown): unknown[] => Array.isArray(value) ? value : [];
export function validSeasonDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

/** Uses the normal TMDB transport/cache, without broadening its path allowlist. */
export function createTmdbSeasonMatcher(client: Pick<ReturnType<typeof createTmdbClient>, "request">) {
  async function seasonCandidates(title: string): Promise<Media[]> {
    const query = searchTitle(title, "tv");
    if (!query || query.length > 200) return [];
    const response = await client.request<unknown>("/search/tv", new URLSearchParams({ query, language: "zh-CN", include_adult: "false" }));
    return list(object(response.data).results).map(raw => normalizeMedia(raw, "tv")).filter(item => typeof item.id === "number" && Number.isSafeInteger(item.id) && item.id > 0);
  }
  async function seasonEvidence(id: number, seasonNumber: number): Promise<TvSeasonEvidence | null> {
    if (!Number.isSafeInteger(id) || id < 1 || !Number.isSafeInteger(seasonNumber) || seasonNumber < 1 || seasonNumber > 99) return null;
    const seasonKey = `season/${seasonNumber}`;
    const response = await client.request<unknown>(`/tv/${id}`, new URLSearchParams({ language: "zh-CN", append_to_response: `${seasonKey},${seasonKey}/credits,external_ids,alternative_titles` }));
    const raw = object(response.data), season = object(raw[seasonKey]);
    const summary = list(raw.seasons).map(object).filter(item => item.season_number === seasonNumber);
    const airDate = text(season.air_date);
    if (raw.id !== id || summary.length !== 1 || season.season_number !== seasonNumber || !validSeasonDate(airDate)
      || summary[0].air_date !== airDate || (season.id !== undefined && season.id !== summary[0].id) || !Number.isSafeInteger(summary[0].id) || Number(summary[0].id) < 1) return null;
    // A present episode must belong to this series and season; conflicting payloads are not evidence.
    if (list(season.episodes).some(value => { const episode = object(value); return episode.show_id !== id || episode.season_number !== seasonNumber; })) return null;
    const credits = object(raw[`${seasonKey}/credits`]);
    if (credits.id !== undefined && credits.id !== summary[0].id) return null;
    const cast = list(credits.cast).flatMap(value => {
      const person = object(value);
      if (!Number.isSafeInteger(person.id) || Number(person.id) < 1) return [];
      return [...new Set([text(person.name), text(person.original_name)].filter(Boolean))].map(name => ({
        id: Number(person.id), name, character: text(person.character), profilePath: null,
      }));
    });
    const directors = list(credits.crew).map(object).filter(person => person.job === "Director").flatMap(person => [text(person.name), text(person.original_name)].filter(Boolean));
    const alternativeTitles = object(raw.alternative_titles);
    const aliases = Array.isArray(alternativeTitles.results) && (alternativeTitles.id === undefined || alternativeTitles.id === id)
      ? [...new Set(alternativeTitles.results.map(value => text(object(value).title)).filter(Boolean))] : [];
    const poster = text(season.poster_path), imdb = text(object(raw.external_ids).imdb_id);
    return { seriesId: id, seasonNumber, airDate, directors, cast, aliases,
      ...(Number.isSafeInteger(summary[0].episode_count) && Number(summary[0].episode_count) > 0 ? { episodeCount: Number(summary[0].episode_count) } : {}),
      posterPath: /^\/[a-zA-Z0-9_.-]+$/.test(poster) ? poster : null,
      overview: text(season.overview), imdbId: /^tt\d{5,12}$/.test(imdb) ? imdb : null };
  }
  async function seriesEvidence(id: number): Promise<TvSeriesEvidence | null> {
    if (!Number.isSafeInteger(id) || id < 1) return null;
    const response = await client.request<unknown>(`/tv/${id}`, new URLSearchParams({ language: "zh-CN", append_to_response: "aggregate_credits,external_ids" }));
    const raw = object(response.data), credits = object(raw.aggregate_credits);
    if (raw.id !== id || !Array.isArray(credits.cast) || (credits.id !== undefined && credits.id !== id)) {
      throw new TmdbError("TMDB 返回的剧集身份资料无效，请重试。", "TMDB_INVALID_RESPONSE", 502);
    }
    const people = new Map<number, Set<string>>();
    for (const value of credits.cast) {
      const person = object(value);
      if (!Number.isSafeInteger(person.id) || Number(person.id) < 1) continue;
      const names = [text(person.name), text(person.original_name)].filter(Boolean);
      if (!names.length) continue;
      const aliases = people.get(Number(person.id)) ?? new Set<string>();
      for (const name of names) aliases.add(name);
      people.set(Number(person.id), aliases);
    }
    return { seriesId: id, actors: [...people].map(([personId, names]) => ({ id: personId, names: [...names] })) };
  }
  async function workEvidence(id: number): Promise<TvWorkEvidence | null> {
    if (!Number.isSafeInteger(id) || id < 1) return null;
    const response = await client.request<unknown>(`/tv/${id}`, new URLSearchParams({ language: "zh-CN", append_to_response: "alternative_titles,credits,external_ids" }));
    const raw = object(response.data), credits = object(raw.credits), aliases = object(raw.alternative_titles);
    if (raw.id !== id || (credits.id !== undefined && credits.id !== id)) throw new TmdbError("TMDB 返回的剧集身份资料无效，请重试。", "TMDB_INVALID_RESPONSE", 502);
    const alternateNames = Array.isArray(aliases.results) && (aliases.id === undefined || aliases.id === id) ? aliases.results.map(value => text(object(value).title)) : [];
    const cast = list(credits.cast).flatMap(value => {
      const person = object(value);
      if (!Number.isSafeInteger(person.id) || Number(person.id) < 1) return [];
      return [...new Set([text(person.name), text(person.original_name)].filter(Boolean))].map(name => ({ id: Number(person.id), name, character: text(person.character), profilePath: null }));
    });
    const directors = list(credits.crew).map(object).filter(person => person.job === "Director").flatMap(person => [text(person.name), text(person.original_name)].filter(Boolean));
    const imdb = text(object(raw.external_ids).imdb_id);
    return { seriesId: id, names: [...new Set([text(raw.name), text(raw.original_name), ...alternateNames].filter(Boolean))],
      firstAirDate: text(raw.first_air_date), cast, directors, imdbId: /^tt\d{5,12}$/.test(imdb) ? imdb : null };
  }
  return { seasonCandidates, seasonEvidence, seriesEvidence, workEvidence };
}

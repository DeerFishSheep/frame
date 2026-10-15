import { mergeCastMembers } from "../media-cast";
import type { MediaDetail } from "../types";
import { TmdbError, type createTmdbClient } from "./client";
import { normalizeDetail, object } from "./normalize";
import { validSeasonDate } from "./season-match";

const text = (value: unknown) => typeof value === "string" ? value.trim() : "";
const list = (value: unknown): unknown[] => Array.isArray(value) ? value : [];
const imagePath = (value: unknown) => /^\/[a-zA-Z0-9_.-]+$/.test(text(value)) ? text(value) : null;
const count = (value: unknown): number | null => typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : null;
const invalid = () => new TmdbError("TMDB 返回的分季资料不一致，请重试。", "TMDB_INVALID_RESPONSE", 502);

/** Season content never falls back to first-season or whole-series content. */
export function createTmdbSeasonDetailService(client: Pick<ReturnType<typeof createTmdbClient>, "request">) {
  return async function seasonDetail(idText: string, seasonNumber: number): Promise<{ detail: MediaDetail; retrievedAt: string; stale: boolean }> {
    if (!/^[1-9]\d*$/.test(idText) || !Number.isSafeInteger(Number(idText)) || !Number.isSafeInteger(seasonNumber) || seasonNumber < 1 || seasonNumber > 99) {
      throw new TmdbError("剧集编号或季数无效。", "INVALID_MEDIA_ID", 400);
    }
    const id = Number(idText), key = `season/${seasonNumber}`;
    const response = await client.request<unknown>(`/tv/${id}`, new URLSearchParams({ language: "zh-CN", include_image_language: "zh,en,null",
      append_to_response: `${key},${key}/credits,${key}/images,external_ids,recommendations` }));
    const raw = object(response.data);
    if (raw.id !== id || !Array.isArray(raw.seasons)) throw invalid();
    const summaries = raw.seasons.map(object).filter(season => season.season_number === seasonNumber);
    if (!summaries.length) throw new TmdbError("未找到这一季的资料。", "TMDB_NOT_FOUND", 404);
    if (summaries.length !== 1) throw invalid();
    const summary = summaries[0], season = object(raw[key]);
    if (count(summary.id) === null || Number(summary.id) < 1 || season.season_number !== seasonNumber
      || (season.id !== undefined && season.id !== summary.id)) throw invalid();
    const seasonDate = text(season.air_date), summaryDate = text(summary.air_date);
    if ((seasonDate && !validSeasonDate(seasonDate)) || (summaryDate && !validSeasonDate(summaryDate))
      || (seasonDate && summaryDate && seasonDate !== summaryDate)) throw invalid();
    if (season.episodes !== undefined && !Array.isArray(season.episodes)) throw invalid();
    const episodes = list(season.episodes).map(object);
    if (episodes.some(episode => episode.show_id !== id || episode.season_number !== seasonNumber)) throw invalid();
    const credits = object(raw[`${key}/credits`]), imageData = object(raw[`${key}/images`]);
    if ((credits.id !== undefined && credits.id !== summary.id) || (imageData.id !== undefined && imageData.id !== summary.id)) throw invalid();

    const releaseDate = seasonDate || summaryDate;
    const cast = mergeCastMembers(list(credits.cast).map(object).filter(person => Number.isSafeInteger(person.id) && Number(person.id) > 0 && (text(person.name) || text(person.original_name))).map(person => ({
      id: Number(person.id), name: text(person.name) || text(person.original_name), character: text(person.character), profilePath: imagePath(person.profile_path),
    })));
    const directors = [...new Set(list(credits.crew).map(object).filter(person => person.job === "Director").map(person => text(person.name) || text(person.original_name)).filter(Boolean))];
    const images = [...new Set([...list(imageData.backdrops), ...list(imageData.stills)].map(object).map(image => imagePath(image.file_path))
      .concat(episodes.map(episode => imagePath(episode.still_path))).filter((path): path is string => path !== null))];
    const runtimes = [...new Set(episodes.map(episode => count(episode.runtime)).filter((runtime): runtime is number => runtime !== null && runtime > 0))];
    const base = normalizeDetail(raw, "tv");
    const detail: MediaDetail = {
      ...base, seasonNumber, title: `${base.title} 第${seasonNumber}季`, originalTitle: base.originalTitle ? `${base.originalTitle} Season ${seasonNumber}` : "",
      posterPath: imagePath(season.poster_path), posterFallbacks: undefined, backdropPath: images[0] || null,
      overview: text(season.overview), releaseDate, year: releaseDate.slice(0, 4), cast, directors, images,
      voteAverage: typeof season.vote_average === "number" && Number.isFinite(season.vote_average) && season.vote_average >= 0 && season.vote_average <= 10 ? season.vote_average : 0,
      voteCount: count(season.vote_count) ?? 0, popularity: 0,
      numberOfSeasons: null, numberOfEpisodes: count(summary.episode_count) ?? (Array.isArray(season.episodes) ? episodes.length : null),
      runtime: runtimes.length === 1 ? runtimes[0] : null, status: "",
    };
    return { detail, retrievedAt: response.retrievedAt, stale: response.stale };
  };
}

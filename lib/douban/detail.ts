import { DoubanError } from "./client";
import { normalizeDoubanItem } from "./normalize";
import { readDoubanIdentity } from "./identity";
import { doubanImageUrl } from "../media-artwork";
import { normalizeDetail, object } from "../tmdb/normalize";
import { validSeasonDate } from "../tmdb/season-match";
import { validSeasonNumber, type DisplayDetail, type Media, type MediaDetail, type MediaType } from "../types";

const text = (value: unknown) => typeof value === "string" ? value.trim() : "";
const list = (value: unknown): unknown[] => Array.isArray(value) ? value : [];
const strings = (value: unknown) => [...new Set(list(value).map(text).filter(Boolean))];
const count = (value: unknown) => typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : null;
const score = (value: unknown) => typeof value === "number" && Number.isFinite(value) && value > 0 && value <= 10 ? value : 0;
const image = (value: unknown) => { const path = text(value); return path ? doubanImageUrl(path) : null; };
function photo(value: unknown) {
  const raw = object(value), pic = object(raw.pic), size = object(raw.image), cover = object(raw.cover);
  return [value, raw.large, raw.normal, raw.url, raw.src, raw.cover_url, pic.large, pic.normal, size.large, size.normal, cover.url].map(image).find(Boolean) || null;
}
function releaseDate(raw: Record<string, unknown>) {
  for (const value of [raw.release_date, ...list(raw.pubdate), ...list(raw.pubdates)]) {
    const date = text(value).match(/^\d{4}-\d{2}-\d{2}(?=$|[\s(（T])/)?.[0];
    if (date && validSeasonDate(date)) return date;
  }
  return "";
}
function runtime(raw: Record<string, unknown>) {
  for (const value of [raw.runtime, raw.duration, ...list(raw.durations)]) {
    const number = typeof value === "number" ? value : Number(text(value).match(/^(\d{1,4})\s*(?:分钟)?$/)?.[1]);
    if (Number.isSafeInteger(number) && number > 0 && number <= 1440) return number;
  }
  return null;
}
function nativeDetail(raw: Record<string, unknown>, source: Media, media: MediaType): DisplayDetail {
  const countries = strings(raw.countries), rating = object(raw.rating), identity = readDoubanIdentity(source, raw);
  const localized = countries.length ? normalizeDoubanItem({ ...raw, card_subtitle: `${source.year} / ${countries.join(" ")} / ${source.genres.join(" ")}` }, media) : source;
  const cast = list(raw.actors).flatMap(value => {
    const actor = object(value), id = Number(actor.id), name = text(actor.name) || text(actor.latin_name);
    if (!Number.isSafeInteger(id) || id <= 0 || !name) return [];
    return [{ id, name, character: text(actor.character || actor.role), profilePath: photo(actor.avatar) || photo(actor.pic) || photo(actor.cover_url) }];
  });
  const images = [...new Set(list(raw.photos).map(photo).filter((path): path is string => !!path))];
  return {
    ...normalizeDetail({}, media), ...source, id: `douban:${source.doubanId}`, source: "douban", detailSource: "douban",
    originalTitle: text(raw.original_title), overview: text(raw.intro) || text(raw.description) || source.overview,
    releaseDate: releaseDate(raw), runtime: runtime(raw), numberOfSeasons: null,
    numberOfEpisodes: media === "tv" ? count(raw.episodes_count ?? raw.episode_count) : null,
    ...(media === "tv" && !identity.ambiguousSeason && validSeasonNumber(identity.seasonNumber) ? { sourceSeasonNumber: identity.seasonNumber } : {}),
    countryCodes: localized?.countryCodes || source.countryCodes, countries,
    genres: strings(raw.genres).length ? strings(raw.genres) : source.genres,
    directors: [...new Set(list(raw.directors).map(value => text(object(value).name) || text(value)).filter(Boolean))],
    cast, images, backdropPath: images[0] || null, status: "", imdbId: /^tt\d{5,12}$/.test(text(raw.imdb_id)) ? text(raw.imdb_id) : null,
    voteAverage: score(rating.value), voteCount: count(rating.count) ?? 0,
  };
}

/** A Douban subject is independently usable; matching only adds verified optional TMDB information. */
export function createDoubanDetailService(dependencies: {
  subject: (media: MediaType, id: string) => Promise<{ data: unknown; retrievedAt: string; stale: boolean }>;
  match: (item: Media) => Promise<Media | null>;
  detail: (media: string, id: string, seasonNumber?: number) => Promise<{ detail: MediaDetail; retrievedAt: string; stale: boolean }>;
}) {
  return async (media: string, id: string, options: { nativeOnly?: boolean } = {}): Promise<{ detail: DisplayDetail; retrievedAt: string; stale: boolean }> => {
    if (!(["movie", "tv"] as string[]).includes(media) || !/^[1-9]\d{0,11}$/.test(id)) throw new DoubanError("作品类型或豆瓣编号无效。", "INVALID_SUBJECT", 400);
    const response = await dependencies.subject(media as MediaType, id), raw = object(response.data);
    const source = normalizeDoubanItem(raw, media as MediaType);
    if (String(raw.id) !== id || !source || source.doubanId !== id || source.mediaType !== media) throw new DoubanError("豆瓣作品资料不一致，请重试。", "DOUBAN_INVALID_RESPONSE", 502);
    const native = nativeDetail(raw, source, media as MediaType);
    const fallback = { detail: native, retrievedAt: response.retrievedAt, stale: response.stale };
    if (options.nativeOnly) return fallback;
    try {
      const match = await dependencies.match(source);
      if (!match || typeof match.id !== "number" || !Number.isSafeInteger(match.id) || match.id < 1 || match.mediaType !== media) return fallback;
      if (match.seasonNumber !== undefined && (media !== "tv" || !validSeasonNumber(match.seasonNumber))) return fallback;
      const season = media === "tv" && validSeasonNumber(match.seasonNumber) ? match.seasonNumber : undefined;
      if (native.sourceSeasonNumber !== undefined && (season === undefined || (match.sourceSeasonNumber ?? season) !== native.sourceSeasonNumber)) return fallback;
      const enriched = await dependencies.detail(media, String(match.id), season), detail = enriched.detail;
      if (detail.id !== match.id || detail.mediaType !== media || detail.seasonNumber !== season
        || media === "tv" && native.year && detail.year && native.year !== detail.year) return fallback;
      const useSourceRating = native.voteAverage > 0 || !score(detail.voteAverage);
      return { retrievedAt: response.retrievedAt, stale: response.stale || enriched.stale, detail: {
        ...detail, doubanId: id, detailSource: "douban", title: native.title,
        originalTitle: native.originalTitle || (native.sourceSeasonNumber !== undefined && native.sourceSeasonNumber !== season ? "" : detail.originalTitle),
        ...(native.sourceSeasonNumber === undefined ? {} : { sourceSeasonNumber: native.sourceSeasonNumber }),
        source: useSourceRating ? "douban" : "tmdb", voteAverage: useSourceRating ? native.voteAverage : detail.voteAverage,
        voteCount: useSourceRating ? native.voteCount : detail.voteCount,
        overview: detail.overview || native.overview, posterPath: detail.posterPath || native.posterPath,
        posterFallbacks: [...new Set([...(detail.posterFallbacks || []), ...(native.posterFallbacks || [])])],
        backdropPath: detail.backdropPath || native.backdropPath, releaseDate: detail.releaseDate || native.releaseDate,
        year: detail.year || native.year, runtime: detail.runtime ?? native.runtime,
        genres: detail.genres.length ? detail.genres : native.genres,
        countryCodes: detail.countryCodes?.length ? detail.countryCodes : native.countryCodes,
        countries: detail.countries.length ? detail.countries : native.countries,
        directors: detail.directors.length ? detail.directors : native.directors,
        cast: detail.cast.length ? detail.cast : native.cast, images: detail.images.length ? detail.images : native.images,
        numberOfEpisodes: detail.numberOfEpisodes ?? native.numberOfEpisodes,
      } };
    } catch { return fallback; }
  };
}

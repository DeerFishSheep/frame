import { countryNames } from "../media-regions";
import { imageUrl, type Media, type MediaType } from "../types";
import { DOUBAN_OPTIONS } from "./query";

const object = (value: unknown): Record<string, unknown> => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
const text = (value: unknown) => typeof value === "string" ? value.trim() : "";
const nonnegative = (value: unknown) => typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : 0;
const genres = new Set([...DOUBAN_OPTIONS.genres.movie.map(group => group.value), ...DOUBAN_OPTIONS.recommend.tv.genre.map(option => option.value), "纪录片"]);
const countries = new Map<string, string>();
for (let a = 65; a <= 90; a++) for (let b = 65; b <= 90; b++) {
  const code = String.fromCharCode(a, b), name = countryNames([code])[0];
  if (name) countries.set(name, code);
}
for (const [name, code] of [["中国", "CN"], ["香港", "HK"], ["台湾", "TW"], ["澳门", "MO"]]) countries.set(name, code);

function fullDate(input: unknown, year: string) {
  let value = text(input).match(/^\d{4}-\d{2}-\d{2}/)?.[0] || "";
  const short = /^(\d{2})\.(\d{2})$/.exec(text(input));
  if (!value && short && year) value = `${year}-${short[1]}-${short[2]}`;
  const parsed = new Date(`${value}T00:00:00Z`);
  return value && Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value ? value : "";
}
function picture(value: unknown) { const path = text(value); return imageUrl(path) ? path : null; }

/** Wrapper IDs identify doulist entries, not subjects; always prefer the target's identity. */
export function normalizeDoubanItem(value: unknown, fallbackMedia: MediaType): Media | null {
  const wrapper = object(value), item = object(wrapper.target || wrapper.subject || wrapper);
  const type = text(item.item_type || item.type), subtype = text(item.subtype);
  if (type && !["movie", "tv", "subject"].includes(type)) return null;
  const mediaType = type === "tv" || subtype === "tv" ? "tv" : type === "movie" || subtype === "movie" ? "movie" : fallbackMedia;
  const urlId = text(item.url).match(/(?:subject|movie|tv)\/(?:subject\/)?([1-9]\d*)/)?.[1];
  const uriId = text(item.uri).match(/\/(?:movie|tv)\/([1-9]\d*)/)?.[1];
  const id = String(item.target_id || urlId || uriId || item.id || ""), title = text(item.title);
  if (!/^[1-9]\d{0,11}$/.test(id) || !title) return null;
  const subtitle = text(item.card_subtitle || item.subtitle || item.info), parts = subtitle.split("/").map(part => part.trim());
  const year = /^\d{4}$/.test(String(item.year)) ? String(item.year) : parts[0]?.match(/^\d{4}$/)?.[0] || "";
  const offset = /^\d{4}$/.test(parts[0]) ? 1 : 0;
  const regions = (parts[offset] || "").split(/\s+/).flatMap(name => countries.get(name) || []);
  const rating = object(item.rating), photos = Array.isArray(item.photos) ? item.photos : [];
  const rawGenres = Array.isArray(item.genres) ? item.genres.map(text) : (parts[offset + 1] || "").split(/\s+/).filter(name => genres.has(name));
  const rank = nonnegative(item.rank);
  const posters = [...new Set([item.cover_url, object(item.pic).large, object(item.cover).url, object(item.pic).normal].map(picture).filter((path): path is string => !!path))];
  return {
    id: `douban:${id}`, doubanId: id, mediaType, title, originalTitle: text(item.original_title), source: "douban",
    posterPath: posters[0] || null, ...(posters.length ? { posterFallbacks: posters } : {}),
    backdropPath: photos.map(picture).find(Boolean) || null,
    overview: text(item.description || item.comment), releaseDate: fullDate(item.release_date, year), year,
    countryCodes: [...new Set(regions)], genreIds: [], genres: [...new Set(rawGenres.filter(Boolean))],
    voteAverage: Math.min(10, nonnegative(rating.value)), voteCount: Math.floor(nonnegative(rating.count)), popularity: 0,
    ...(Number.isSafeInteger(rank) && rank > 0 ? { rank } : {}),
  };
}

export function enrichDoubanMedia(item: Media, match: Media | null): Media {
  if (!match) return item;
  const seasonNumber = item.mediaType === "tv" && match.mediaType === "tv" && Number.isSafeInteger(match.seasonNumber)
    && Number(match.seasonNumber) >= 1 && Number(match.seasonNumber) <= 99 ? match.seasonNumber : undefined;
  return { ...item, id: match.id, imdbId: match.imdbId,
    ...(seasonNumber !== undefined ? { seasonNumber } : {}),
    originalTitle: item.originalTitle || match.originalTitle,
    overview: match.overview || item.overview, releaseDate: item.releaseDate || match.releaseDate,
    posterPath: match.posterPath || item.posterPath, backdropPath: match.backdropPath || item.backdropPath,
    countryCodes: item.countryCodes?.length ? item.countryCodes : match.countryCodes,
    genreIds: match.genreIds, genres: item.genres.length ? item.genres : match.genres,
  };
}

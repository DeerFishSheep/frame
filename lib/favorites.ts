import { normalizeCountryCodes } from "./media-regions";
import { imageUrl, mediaKey, validSeasonNumber, type Media } from "./types";
import { tvSeasonNumber } from "./media-match";

export const FAVORITES_KEY = "frame_favorites_v2";

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);
const isId = (value: unknown): value is number =>
  typeof value === "number" && Number.isSafeInteger(value) && value > 0;
const isNonNegative = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value) && value >= 0;
const isNullableString = (value: unknown): value is string | null =>
  value === null || typeof value === "string";
const isStringArray = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every((entry) => typeof entry === "string");

/** Restore only complete media records; local storage can contain old or damaged data. */
function restoreMedia(value: unknown): Media | null {
  if (!isRecord(value)) return null;
  const imdbId = typeof value.imdbId === "string" && /^tt\d{5,12}$/.test(value.imdbId) ? value.imdbId : null;
  const doubanId = typeof value.doubanId === "string" && /^[1-9]\d{0,11}$/.test(value.doubanId) ? value.doubanId : null;
  if (!isId(value.id) && !(value.source === "imdb" && imdbId && value.id === imdbId) && !(value.source === "douban" && doubanId && value.id === `douban:${doubanId}`)) return null;
  if (value.imdbId !== undefined && value.imdbId !== null && !imdbId) return null;
  if (value.source === "imdb" && !imdbId) return null;
  if (value.doubanId !== undefined && !doubanId || value.source === "douban" && !doubanId) return null;
  if (value.mediaType !== "movie" && value.mediaType !== "tv") return null;
  if (value.seasonNumber !== undefined && (value.mediaType !== "tv" || !validSeasonNumber(value.seasonNumber))) return null;
  if (value.source !== "tmdb" && value.source !== "imdb" && value.source !== "douban" && value.source !== "demo") return null;
  if (value.detailSource !== undefined && (typeof value.detailSource !== "string" || !["tmdb", "imdb", "douban"].includes(value.detailSource))) return null;
  if (value.detailDoubanId !== undefined && (value.detailSource !== "douban" || typeof value.detailDoubanId !== "string" || !/^[1-9]\d{0,11}$/.test(value.detailDoubanId))) return null;
  if (typeof value.title !== "string" || !value.title.trim()) return null;
  if (typeof value.originalTitle !== "string" || typeof value.overview !== "string") return null;
  if (typeof value.releaseDate !== "string" || typeof value.year !== "string") return null;
  if (!isNullableString(value.posterPath) || !isNullableString(value.backdropPath)) return null;
  if (value.posterFallbacks !== undefined && (!isStringArray(value.posterFallbacks) || value.posterFallbacks.length > 4 || value.posterFallbacks.some(path => !imageUrl(path)))) return null;
  if (!Array.isArray(value.genreIds) || !value.genreIds.every(isId) || !isStringArray(value.genres)) return null;
  if (!isNonNegative(value.voteAverage) || value.voteAverage > 10) return null;
  if (!isNonNegative(value.voteCount) || !Number.isSafeInteger(value.voteCount)) return null;
  if (!isNonNegative(value.popularity)) return null;
  if (value.countryCodes !== undefined && (!isStringArray(value.countryCodes) || value.countryCodes.some(code => !/^[A-Z]{2}$/.test(code)))) return null;
  if (value.rank !== undefined && !isId(value.rank)) return null;

  // Copy an explicit field allowlist instead of persisting detail data or extra properties.
  return {
    id: value.id as number | string,
    ...(imdbId ? { imdbId } : {}),
    ...(doubanId ? { doubanId } : {}),
    mediaType: value.mediaType,
    ...(value.seasonNumber !== undefined ? { seasonNumber: value.seasonNumber as number } : {}),
    title: value.title,
    originalTitle: value.originalTitle,
    posterPath: value.posterPath,
    ...(value.posterFallbacks !== undefined ? { posterFallbacks: [...value.posterFallbacks] as string[] } : {}),
    backdropPath: value.backdropPath,
    overview: value.overview,
    releaseDate: value.releaseDate,
    year: value.year,
    genreIds: [...value.genreIds],
    genres: [...value.genres],
    ...(value.countryCodes !== undefined ? { countryCodes: normalizeCountryCodes(value.countryCodes) } : {}),
    voteAverage: value.voteAverage,
    voteCount: value.voteCount,
    popularity: value.popularity,
    source: value.source,
    ...(value.detailSource !== undefined ? { detailSource: value.detailSource as Media["detailSource"] } : {}),
    ...(value.detailDoubanId !== undefined ? { detailDoubanId: value.detailDoubanId as string } : {}),
    ...(value.rank !== undefined ? { rank: value.rank as number } : {}),
  };
}

function restoreCollection(value: unknown): Media[] {
  if (!Array.isArray(value)) return [];
  const keys = new Set<string>();
  return value.flatMap((entry) => {
    const item = restoreMedia(entry);
    if (!item) return [];
    const aliases = favoriteAliases(item), duplicate = aliases.some(key => keys.has(key));
    aliases.forEach(key => keys.add(key));
    if (duplicate) return [];
    return [item];
  });
}

export function parseFavorites(raw: string | null): Media[] {
  if (typeof raw !== "string" || !raw) return [];
  try {
    return restoreCollection(JSON.parse(raw));
  } catch {
    return [];
  }
}

export function readFavorites(storage: Pick<Storage, "getItem">): Media[] {
  try {
    return parseFavorites(storage.getItem(FAVORITES_KEY));
  } catch {
    return [];
  }
}

/** Let quota/privacy errors reach the UI so it can explain that saving failed. */
export function writeFavorites(storage: Pick<Storage, "setItem">, items: Media[]): void {
  storage.setItem(FAVORITES_KEY, JSON.stringify(restoreCollection(items)));
}

export function toggleFavorite(items: Media[], item: Media): Media[] {
  return items.some((saved) => sameFavorite(saved, item))
    ? items.filter((saved) => !sameFavorite(saved, item))
    : [...items, item];
}

function favoriteAliases(item: Media) {
  // Older Douban favorites already represent a specific season, even before this field existed.
  const seasonNumber = item.seasonNumber ?? (item.mediaType === "tv" && item.doubanId ? tvSeasonNumber(item.title) ?? undefined : undefined);
  const identity = { ...item, seasonNumber };
  return typeof item.id === "number" ? [mediaKey(identity), mediaKey({ ...identity, doubanId: undefined })] : [mediaKey(identity)];
}

/** Provider rows keep their own keys; a reliably matched work shares its saved state across sources. */
export function sameFavorite(first: Media, second: Media) {
  const keys = favoriteAliases(first);
  return favoriteAliases(second).some(key => keys.includes(key));
}

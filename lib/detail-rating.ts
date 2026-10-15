import { validSeasonNumber, type Media } from "./types";

export type RatingSource = "tmdb" | "imdb" | "douban";
export interface RatingContext { source: RatingSource; doubanId?: string; seasonNumber?: number }
export interface DetailRating {
  source: RatingSource; voteAverage: number; voteCount: number;
  retrievedAt: string | null; stale: boolean; fallback?: "missing" | "unavailable";
}
export function parseRatingContext(params: URLSearchParams): RatingContext {
  if ([...params.keys()].some(key => !["source", "doubanId", "season"].includes(key) || params.getAll(key).length !== 1)) throw new Error("评分来源参数无效。");
  const source = params.get("source") || "tmdb", doubanId = params.get("doubanId") || undefined;
  if (!["tmdb", "imdb", "douban"].includes(source) || doubanId && (source !== "douban" || !/^[1-9]\d{0,11}$/.test(doubanId))) throw new Error("评分来源参数无效。");
  const season = params.get("season");
  if (season !== null && (!/^[1-9]\d?$/.test(season) || !validSeasonNumber(Number(season)))) throw new Error("季数参数无效。");
  return { source: source as RatingSource, ...(doubanId ? { doubanId } : {}), ...(season !== null ? { seasonNumber: Number(season) } : {}) };
}
export function validRating(score: unknown, count: unknown): boolean {
  return typeof score === "number" && Number.isFinite(score) && score > 0 && score <= 10 && Number.isSafeInteger(count) && Number(count) > 0;
}
/** Saving a detail retains the rating's real provider, without changing its TMDB identity. */
export function detailFavorite<T extends Media>(item: T, rating: DetailRating, context: RatingContext): T {
  if (item.source === "demo") return item;
  return { ...item, source: rating.source, detailSource: context.source, voteAverage: rating.voteAverage, voteCount: rating.voteCount,
    ...(context.source === "douban" && context.doubanId ? { detailDoubanId: context.doubanId } : {}),
    ...(rating.source === "douban" && context.doubanId ? { doubanId: context.doubanId } : {}) };
}
export function tmdbRating(item: Pick<Media, "voteAverage" | "voteCount">, retrievedAt: string | null = null, stale = false): DetailRating {
  return { source: "tmdb", voteAverage: item.voteAverage, voteCount: item.voteCount, retrievedAt, stale };
}

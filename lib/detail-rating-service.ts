import type { Media, MediaDetail, MediaType } from "./types";
import { normalizeDoubanItem } from "./douban/normalize";
import { tmdbRating, validRating, type DetailRating, type RatingContext } from "./detail-rating";

export function createDetailRatingService(dependencies: {
  detail: (media: string, id: string) => Promise<{ detail: MediaDetail; retrievedAt: string; stale: boolean }>;
  imdb: (id: string) => Promise<{ rating: number; votes: number; retrievedAt: string; stale: boolean }>;
  subject: (media: MediaType, id: string) => Promise<{ data: unknown; retrievedAt: string; stale: boolean }>;
  match: (item: Media) => Promise<Media | null>;
}) {
  return async (media: string, id: string, context: RatingContext): Promise<DetailRating> => {
    const base = await dependencies.detail(media, id), item = base.detail;
    const fallback = tmdbRating(item, base.retrievedAt, base.stale);
    if (context.source === "tmdb") return fallback;
    try {
      if (context.source === "imdb" && item.imdbId) {
        const result = await dependencies.imdb(item.imdbId);
        if (validRating(result.rating, result.votes)) return { source: "imdb", voteAverage: result.rating, voteCount: result.votes, retrievedAt: result.retrievedAt, stale: result.stale };
      }
      if (context.source === "douban" && context.doubanId) {
        const result = await dependencies.subject(item.mediaType, context.doubanId);
        const raw = result.data && typeof result.data === "object" ? result.data as Record<string, unknown> : {};
        const score = raw.rating && typeof raw.rating === "object" ? raw.rating as Record<string, unknown> : {};
        if (score.value != null && score.value !== 0 && !validRating(score.value, score.count)) throw new Error("Invalid source rating");
        const source = normalizeDoubanItem(result.data, item.mediaType);
        if (source?.doubanId === context.doubanId && source.mediaType === item.mediaType && validRating(source.voteAverage, source.voteCount)) {
          // A source ID in a URL is context, not proof that two titles are the same film.
          const matched = await dependencies.match(source);
          if (matched?.id === item.id && matched.mediaType === item.mediaType) return { source: "douban", voteAverage: source.voteAverage, voteCount: source.voteCount, retrievedAt: result.retrievedAt, stale: result.stale };
        }
      }
      return { ...fallback, fallback: "missing" };
    } catch { return { ...fallback, fallback: "unavailable" }; }
  };
}

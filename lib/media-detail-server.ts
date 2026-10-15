import "server-only";
import { tmdb, tmdbClient } from "./tmdb/server";
import { TmdbError } from "./tmdb/client";
import { createTmdbSeasonDetailService } from "./tmdb/season-detail";
import { doubanClient, matchDoubanMedia } from "./douban/server";
import { createMediaDetailService } from "./media-detail";
import { doubanDetail } from "./douban/detail-server";

const seasonDetail = createTmdbSeasonDetailService(tmdbClient);
export async function detailWithSeason(media: string, id: string, seasonNumber?: number) {
  if (seasonNumber === undefined) return tmdb.detail(media, id);
  if (media !== "tv") throw new TmdbError("只有电视剧支持季数。", "INVALID_SEASON", 400);
  return seasonDetail(id, seasonNumber);
}
export const mediaDetail = createMediaDetailService({ detail: detailWithSeason, subject: doubanClient.subject, match: matchDoubanMedia,
  fallback: (media, id) => doubanDetail(media, id, { nativeOnly: true }),
});

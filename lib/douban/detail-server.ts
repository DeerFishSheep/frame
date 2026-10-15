import "server-only";
import { doubanClient, matchDoubanMedia } from "./server";
import { tmdb, tmdbClient } from "../tmdb/server";
import { createTmdbSeasonDetailService } from "../tmdb/season-detail";
import { createDoubanDetailService } from "./detail";

const seasonDetail = createTmdbSeasonDetailService(tmdbClient);
export const doubanDetail = createDoubanDetailService({
  subject: doubanClient.subject,
  match: matchDoubanMedia,
  detail: (media, id, seasonNumber) => seasonNumber === undefined ? tmdb.detail(media, id) : seasonDetail(id, seasonNumber),
});

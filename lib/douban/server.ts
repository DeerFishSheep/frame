import "server-only";
import { createDoubanClient } from "./client";
import { createDoubanService } from "./service";
import { tmdb, tmdbClient } from "../tmdb/server";
import { createDoubanMatcher } from "./matcher";
import { createCollectionService } from "./collections";
import { createTmdbSeasonMatcher } from "../tmdb/season-match";

export const doubanClient = createDoubanClient();
export const matchDoubanMedia = createDoubanMatcher({ search: tmdb.searchCandidates, subject: doubanClient.subject, detail: tmdb.detail, ...createTmdbSeasonMatcher(tmdbClient) });
export const douban = createDoubanService(doubanClient, matchDoubanMedia);
export const doubanCollections = createCollectionService(doubanClient);

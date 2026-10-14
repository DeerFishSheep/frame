import "server-only";
import { createDoubanClient } from "./client";
import { createDoubanService } from "./service";
import { tmdb } from "../tmdb/server";
import { createDoubanMatcher } from "./matcher";
import { createCollectionService } from "./collections";

export const doubanClient = createDoubanClient();
export const matchDoubanMedia = createDoubanMatcher({ search: tmdb.searchCandidates, subject: doubanClient.subject, detail: tmdb.detail });
export const douban = createDoubanService(doubanClient, matchDoubanMedia);
export const doubanCollections = createCollectionService(doubanClient);

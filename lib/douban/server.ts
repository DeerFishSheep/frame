import "server-only";
import { createDoubanClient } from "./client";
import { createDoubanService } from "./service";
import { tmdb } from "../tmdb/server";

export const douban = createDoubanService(createDoubanClient(), (title, year, media) => tmdb.findByTitle(title, year, media));

import "server-only";
import { createTmdbClient } from "./client";
import { createTmdbService } from "./service";

const configuredCache = Number(process.env.TMDB_CACHE_SECONDS ?? "1800");
export const tmdb = createTmdbService(createTmdbClient({
  token: process.env.TMDB_API_READ_ACCESS_TOKEN ?? "",
  cacheSeconds: Number.isFinite(configuredCache) && configuredCache > 0 ? configuredCache : 1800,
}));

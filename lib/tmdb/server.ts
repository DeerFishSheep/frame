import "server-only";
import { createTmdbClient } from "./client";
import { createTmdbService } from "./service";

const configuredCache = Number(process.env.TMDB_CACHE_SECONDS ?? "1800");
export const tmdbClient = createTmdbClient({
  token: process.env.TMDB_API_READ_ACCESS_TOKEN ?? "",
  apiKey: process.env.TMDB_API_KEY ?? "",
  cacheSeconds: Number.isFinite(configuredCache) && configuredCache > 0 ? configuredCache : 1800,
});
export const tmdb = createTmdbService(tmdbClient);

import "server-only";
import { createImdbClient } from "./client";
import { createImdbService } from "./service";
import { tmdb } from "../tmdb/server";

// Rankings and detail ratings share the same authoritative source cache.
export const imdbClient = createImdbClient();
export const imdb = createImdbService(imdbClient, (id, media) => tmdb.findByImdbId(id, media));

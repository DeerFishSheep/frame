import "server-only";
import { createImdbClient } from "./client";
import { createImdbService } from "./service";
import { tmdb } from "../tmdb/server";

export const imdb = createImdbService(createImdbClient(), (id, media) => tmdb.findByImdbId(id, media));

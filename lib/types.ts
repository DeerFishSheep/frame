export type MediaType = "movie" | "tv";
export type Chart = "trending" | "popular" | "top" | "now" | "upcoming" | "discover" | "favorites";
export type DataSource = "tmdb" | "imdb" | "demo";

export interface Media {
  /** TMDB numeric ID when matched; otherwise the original IMDB tt ID. */
  id: number | string;
  imdbId?: string | null;
  mediaType: MediaType;
  title: string;
  originalTitle: string;
  posterPath: string | null;
  backdropPath: string | null;
  overview: string;
  releaseDate: string;
  year: string;
  genreIds: number[];
  genres: string[];
  /** ISO region codes; undefined means not supplied, [] means known to be missing. */
  countryCodes?: string[];
  voteAverage: number;
  voteCount: number;
  popularity: number;
  source: DataSource;
  rank?: number;
}

export interface MediaDetail extends Media {
  id: number;
  runtime: number | null;
  numberOfSeasons: number | null;
  status: string;
  countries: string[];
  directors: string[];
  cast: { id: number; name: string; character: string; profilePath: string | null }[];
  keywords: { id: number; name: string }[];
  images: string[];
  recommendations: MediaPage;
  imdbId: string | null;
}

export interface MediaPage {
  results: Media[];
  page: number;
  totalPages: number;
  totalResults: number;
}

export interface CatalogResponse extends MediaPage {
  retrievedAt: string | null;
  source: DataSource;
  stale: boolean;
  notice?: string;
}

export interface CatalogFilters {
  chart: Chart;
  media: MediaType | "all";
  period: "day" | "week";
  query: string;
  genres: string[];
  genreLogic: "or" | "and";
  dateFrom: string;
  /** Empty outside Discover; "today" follows the current Beijing calendar date. */
  dateTo: string;
  scoreMin: string;
  scoreMax: string;
  votesMin: string;
  region: string;
  language: string;
  keywords: string;
  runtimeMin: string;
  runtimeMax: string;
  sort: string;
  page: number;
}

export const DEFAULT_FILTERS: CatalogFilters = {
  chart: "trending", media: "movie", period: "day", query: "", genres: [],
  genreLogic: "or", dateFrom: "", dateTo: "", scoreMin: "", scoreMax: "",
  votesMin: "", region: "", language: "", keywords: "", runtimeMin: "", runtimeMax: "",
  sort: "popularity.desc", page: 1,
};

export const mediaKey = (item: Pick<Media, "mediaType" | "id">) => typeof item.id === "string" ? `imdb:${item.id}` : `${item.mediaType}:${item.id}`;
export const mediaHref = (item: Pick<Media, "mediaType" | "id">) => typeof item.id === "string"
  ? /^tt\d{5,12}$/.test(item.id) ? `https://www.imdb.com/title/${item.id}/` : "/"
  : `/${item.mediaType}/${item.id}`;
export function imageUrl(path: string | null, size = "w500") {
  if (path) {
    try {
      const url = new URL(path);
      if (url.protocol === "https:" && url.hostname === "m.media-amazon.com" && !url.username && !url.password && !url.port && url.pathname.startsWith("/images/M/")) return url.href;
    } catch { /* Relative TMDB image paths use the fixed image origin below. */ }
  }
  return path && /^\/[a-zA-Z0-9_.-]+$/.test(path) ? `https://image.tmdb.org/t/p/${size}${path}` : null;
}

export type MediaType = "movie" | "tv";
export type Chart = "trending" | "popular" | "top" | "now" | "upcoming" | "discover" | "favorites";
export type DataSource = "tmdb" | "demo";

export interface Media {
  id: number;
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
  voteAverage: number;
  voteCount: number;
  popularity: number;
  source: DataSource;
  rank?: number;
}

export interface MediaDetail extends Media {
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
  yearFrom: string;
  yearTo: string;
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
  genreLogic: "or", yearFrom: "", yearTo: "", scoreMin: "", scoreMax: "",
  votesMin: "", region: "", language: "", keywords: "", runtimeMin: "", runtimeMax: "",
  sort: "popularity.desc", page: 1,
};

export const mediaKey = (item: Pick<Media, "mediaType" | "id">) => `${item.mediaType}:${item.id}`;
export function imageUrl(path: string | null, size = "w500") {
  return path && /^\/[a-zA-Z0-9_.-]+$/.test(path) ? `https://image.tmdb.org/t/p/${size}${path}` : null;
}

export type MediaType = "movie" | "tv";
export type Chart = "trending" | "popular" | "top" | "now" | "upcoming" | "discover" | "favorites";
export type DataSource = "tmdb" | "imdb" | "douban" | "demo";

export interface Media {
  /** TMDB numeric ID when matched; otherwise an IMDB tt ID or douban:<subject ID>. */
  id: number | string;
  imdbId?: string | null;
  doubanId?: string;
  /** Verified season identity within a TMDB television series. */
  seasonNumber?: number;
  mediaType: MediaType;
  title: string;
  originalTitle: string;
  posterPath: string | null;
  posterFallbacks?: string[];
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
  /** Entry provider survives a temporary rating fallback; source still labels the displayed score. */
  detailSource?: Exclude<DataSource, "demo">;
  /** Navigation context only; never an identity alias until verified. */
  detailDoubanId?: string;
  rank?: number;
}

export interface MediaDetail extends Media {
  id: number;
  runtime: number | null;
  numberOfSeasons: number | null;
  numberOfEpisodes?: number | null;
  status: string;
  countries: string[];
  directors: string[];
  cast: { id: number; name: string; character: string; profilePath: string | null }[];
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
  /** Some provider feeds paginate without publishing a total. */
  totalResultsExact?: boolean;
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
  runtimeMin: string;
  runtimeMax: string;
  sort: string;
  page: number;
}

export const DEFAULT_FILTERS: CatalogFilters = {
  chart: "trending", media: "movie", period: "day", query: "", genres: [],
  genreLogic: "and", dateFrom: "", dateTo: "", scoreMin: "", scoreMax: "",
  votesMin: "", region: "", language: "", runtimeMin: "", runtimeMax: "",
  sort: "popularity.desc", page: 1,
};

export const validSeasonNumber = (value: unknown): value is number => typeof value === "number" && Number.isSafeInteger(value) && value >= 1 && value <= 99;
export const mediaKey = (item: Pick<Media, "mediaType" | "id" | "doubanId" | "seasonNumber">) => {
  const identity = item.doubanId ? `douban:${item.doubanId}` : typeof item.id === "string" ? `imdb:${item.id}` : `${item.mediaType}:${item.id}`;
  return item.mediaType === "tv" && validSeasonNumber(item.seasonNumber) ? `${identity}:season:${item.seasonNumber}` : identity;
};
export function mediaHref(item: Pick<Media, "mediaType" | "id"> & Partial<Pick<Media, "source" | "detailSource" | "detailDoubanId" | "doubanId" | "seasonNumber">>) {
  if (typeof item.id === "string") return /^tt\d{5,12}$/.test(item.id) ? `https://www.imdb.com/title/${item.id}/` : /^douban:[1-9]\d{0,11}$/.test(item.id) ? `https://movie.douban.com/subject/${item.id.slice(7)}/` : "/";
  const path = `/${item.mediaType}/${item.id}`, source = item.detailSource ?? item.source;
  const doubanId = item.detailDoubanId ?? item.doubanId;
  const params = new URLSearchParams();
  if (source === "imdb" || source === "douban") params.set("source", source);
  if (source === "douban" && doubanId && /^[1-9]\d{0,11}$/.test(doubanId)) params.set("doubanId", doubanId);
  if (item.mediaType === "tv" && validSeasonNumber(item.seasonNumber)) params.set("season", String(item.seasonNumber));
  return params.size ? `${path}?${params}` : path;
}
export function imageUrl(path: string | null, size = "w500") {
  if (path) {
    try {
      const url = new URL(path);
      if (url.protocol === "https:" && url.hostname === "m.media-amazon.com" && !url.username && !url.password && !url.port && url.pathname.startsWith("/images/M/")) return url.href;
      if (url.protocol === "https:" && /^(?:img\d+|qnmob\d+-sign)\.doubanio\.com$/.test(url.hostname) && !url.username && !url.password && !url.port && url.pathname.startsWith("/view/photo/")) return url.href;
    } catch { /* Relative TMDB image paths use the fixed image origin below. */ }
  }
  return path && /^\/[a-zA-Z0-9_.-]+$/.test(path) ? `https://image.tmdb.org/t/p/${size}${path}` : null;
}

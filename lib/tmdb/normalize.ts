import type { Media, MediaDetail, MediaPage, MediaType } from "../types";

type Raw = Record<string, unknown>;
const movieGenres: Record<number, string> = {
  28: "动作", 12: "冒险", 16: "动画", 35: "喜剧", 80: "犯罪", 99: "纪录", 18: "剧情", 10751: "家庭",
  14: "奇幻", 36: "历史", 27: "恐怖", 10402: "音乐", 9648: "悬疑", 10749: "爱情", 878: "科幻",
  10770: "电视电影", 53: "惊悚", 10752: "战争", 37: "西部",
};
const tvGenres: Record<number, string> = {
  10759: "动作冒险", 16: "动画", 35: "喜剧", 80: "犯罪", 99: "纪录", 18: "剧情", 10751: "家庭",
  10762: "儿童", 9648: "悬疑", 10763: "新闻", 10764: "真人秀", 10765: "科幻奇幻",
  10766: "肥皂剧", 10767: "脱口秀", 10768: "战争政治", 37: "西部",
};

export function object(value: unknown): Raw {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Raw : {};
}
function list(value: unknown): unknown[] { return Array.isArray(value) ? value : []; }
function text(value: unknown) { return typeof value === "string" ? value.trim() : ""; }
function finite(value: unknown) { return typeof value === "number" && Number.isFinite(value) ? value : 0; }
function path(value: unknown) {
  const val = text(value);
  return /^\/[a-zA-Z0-9_.-]+$/.test(val) ? val : null;
}
function date(value: unknown) {
  const val = text(value);
  return /^\d{4}-\d{2}-\d{2}$/.test(val) ? val : "";
}

export function normalizeMedia(value: unknown, mediaType: MediaType, rank?: number): Media {
  const raw = object(value);
  const detailGenres = list(raw.genres).map(object);
  const genreIds = (detailGenres.length ? detailGenres.map((genre) => genre.id) : list(raw.genre_ids))
    .filter((id): id is number => typeof id === "number" && Number.isSafeInteger(id) && id > 0);
  const names = new Map(detailGenres.map((genre) => [finite(genre.id), text(genre.name)]));
  const dictionary = mediaType === "movie" ? movieGenres : tvGenres;
  const originalTitle = text(mediaType === "movie" ? raw.original_title : raw.original_name);
  const releaseDate = date(mediaType === "movie" ? raw.release_date : raw.first_air_date);
  return {
    id: finite(raw.id), mediaType,
    title: text(mediaType === "movie" ? raw.title : raw.name) || originalTitle || "未命名作品",
    originalTitle, posterPath: path(raw.poster_path), backdropPath: path(raw.backdrop_path),
    overview: text(raw.overview), releaseDate, year: releaseDate.slice(0, 4), genreIds,
    genres: genreIds.map((id) => names.get(id) || dictionary[id]).filter((name): name is string => Boolean(name)),
    voteAverage: Math.min(10, Math.max(0, finite(raw.vote_average))), voteCount: Math.max(0, finite(raw.vote_count)),
    popularity: Math.max(0, finite(raw.popularity)), source: "tmdb",
    ...(rank === undefined ? {} : { rank }),
  };
}

export function normalizeDetail(value: unknown, mediaType: MediaType): MediaDetail {
  const raw = object(value);
  const credits = object(raw.credits);
  const crew = list(credits.crew).map(object);
  const creators = list(raw.created_by).map(object);
  const keywordData = object(raw.keywords);
  const imageData = object(raw.images);
  const runtime = mediaType === "movie" ? finite(raw.runtime) : list(raw.episode_run_time).map(finite).find((time) => time > 0);
  const directors = mediaType === "movie"
    ? crew.filter((person) => person.job === "Director").map((person) => text(person.name))
    : creators.map((person) => text(person.name));
  return {
    ...normalizeMedia(raw, mediaType), runtime: runtime && runtime > 0 ? runtime : null,
    numberOfSeasons: mediaType === "tv" && finite(raw.number_of_seasons) > 0 ? finite(raw.number_of_seasons) : null,
    status: text(raw.status), countries: list(raw.production_countries).map(object).map((country) => text(country.name) || text(country.iso_3166_1)).filter(Boolean),
    directors: [...new Set(directors.filter(Boolean))],
    cast: list(credits.cast).map(object).filter((person) => finite(person.id) > 0).slice(0, 18).map((person) => ({
      id: finite(person.id), name: text(person.name), character: text(person.character), profilePath: path(person.profile_path),
    })),
    keywords: list(keywordData.keywords ?? keywordData.results).map(object).filter((keyword) => finite(keyword.id) > 0).map((keyword) => ({ id: finite(keyword.id), name: text(keyword.name) })),
    images: list(imageData.backdrops).map(object).map((item) => path(item.file_path)).filter((item): item is string => item !== null).slice(0, 12),
    recommendations: Array.isArray(object(raw.recommendations).results)
      ? normalizeRecommendations(raw.recommendations, mediaType)
      : { results: [], page: 0, totalPages: 1, totalResults: 0 },
    imdbId: /^tt\d+$/.test(text(object(raw.external_ids).imdb_id ?? raw.imdb_id)) ? text(object(raw.external_ids).imdb_id ?? raw.imdb_id) : null,
  };
}

export function normalizeRecommendations(value: unknown, mediaType: MediaType): MediaPage {
  const raw = object(value);
  const results = list(raw.results).map(object)
    .filter(item => Number.isSafeInteger(item.id) && Number(item.id) > 0)
    .map(item => normalizeMedia(item, mediaType));
  const count = (value: unknown, fallback: number) => Number.isSafeInteger(value) && Number(value) >= 0 ? Number(value) : fallback;
  return {
    results, page: Math.max(1, count(raw.page, 1)),
    totalPages: Math.min(500, count(raw.total_pages, results.length ? 1 : 0)),
    totalResults: count(raw.total_results, results.length),
  };
}

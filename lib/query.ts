import { DEFAULT_FILTERS, type CatalogFilters, type MediaType } from "./types";
import { getTodayDate, getTomorrowDate, isCalendarDate, resolveDateTo } from "./date-filters";

export class QueryError extends Error {
  readonly status = 400;
  constructor(message: string, readonly code = "INVALID_QUERY") {
    super(message);
    this.name = "QueryError";
  }
}

const charts = new Set(["trending", "popular", "top", "now", "upcoming", "discover", "favorites"]);
const sorts = new Set([
  "popularity.asc", "popularity.desc", "vote_average.asc", "vote_average.desc",
  "vote_count.asc", "vote_count.desc", "release_date.asc", "release_date.desc",
  "primary_release_date.asc", "primary_release_date.desc", "first_air_date.asc", "first_air_date.desc",
  "title.asc", "title.desc", "name.asc", "name.desc", "original_title.asc", "original_title.desc",
  "original_name.asc", "original_name.desc", "revenue.asc", "revenue.desc",
]);

function value(params: URLSearchParams, key: string, fallback = "") {
  if (params.getAll(key).length > 1) throw new QueryError(`参数 ${key} 不能重复。`);
  return params.get(key)?.trim() ?? fallback;
}

function numberText(text: string, key: string, min: number, max: number, integer = true) {
  if (!text) return "";
  if (!(integer ? /^\d+$/.test(text) : /^(?:\d+(?:\.\d+)?|\.\d+)$/.test(text))) {
    throw new QueryError(`${key} 必须是${integer ? "整数" : "数字"}。`);
  }
  const number = Number(text);
  if (!Number.isFinite(number) || number < min || number > max) throw new QueryError(`${key} 超出允许范围。`);
  return String(number);
}

function range(min: string, max: string, name: string) {
  if (min && max && Number(min) > Number(max)) throw new QueryError(`${name}的下限不能大于上限。`);
}

/** Parse only known filters; unrelated URL state such as view/theme may coexist. */
export function parseFilters(params: URLSearchParams, now = new Date()): CatalogFilters {
  const chart = value(params, "chart", DEFAULT_FILTERS.chart);
  const media = value(params, "media", DEFAULT_FILTERS.media);
  const period = value(params, "period", DEFAULT_FILTERS.period);
  const genreLogic = value(params, "genreLogic", DEFAULT_FILTERS.genreLogic);
  const sort = value(params, "sort", DEFAULT_FILTERS.sort);
  if (!charts.has(chart)) throw new QueryError("榜单类型无效。");
  if (!["movie", "tv", "all"].includes(media)) throw new QueryError("作品类型无效。");
  if (!["day", "week"].includes(period)) throw new QueryError("趋势周期无效。");
  if (!["or", "and"].includes(genreLogic)) throw new QueryError("类型组合必须使用 or 或 and。");
  if (!sorts.has(sort)) throw new QueryError("排序方式无效。");
  const query = value(params, "query");
  const pageText = value(params, "page", "1");
  if (!pageText) throw new QueryError("页码不能为空。");
  if (query.length > 200) throw new QueryError("搜索内容不能超过 200 个字符。");
  const genreText = value(params, "genres");
  if (genreText && !/^\d+(?:,\d+)*$/.test(genreText)) throw new QueryError("类型应使用逗号分隔的数字 ID。");
  const genres = [...new Set(genreText ? genreText.split(",") : [])];
  if (genres.length > 20 || genres.some((id) => Number(id) < 1 || Number(id) > 1_000_000)) throw new QueryError("类型参数无效。");
  const region = value(params, "region").toUpperCase();
  const language = value(params, "language").toLowerCase();
  if (region && !/^[A-Z]{2}$/.test(region)) throw new QueryError("制片地区应使用两位国家代码。");
  if (language && !/^[a-z]{2}$/.test(language)) throw new QueryError("原始语言应使用两位语言代码。");
  const today = getTodayDate(now);
  const legacyFrom = numberText(value(params, "yearFrom"), "起始年份", 1800, 2200);
  const legacyTo = numberText(value(params, "yearTo"), "结束年份", 1800, 2200);
  const dateFrom = value(params, "dateFrom", legacyFrom ? `${legacyFrom}-01-01` : "");
  const dateTo = value(params, "dateTo", legacyTo
    ? legacyTo === today.slice(0, 4) ? "today" : `${legacyTo}-12-31`
    : chart === "discover" && !query ? "today" : "") || (chart === "discover" && !query ? "today" : "");
  if (dateFrom && !isCalendarDate(dateFrom)) throw new QueryError("起始日期必须是有效的 YYYY-MM-DD 日期。");
  if (dateTo && dateTo !== "today" && !isCalendarDate(dateTo)) throw new QueryError("结束日期必须是有效的 YYYY-MM-DD 日期。");
  if (dateFrom && resolveDateTo(dateTo, today) && dateFrom > resolveDateTo(dateTo, today)) {
    throw new QueryError("起始日期不能晚于结束日期。");
  }
  const result: CatalogFilters = {
    chart: chart as CatalogFilters["chart"], media: media as CatalogFilters["media"],
    period: period as CatalogFilters["period"], genreLogic: genreLogic as CatalogFilters["genreLogic"],
    query, genres, region, language, sort,
    dateFrom, dateTo,
    scoreMin: numberText(value(params, "scoreMin"), "最低评分", 0, 10, false),
    scoreMax: numberText(value(params, "scoreMax"), "最高评分", 0, 10, false),
    votesMin: numberText(value(params, "votesMin"), "最低投票数", 0, 100_000_000),
    runtimeMin: numberText(value(params, "runtimeMin"), "最短片长", 0, 1440),
    runtimeMax: numberText(value(params, "runtimeMax"), "最长片长", 0, 1440),
    page: Number(numberText(pageText, "页码", 1, 500)),
  };
  range(result.scoreMin, result.scoreMax, "评分");
  range(result.runtimeMin, result.runtimeMax, "片长");
  return result;
}

export interface CatalogRequest {
  path: string;
  params: URLSearchParams;
  mediaType: MediaType | "all";
  ranked: boolean;
}

export function hasAdvancedFilters(filters: CatalogFilters) {
  return Boolean(filters.genres.length || filters.dateFrom || (filters.dateTo && (filters.dateTo !== "today" || filters.chart !== "discover" || filters.query)) || filters.scoreMin || filters.scoreMax ||
    filters.votesMin || filters.region || filters.language || filters.runtimeMin || filters.runtimeMax ||
    filters.sort !== DEFAULT_FILTERS.sort);
}

function discoverSort(sort: string, media: MediaType) {
  const [key, direction] = sort.split(".");
  if (["release_date", "primary_release_date", "first_air_date"].includes(key)) {
    return `${media === "movie" ? "primary_release_date" : "first_air_date"}.${direction}`;
  }
  if (["title", "name"].includes(key)) return `${media === "movie" ? "title" : "name"}.${direction}`;
  if (["original_title", "original_name"].includes(key)) return `${media === "movie" ? "original_title" : "original_name"}.${direction}`;
  if (media === "tv" && key === "revenue") throw new QueryError("剧集不支持票房排序。");
  return sort;
}

/** Endpoints are chosen here, never supplied by the browser. */
export function buildCatalogRequest(input: CatalogFilters, now = new Date()): CatalogRequest {
  // Validate programmatic callers as strictly as URL callers.
  const serialized = new URLSearchParams();
  for (const [key, val] of Object.entries(input)) serialized.set(key, Array.isArray(val) ? val.join(",") : String(val));
  const filters = parseFilters(serialized, now);
  const { media, chart, query } = filters;
  const advanced = hasAdvancedFilters(filters);
  if (chart === "favorites") throw new QueryError("收藏保存在浏览器中，无需请求 TMDB。", "LOCAL_COLLECTION");
  if (query && advanced) throw new QueryError("名称搜索不能与高级筛选同时使用，请清空搜索或筛选。", "SEARCH_FILTER_CONFLICT");
  const params = new URLSearchParams({ language: "zh-CN", page: String(filters.page), include_adult: "false" });
  if (query) {
    params.set("query", query);
    return { path: `/search/${media === "all" ? "multi" : media}`, params, mediaType: media, ranked: false };
  }
  if (media === "all" && chart !== "trending") throw new QueryError("综合仅支持趋势榜和名称搜索。", "UNSUPPORTED_MEDIA_CHART");
  if (advanced && chart !== "discover") throw new QueryError("高级筛选请使用探索模式。", "FILTER_REQUIRES_DISCOVER");
  if (chart === "discover") {
    if (media === "all") throw new QueryError("探索时请选电影或剧集。", "UNSUPPORTED_MEDIA_CHART");
    params.set("sort_by", discoverSort(filters.sort, media));
    if (filters.genres.length) params.set("with_genres", filters.genres.join(filters.genreLogic === "and" ? "," : "|"));
    const dateKey = media === "movie" ? "primary_release_date" : "first_air_date";
    if (filters.dateFrom) params.set(`${dateKey}.gte`, filters.dateFrom);
    const dateTo = resolveDateTo(filters.dateTo, getTodayDate(now));
    if (dateTo) params.set(`${dateKey}.lte`, dateTo);
    const mapping: Partial<Record<keyof CatalogFilters, string>> = {
      scoreMin: "vote_average.gte", scoreMax: "vote_average.lte", votesMin: "vote_count.gte",
      region: "with_origin_country", language: "with_original_language",
      runtimeMin: "with_runtime.gte", runtimeMax: "with_runtime.lte",
    };
    for (const [key, param] of Object.entries(mapping)) {
      const val = filters[key as keyof CatalogFilters];
      if (val) params.set(param, String(val));
    }
    return { path: `/discover/${media}`, params, mediaType: media, ranked: false };
  }
  if (chart === "trending") return { path: `/trending/${media}/${filters.period}`, params, mediaType: media, ranked: true };
  if (media === "movie" && chart === "upcoming") {
    // Match the primary date shown on cards, rather than another release event.
    params.set("include_video", "false");
    params.set("with_release_type", "2|3");
    params.set("primary_release_date.gte", getTomorrowDate(now));
    params.set("sort_by", "popularity.desc");
    return { path: "/discover/movie", params, mediaType: media, ranked: false };
  }
  const endpoints = {
    popular: "popular", top: "top_rated",
    now: media === "movie" ? "now_playing" : "on_the_air",
    upcoming: media === "movie" ? "upcoming" : "airing_today",
  };
  return { path: `/${media}/${endpoints[chart]}`, params, mediaType: media, ranked: true };
}

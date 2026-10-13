import { QueryError } from "../query";
import type { MediaType } from "../types";

export const IMDB_PAGE_SIZE = 20;
export const IMDB_SORTS = [
  { value: "rank", label: "原榜顺序", sortBy: "RANKING", sortOrder: "ASC" },
  { value: "user_rating", label: "IMDB 评分", sortBy: "USER_RATING", sortOrder: "DESC" },
  { value: "popularity", label: "人气优先", sortBy: "POPULARITY", sortOrder: "ASC" },
  { value: "num_votes", label: "评分数量", sortBy: "USER_RATING_COUNT", sortOrder: "DESC" },
] as const;
export type ImdbSort = typeof IMDB_SORTS[number]["value"];
export interface ImdbFilters { media: MediaType; chart: "top" | "popular"; sort: ImdbSort; page: number }

export function parseImdbFilters(params: URLSearchParams): ImdbFilters {
  const value = (key: string, fallback: string) => {
    if (params.getAll(key).length > 1) throw new QueryError(`参数 ${key} 不能重复。`);
    return params.get(key) ?? fallback;
  };
  const media = value("media", "movie"), chart = value("chart", "top");
  const sort = value("sort", "rank"), page = value("page", "1");
  if (media !== "movie" && media !== "tv") throw new QueryError("IMDB 榜单仅支持电影或电视剧。");
  if (chart !== "top" && chart !== "popular") throw new QueryError("请选择 IMDB Top 250 或热门榜。");
  if (!IMDB_SORTS.some(option => option.value === sort)) throw new QueryError("IMDB 排序方式无效。");
  const maxPage = chart === "top" ? 13 : 5;
  if (!/^[1-9]\d*$/.test(page) || Number(page) > maxPage) throw new QueryError(`该榜单页码须为 1～${maxPage}。`);
  const allowed = new Set(["source", "media", "chart", "sort", "page"]);
  for (const key of params.keys()) if (!allowed.has(key)) throw new QueryError("IMDB 榜单不支持此筛选条件，请重新选择榜单。");
  if (params.has("source") && value("source", "imdb") !== "imdb") throw new QueryError("榜单来源无效。");
  return { media, chart, sort: sort as ImdbSort, page: Number(page) };
}

export function imdbParams(filters: ImdbFilters) {
  return new URLSearchParams({ source: "imdb", media: filters.media, chart: filters.chart, sort: filters.sort, page: String(filters.page) });
}

export function imdbChart(filters: Pick<ImdbFilters, "media" | "chart">) {
  const movie = filters.media === "movie", top = filters.chart === "top";
  return {
    type: top ? movie ? "TOP_RATED_MOVIES" : "TOP_RATED_TV_SHOWS" : movie ? "MOST_POPULAR_MOVIES" : "MOST_POPULAR_TV_SHOWS",
    limit: top ? 250 : 100,
    label: top ? `Top 250 ${movie ? "电影" : "剧集"}` : `热门${movie ? "电影" : "剧集"}`,
    url: `https://www.imdb.com/chart/${top ? movie ? "top" : "toptv" : movie ? "moviemeter" : "tvmeter"}/`,
  };
}

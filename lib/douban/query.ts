import { QueryError } from "../query";
import type { MediaType } from "../types";
import options from "./options.json";

export const DOUBAN_OPTIONS = options;
export const DOUBAN_PAGE_SIZE = 20;
export type DoubanChart = "popular" | "realtime" | "weekly" | "genres" | "top" | "now" | "recommend" | "lists";
export interface DoubanFilters {
  media: MediaType; chart: DoubanChart; page: number;
  collection: string; group: string; list: string; category: string;
  area: string; sort: string; genre: string; region: string; year: string; platform: string; score: string;
}
const charts: { value: DoubanChart; title: string; movieOnly?: boolean }[] = [
  { value: "popular", title: "热门电影", movieOnly: true }, { value: "realtime", title: "实时热榜" },
  { value: "weekly", title: "一周口碑" }, { value: "top", title: "TOP 250", movieOnly: true },
  { value: "now", title: "影院热映", movieOnly: true }, { value: "genres", title: "类型榜单" },
  { value: "recommend", title: "选电影" }, { value: "lists", title: "片单" },
];
export const doubanCharts = (media: MediaType) => charts.filter(chart => media === "movie" || !chart.movieOnly)
  .map(chart => chart.value === "recommend" && media === "tv" ? { ...chart, title: "选电视剧" } : chart);
// Legacy popular/realtime APIs remain available; popular now lives under recommendation categories.
const visibleChartOrder: DoubanChart[] = ["recommend", "weekly", "now", "genres", "top"];
export const visibleDoubanCharts = (media: MediaType) => doubanCharts(media).filter(chart => visibleChartOrder.includes(chart.value))
  .sort((a, b) => visibleChartOrder.indexOf(a.value) - visibleChartOrder.indexOf(b.value));
export const weeklyOptions = (media: MediaType) => options.weekly.list_type.filter(option => media === "movie" ? option.value === "movie_weekly_best" : option.value !== "movie_weekly_best");
export const realtimeOptions = (media: MediaType) => options.realtime.hot_type.filter(option => option.value === `${media}_real_time_hotest` || option.value === "subject_real_time_hotest");

/** Convert only official list links to an identifier; never forward a user-supplied URL upstream. */
export function parseDoubanListUrl(input: string): string {
  let url: URL;
  try { url = new URL(input.trim()); } catch { throw new QueryError("请粘贴完整的豆瓣豆列或榜单链接。"); }
  if (!["https:", "http:"].includes(url.protocol) || !["www.douban.com", "m.douban.com", "movie.douban.com", "douban.com"].includes(url.hostname) || url.username || url.password || url.port) throw new QueryError("仅支持豆瓣官方的豆列或榜单链接。");
  const path = url.pathname === "/doubanapp/dispatch" ? url.searchParams.get("uri") || "" : url.pathname;
  const match = /^\/?(doulist\/([1-9]\d{0,11})|subject_collection\/([a-zA-Z0-9_]{1,80}))\/?(?:\?.*)?$/.exec(path);
  if (!match) throw new QueryError("此链接不是豆瓣豆列或榜单，请使用 doulist 或 subject_collection 链接。");
  return match[2] ? `doulist:${match[2]}` : `collection:${match[3]}`;
}
export function doubanListUrl(id: string) {
  if (/^doulist:[1-9]\d{0,11}$/.test(id)) return `https://www.douban.com/doulist/${id.slice(8)}/`;
  if (/^collection:[a-zA-Z0-9_]{1,80}$/.test(id)) return `https://m.douban.com/subject_collection/${id.slice(11)}`;
  throw new QueryError("豆瓣片单编号无效。");
}

export function parseDoubanFilters(params: URLSearchParams): DoubanFilters {
  for (const key of params.keys()) if (params.getAll(key).length > 1) throw new QueryError(`参数 ${key} 不能重复。`);
  const used = new Set(["source", "media", "chart", "page"]);
  const value = (key: string, fallback: string) => { used.add(key); return params.get(key) ?? fallback; };
  const choice = (key: string, choices: readonly { value: string }[], fallback = choices[0].value) => {
    const selected = value(key, fallback);
    if (!choices.some(option => option.value === selected)) throw new QueryError(`豆瓣筛选 ${key} 无效，请重新选择。`);
    return selected;
  };
  const media = choice("media", [{ value: "movie" }, { value: "tv" }]) as MediaType;
  const chart = choice("chart", doubanCharts(media), media === "movie" ? "recommend" : "weekly") as DoubanChart;
  if (value("source", "douban") !== "douban") throw new QueryError("榜单来源无效。");
  const page = value("page", "1");
  if (!/^[1-9]\d*$/.test(page) || Number(page) > (chart === "top" ? 13 : 500)) throw new QueryError("豆瓣页码超出可浏览范围。");
  const result: DoubanFilters = { media, chart, page: Number(page), collection: "", group: "", list: "", category: "全部", area: "全部", sort: "U", genre: "", region: "", year: "", platform: "", score: "4" };
  if (chart === "popular") {
    result.area = choice("area", options.popular.area);
    result.sort = choice("sort", options.popular.sort);
  } else if (chart === "realtime" || chart === "weekly") {
    result.collection = choice("collection", chart === "realtime" ? realtimeOptions(media) : weeklyOptions(media));
  } else if (chart === "genres") {
    result.group = choice("group", options.genres[media]);
    result.collection = choice("collection", options.genres[media].find(group => group.value === result.group)!.boards);
  } else if (chart === "lists") {
    result.list = value("list", options.lists[0].value); doubanListUrl(result.list);
  } else if (chart === "recommend") {
    const choices = options.recommend[media];
    result.category = choice("category", choices.category, media === "movie" ? "热门" : "全部");
    if (result.category === "全部") {
      for (const key of ["genre", "region", "year", "sort", "score"] as const) result[key] = choice(key, choices[key], key === "sort" ? "U" : key === "score" ? "4" : "");
      if (media === "tv") result.platform = choice("platform", options.recommend.tv.platform, "");
    } else if (media === "movie") {
      result.area = choice("area", options.recommend.movie.type);
      if (result.category === "热门") result.sort = choice("sort", options.popular.sort);
    }
  }
  for (const key of params.keys()) if (!used.has(key)) throw new QueryError("当前豆瓣榜单不支持此筛选条件，请重新选择。");
  return result;
}

export function doubanParams(filters: DoubanFilters) {
  const p = new URLSearchParams({ source: "douban", media: filters.media, chart: filters.chart, page: String(filters.page) });
  let keys: (keyof DoubanFilters)[] = [];
  if (filters.chart === "popular") keys = ["area", "sort"];
  if (["weekly", "realtime"].includes(filters.chart)) keys = ["collection"];
  if (filters.chart === "genres") keys = ["group", "collection"];
  if (filters.chart === "lists") keys = ["list"];
  if (filters.chart === "recommend") keys = filters.category === "全部"
    ? ["category", "genre", "region", "year", "sort", "score", ...(filters.media === "tv" ? ["platform" as const] : [])]
    : ["category", ...(filters.media === "movie" ? ["area" as const, ...(filters.category === "热门" ? ["sort" as const] : [])] : [])];
  keys.forEach(key => p.set(key, String(filters[key]))); return p;
}
export const defaultDoubanFilters = (media: MediaType, chart?: DoubanChart) => parseDoubanFilters(new URLSearchParams({ media, ...(chart ? { chart } : {}) }));

/** Keep bookmarks/history for the merged entry, including their region, sort and starting page. */
export function migrateDoubanPopularHref(href: string) {
  const url = new URL(href, "https://frame.local");
  if (url.origin !== "https://frame.local" || url.pathname !== "/" || url.searchParams.get("source") !== "douban" || url.searchParams.get("chart") !== "popular") return href;
  let filters: DoubanFilters;
  try { filters = { ...parseDoubanFilters(url.searchParams), chart: "recommend", category: "热门" }; }
  catch { filters = defaultDoubanFilters("movie"); }
  return `/?${doubanParams(filters)}`;
}

export function doubanChart(filters: DoubanFilters) {
  const { chart, media } = filters;
  let collection = filters.collection, title = charts.find(item => item.value === chart)!.title;
  if (chart === "top") { collection = "movie_top250"; title = "TOP 250 电影"; }
  if (chart === "now") collection = "movie_showing";
  if (chart === "genres") title = options.genres[media].find(group => group.value === filters.group)!.boards.find(board => board.value === collection)!.title;
  if (chart === "weekly") title = weeklyOptions(media).find(option => option.value === collection)!.title;
  if (chart === "realtime") title = collection === "subject_real_time_hotest" ? "书影音热榜 · 影视" : `${media === "movie" ? "电影" : "剧集"}实时热榜`;
  if (chart === "recommend") title = media === "movie" ? "选电影" : "选电视剧";
  if (chart === "lists") title = options.lists.find(list => list.value === filters.list)?.title || "自定义片单";
  return { title, collection, ranked: ["realtime", "weekly", "genres", "top"].includes(chart) || chart === "lists" && filters.list.startsWith("collection:"),
    url: chart === "lists" ? doubanListUrl(filters.list) : collection ? `https://m.douban.com/subject_collection/${collection}` : "https://movie.douban.com/explore" };
}

export function buildDoubanRequest(filters: DoubanFilters) {
  const meta = doubanChart(filters), start = (filters.page - 1) * DOUBAN_PAGE_SIZE;
  const params = new URLSearchParams({ start: String(start), count: String(DOUBAN_PAGE_SIZE), items_only: "1", for_mobile: "1" });
  let path: string;
  if (filters.chart === "popular" || filters.chart === "recommend" && filters.media === "movie" && filters.category === "热门") {
    path = "movie/hot_gaia"; params.set("area", filters.area); params.set("sort", filters.sort); params.set("playable", "0"); params.set("loc_id", "0");
  } else if (filters.chart === "recommend") {
    if (filters.category === "全部") {
      path = `${filters.media}/recommend`; params.set("refresh", "0"); params.set("uncollect", "false"); params.set("score_range", `${filters.score},10`); params.set("sort", filters.sort);
      const tags = [filters.genre, filters.region, filters.year, filters.platform].filter(Boolean);
      if (tags.length) params.set("tags", tags.join(","));
    } else {
      path = `subject/recent_hot/${filters.media}`;
      params.set("category", filters.media === "tv" ? "热门" : filters.category);
      params.set("type", filters.media === "tv" ? filters.category : filters.area);
    }
  } else if (filters.chart === "lists") {
    const [kind, id] = filters.list.split(":"); path = `${kind === "doulist" ? "doulist" : "subject_collection"}/${id}/items`;
  } else path = `subject_collection/${meta.collection}/items`;
  const referer = path.startsWith("subject_collection/") ? `https://m.douban.com/subject_collection/${path.split("/")[1]}`
    : filters.chart === "lists" ? doubanListUrl(filters.list)
    : filters.chart === "recommend" ? "https://movie.douban.com/explore" : "https://m.douban.com/";
  return { url: `https://m.douban.com/rexxar/api/v2/${path}?${params}`, referer, start };
}

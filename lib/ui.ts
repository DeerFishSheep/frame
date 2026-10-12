import type { CatalogFilters, Chart, MediaType } from "./types";

export const GENRES = {
  movie: [{id:28,name:"动作"},{id:12,name:"冒险"},{id:16,name:"动画"},{id:35,name:"喜剧"},{id:80,name:"犯罪"},{id:99,name:"纪录"},{id:18,name:"剧情"},{id:10751,name:"家庭"},{id:14,name:"奇幻"},{id:36,name:"历史"},{id:27,name:"恐怖"},{id:10402,name:"音乐"},{id:9648,name:"悬疑"},{id:10749,name:"爱情"},{id:878,name:"科幻"},{id:10770,name:"电视电影"},{id:53,name:"惊悚"},{id:10752,name:"战争"},{id:37,name:"西部"}],
  tv: [{id:10759,name:"动作冒险"},{id:16,name:"动画"},{id:35,name:"喜剧"},{id:80,name:"犯罪"},{id:99,name:"纪录"},{id:18,name:"剧情"},{id:10751,name:"家庭"},{id:10762,name:"儿童"},{id:9648,name:"悬疑"},{id:10763,name:"新闻"},{id:10764,name:"真人秀"},{id:10765,name:"科幻奇幻"},{id:10766,name:"肥皂剧"},{id:10767,name:"脱口秀"},{id:10768,name:"战争政治"},{id:37,name:"西部"}],
};

export function chartMeta(chart: Chart, media: MediaType | "all", period: "day" | "week") {
  const tv = media === "tv";
  const entries = {
    trending: {title: period === "day" ? "今日趋势" : "本周趋势"},
    popular: {title:"热门影片"},
    top: {title:"高分影片"},
    now: {title:tv?"近期在播":"正在上映"},
    upcoming: {title:tv?"今日播出":"即将上映"},
    discover: {title:"找片"},
    favorites: {title:"我的收藏"},
  };
  return entries[chart];
}

export function serializeFilters(filters: CatalogFilters) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) {
    if (key === "page" && value === 1) continue;
    if (key === "genres") { if (value.length) params.set(key, value.join(",")); }
    else if (value !== "") params.set(key, String(value));
  }
  return params;
}

export const formatTime = (value: string | null) => value ? new Intl.DateTimeFormat("zh-CN", {timeZone:"Asia/Shanghai",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",hour12:false}).format(new Date(value)) : "尚未连接";
export const formatCount = (value: number) => new Intl.NumberFormat("zh-CN").format(value);

export function activeFilterCount(filters: CatalogFilters) {
  return filters.genres.length + [filters.dateFrom,filters.dateTo === "today" ? "" : filters.dateTo,filters.scoreMin,filters.scoreMax,filters.votesMin,filters.region,filters.language,filters.keywords,filters.runtimeMin,filters.runtimeMax].filter(Boolean).length;
}

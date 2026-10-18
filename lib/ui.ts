import { DEFAULT_FILTERS, type CatalogFilters, type Chart, type MediaType } from "./types";

// Fixed common-first UI order; this is not a live popularity statistic.
export const GENRES = {
  movie: [{id:18,name:"剧情"},{id:28,name:"动作"},{id:35,name:"喜剧"},{id:878,name:"科幻"},{id:9648,name:"悬疑"},{id:10749,name:"爱情"},{id:53,name:"惊悚"},{id:80,name:"犯罪"},{id:16,name:"动画"},{id:12,name:"冒险"},{id:14,name:"奇幻"},{id:27,name:"恐怖"},{id:10752,name:"战争"},{id:10751,name:"家庭"},{id:36,name:"历史"},{id:99,name:"纪录"},{id:10402,name:"音乐"},{id:37,name:"西部"},{id:10770,name:"电视电影"}],
  tv: [{id:18,name:"剧情"},{id:9648,name:"悬疑"},{id:35,name:"喜剧"},{id:80,name:"犯罪"},{id:10759,name:"动作冒险"},{id:10765,name:"科幻奇幻"},{id:16,name:"动画"},{id:10751,name:"家庭"},{id:10764,name:"真人秀"},{id:10768,name:"战争政治"},{id:99,name:"纪录"},{id:10762,name:"儿童"},{id:10767,name:"脱口秀"},{id:10766,name:"肥皂剧"},{id:10763,name:"新闻"},{id:37,name:"西部"}],
};

export const REGIONS = [
  { value: "", label: "全部地区" }, { value: "CN", label: "中国大陆" },
  { value: "HK", label: "中国香港" }, { value: "TW", label: "中国台湾" },
  { value: "US", label: "美国" }, { value: "GB", label: "英国" },
  { value: "FR", label: "法国" }, { value: "JP", label: "日本" },
  { value: "KR", label: "韩国" }, { value: "IN", label: "印度" },
];

export function getSortOptions(media: MediaType) {
  return [
    { value: "popularity.desc", label: "热度优先" },
    { value: "vote_average.desc", label: "评分最高" },
    { value: media === "tv" ? "first_air_date.desc" : "primary_release_date.desc", label: media === "tv" ? "最近开播" : "最近上映" },
    { value: "vote_count.desc", label: "评分数量" },
  ];
}

export function sortForMedia(sort: string, media: MediaType) {
  return ["release_date.desc", "primary_release_date.desc", "first_air_date.desc"].includes(sort)
    ? media === "tv" ? "first_air_date.desc" : "primary_release_date.desc"
    : sort;
}

export function getRegionLabel(region: string) {
  const code = region.toUpperCase();
  const known = REGIONS.find(option => option.value === code);
  if (known) return known.label;
  try { return new Intl.DisplayNames(["zh-CN"], { type: "region" }).of(code) || code; }
  catch { return code; }
}

export function getSortLabel(sort: string, media: MediaType) {
  const normalized = sortForMedia(sort, media);
  const known = getSortOptions(media).find(option => option.value === normalized);
  if (known) return known.label;
  const [key, direction] = normalized.split(".");
  const labels: Record<string, string> = {
    popularity: "热度", vote_average: "评分", vote_count: "评分数量",
    release_date: media === "tv" ? "首播日期" : "上映日期",
    primary_release_date: media === "tv" ? "首播日期" : "上映日期",
    first_air_date: media === "tv" ? "首播日期" : "上映日期",
    title: "片名", name: "剧名", original_title: "原片名", original_name: "原剧名", revenue: "票房",
  };
  return labels[key] && (direction === "asc" || direction === "desc")
    ? `${labels[key]}${direction === "asc" ? "升序" : "降序"}` : sort;
}

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
  return filters.genres.length + [filters.dateFrom,filters.dateTo === "today" ? "" : filters.dateTo,filters.scoreMin,filters.scoreMax,filters.votesMin,filters.region,filters.language,filters.runtimeMin,filters.runtimeMax].filter(Boolean).length + (filters.sort !== DEFAULT_FILTERS.sort ? 1 : 0);
}

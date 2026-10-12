import type { CatalogFilters, Chart, MediaType } from "./types";

export const GENRES = {
  movie: [{id:28,name:"动作"},{id:12,name:"冒险"},{id:16,name:"动画"},{id:35,name:"喜剧"},{id:80,name:"犯罪"},{id:99,name:"纪录"},{id:18,name:"剧情"},{id:10751,name:"家庭"},{id:14,name:"奇幻"},{id:36,name:"历史"},{id:27,name:"恐怖"},{id:10402,name:"音乐"},{id:9648,name:"悬疑"},{id:10749,name:"爱情"},{id:878,name:"科幻"},{id:53,name:"惊悚"},{id:10752,name:"战争"},{id:37,name:"西部"}],
  tv: [{id:10759,name:"动作冒险"},{id:16,name:"动画"},{id:35,name:"喜剧"},{id:80,name:"犯罪"},{id:99,name:"纪录"},{id:18,name:"剧情"},{id:10751,name:"家庭"},{id:10762,name:"儿童"},{id:9648,name:"悬疑"},{id:10763,name:"新闻"},{id:10764,name:"真人秀"},{id:10765,name:"科幻奇幻"},{id:10766,name:"肥皂剧"},{id:10767,name:"脱口秀"},{id:10768,name:"战争政治"},{id:37,name:"西部"}],
};

export function chartMeta(chart: Chart, media: MediaType | "all", period: "day" | "week") {
  const tv = media === "tv";
  const entries = {
    trending: {title: period === "day" ? "今日趋势榜单" : "本周趋势榜单", en:"THE DAILY INDEX", description:"正在被关注的故事，或许也正好打动你。"},
    popular: {title:"人气热门",en:"IN THE SPOTLIGHT",description:"从世界各地的关注里，寻找你的下一部好故事。"},
    top: {title:"口碑高分",en:"THE ESSENTIAL COLLECTION",description:"经得起时间，也经得起反复观看。"},
    now: {title:tv?"近期在播":"正在上映",en:"ON THE SCREEN",description:tv?"正在继续的故事，值得追下去。":"走进影院，让光影成为今天的一部分。"},
    upcoming: {title:tv?"今日播出":"即将上映",en:"COMING INTO FRAME",description:tv?"今天，还有新的故事发生。":"把期待留给即将到来的好故事。"},
    discover: {title:"发现好故事",en:"A FILM, JUST FOR YOU",description:"从类型、年代和口碑出发，找到合心意的下一部。"},
    favorites: {title:"我的收藏",en:"YOUR PRIVATE COLLECTION",description:"那些想看的、喜欢的，和舍不得忘记的故事。"},
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
  return filters.genres.length + [filters.yearFrom,filters.yearTo,filters.scoreMin,filters.scoreMax,filters.votesMin,filters.region,filters.language,filters.keywords,filters.runtimeMin,filters.runtimeMax].filter(Boolean).length;
}

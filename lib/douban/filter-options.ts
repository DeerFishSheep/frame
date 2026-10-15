import { DOUBAN_OPTIONS, doubanParams, parseDoubanFilters, weeklyOptions, type DoubanFilters } from "./query";
import { QueryError } from "../query";

export interface DoubanFilterRow {
  key: keyof DoubanFilters;
  label: string;
  options: readonly { title: string; value: string }[];
}

/** Only expose choices supported by the current Douban endpoint. */
export function doubanFilterRows(filters: DoubanFilters): DoubanFilterRow[] {
  const { media, chart } = filters;
  const rows: DoubanFilterRow[] = [];
  const add = (key: keyof DoubanFilters, label: string, options: DoubanFilterRow["options"], includeSingle = false) => {
    if (options.length > (includeSingle ? 0 : 1)) rows.push({ key, label, options });
  };
  if (chart === "popular") {
    add("area", "地区", DOUBAN_OPTIONS.popular.area);
    add("sort", "排序", DOUBAN_OPTIONS.popular.sort);
  } else if (chart === "weekly") {
    add("collection", "口碑榜单", weeklyOptions(media));
  } else if (chart === "genres") {
    const groups = DOUBAN_OPTIONS.genres[media];
    add("group", media === "movie" ? "电影类型" : "剧集分类", groups);
    const suffix = `${media === "movie" && !filters.group.endsWith("片") ? `${filters.group}片` : filters.group}榜`;
    const boards = (groups.find(group => group.value === filters.group)?.boards ?? []).map(board => ({
      ...board, title: board.title.endsWith(suffix) ? `${board.title.slice(0, -suffix.length)}榜` : board.title,
    }));
    add("collection", "具体榜单", boards, true);
  } else if (chart === "recommend") {
    const choices = DOUBAN_OPTIONS.recommend[media];
    add("category", "推荐分类", choices.category);
    if (filters.category === "全部") {
      add("genre", "类型", choices.genre);
      add("region", "地区", choices.region);
      add("year", "年代", choices.year);
      add("score", "最低评分", choices.score.map(option => ({ value: option.value, title: option.value === "0" ? "不限" : `${option.value}分起` })));
      if (media === "tv") add("platform", "播出平台", DOUBAN_OPTIONS.recommend.tv.platform);
      add("sort", "排序", choices.sort);
    } else if (media === "movie") {
      add("area", "地区", DOUBAN_OPTIONS.recommend.movie.type);
      if (filters.category === "热门") add("sort", "排序", DOUBAN_OPTIONS.popular.sort);
    }
  }
  return rows;
}

/** Normalize dependent fields through the same parser used by the API. */
export function selectDoubanFilter(filters: DoubanFilters, key: keyof DoubanFilters, value: string): DoubanFilters {
  const row = doubanFilterRows(filters).find(row => row.key === key);
  if (!row?.options.some(option => option.value === value)) throw new QueryError("当前豆瓣榜单不支持此筛选条件，请重新选择。");
  if (filters[key] === value) return filters;
  const next = { ...filters, [key]: value, page: 1 };
  if (key === "category") next.sort = next.media === "movie" && value === "热门" ? "recommend" : "U";
  if (key === "group") {
    next.collection = DOUBAN_OPTIONS.genres[next.media].find(group => group.value === value)?.boards[0].value ?? "";
  }
  return parseDoubanFilters(doubanParams(next));
}

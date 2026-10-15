import type { DataSource, MediaType } from "./types";
import { defaultDoubanFilters, doubanParams, migrateDoubanPopularHref } from "./douban/query";

/** One registry for names, artwork and the source chooser. Only connected sources belong here. */
export const CATALOG_SOURCES = [
  { id: "tmdb", label: "TMDB", icon: "/platforms/tmdb.ico", description: "趋势、热门与高分榜单" },
  { id: "imdb", label: "IMDB", icon: "/platforms/imdb.png", description: "Top 250 与热门榜单" },
  { id: "douban", label: "豆瓣", icon: "/platforms/douban.svg", description: "口碑、类型榜与精选片单" },
] as const;
export type CatalogSourceId = typeof CATALOG_SOURCES[number]["id"];

export function catalogSource(params: URLSearchParams): CatalogSourceId {
  return CATALOG_SOURCES.find(source => source.id === params.get("source"))?.id ?? "tmdb";
}
/** Global name search and Discover always read TMDB, independently of the saved chart provider. */
export function catalogDataSource(params: URLSearchParams): CatalogSourceId {
  return params.get("query")?.trim() || ["discover", "favorites"].includes(params.get("chart") || "") ? "tmdb" : catalogSource(params);
}
export function isHiddenDoubanHref(href: string) {
  const url = new URL(href, "https://frame.local");
  return url.pathname === "/" && url.searchParams.get("source") === "douban" && ["popular", "lists", "realtime"].includes(url.searchParams.get("chart") || "");
}

/** Only actual charts can be restored; old search/Discover links must not overwrite provider navigation. */
export function catalogSourceLocation(target: CatalogSourceId, media: MediaType, remember: (key: string) => string | undefined) {
  const previous = remember(`catalog-location:${media}:${target}`);
  if (!previous) return undefined;
  try {
    const restored = target === "douban" ? migrateDoubanPopularHref(previous) : previous;
    const url = new URL(restored, "https://frame.local");
    if (url.origin !== "https://frame.local" || url.pathname !== "/" || url.searchParams.get("query")?.trim()
      || ["discover", "favorites"].includes(url.searchParams.get("chart") || "")
      || catalogSource(url.searchParams) !== target || (url.searchParams.get("media") || "movie") !== media
      || target === "douban" && isHiddenDoubanHref(restored)) return undefined;
    return restored;
  } catch { return undefined; }
}

export function catalogSourceHref(target: CatalogSourceId, params: URLSearchParams, remember: (key: string) => string | undefined) {
  if (target === catalogSource(params) && !params.get("query")?.trim() && !["discover", "favorites"].includes(params.get("chart") || "")) return target === "douban" ? migrateDoubanPopularHref(`/?${params}`) : `/?${params}`;
  const media: MediaType = params.get("media") === "tv" ? "tv" : "movie";
  const restored = catalogSourceLocation(target, media, remember);
  if (restored) return restored;
  if (target === "douban") return `/?${doubanParams(defaultDoubanFilters(media))}`;
  const chart = params.get("chart") === "popular" ? "popular" : "top";
  return target === "imdb" ? `/?source=imdb&media=${media}&chart=${chart}&sort=rank` : `/?media=${media}&chart=${chart}`;
}

/** Also normalizes old in-memory titles that already carry a source prefix. */
export const sourceLabel = (source: DataSource) => source === "demo" ? "预览" : CATALOG_SOURCES.find(entry => entry.id === source)!.label;
export function formatCatalogTitle(source: DataSource, title: string) {
  const label = sourceLabel(source);
  const plain = title.replace(/^(?:TMDB|IMDB|豆瓣|预览)\s*·\s*/, "");
  return `${label} · ${plain}`;
}

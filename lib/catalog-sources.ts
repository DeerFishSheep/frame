import type { DataSource, MediaType } from "./types";

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

export function catalogSourceHref(target: CatalogSourceId, params: URLSearchParams, remember: (key: string) => string | undefined) {
  if (target === catalogSource(params)) return `/?${params}`;
  const media: MediaType = params.get("media") === "tv" ? "tv" : "movie";
  const previous = remember(`catalog-location:${media}:${target}`);
  if (previous) return previous;
  if (target === "douban") return `/?source=douban&media=${media}&chart=${media === "movie" ? "popular" : "realtime"}`;
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

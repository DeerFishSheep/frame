import { CATALOG_SOURCES, catalogSource, catalogSourceLocation, type CatalogSourceId } from "./catalog-sources";
import { defaultDoubanFilters, doubanParams, visibleDoubanCharts } from "./douban/query";
import type { MediaType } from "./types";

export const CATALOG_SOURCE_MEMORY = "catalog-source:preferred";
export const CATALOG_MEDIA_MEMORY = "catalog-media:preferred";
export type ReadCatalogMemory = (key: string) => string | undefined;

export function isCatalogBrowse(pathname: string, params: URLSearchParams) {
  return pathname === "/" && !params.get("query")?.trim() && params.get("media") !== "all"
    && !["discover", "favorites"].includes(params.get("chart") || "");
}

/** Browsing a chart is the only navigation that updates the remembered provider and its conditions. */
export function rememberCatalogLocation(pathname: string, params: URLSearchParams, save: (key: string, value: string) => void) {
  if (!isCatalogBrowse(pathname, params)) return;
  const source = catalogSource(params), media: MediaType = params.get("media") === "tv" ? "tv" : "movie";
  save(`catalog-location:${media}:${source}`, `/?${params}`);
  save(CATALOG_SOURCE_MEMORY, source);
  save(CATALOG_MEDIA_MEMORY, media);
}

function preferredSource(pathname: string, params: URLSearchParams, remember: ReadCatalogMemory): CatalogSourceId {
  if (isCatalogBrowse(pathname, params)) return catalogSource(params);
  const saved = remember(CATALOG_SOURCE_MEMORY);
  const source = CATALOG_SOURCES.find(item => item.id === saved)?.id;
  if (source) return source;
  if (/^\/douban\/(?:movie|tv)\//.test(pathname)) return "douban";
  return pathname.startsWith("/movie/") || pathname.startsWith("/tv/") ? catalogSource(params) : "tmdb";
}

export function preferredCatalogMedia(pathname: string, params: URLSearchParams, remember: ReadCatalogMemory): MediaType {
  if (pathname.startsWith("/movie/") || pathname.startsWith("/douban/movie/")) return "movie";
  if (pathname.startsWith("/tv/") || pathname.startsWith("/douban/tv/")) return "tv";
  const media = params.get("media");
  return media === "tv" || media === "movie" ? media : remember(CATALOG_MEDIA_MEMORY) === "tv" ? "tv" : "movie";
}

/** Main movie/TV navigation restores this provider's own conditions for the selected media. */
export function catalogNavigationHref(media: MediaType, pathname: string, params: URLSearchParams, remember: ReadCatalogMemory = () => undefined) {
  const source = preferredSource(pathname, params, remember);
  const currentMedia = preferredCatalogMedia(pathname, params, remember);
  if (isCatalogBrowse(pathname, params) && currentMedia === media) return `/?${params}`;
  const previous = catalogSourceLocation(source, media, remember);
  if (previous) return previous;
  const origin = isCatalogBrowse(pathname, params) ? params
    : new URL(catalogSourceLocation(source, currentMedia, remember) || "/", "https://frame.local").searchParams;
  if (source === "douban") {
    const chart = visibleDoubanCharts(media).find(item => item.value === origin.get("chart"))?.value;
    return `/?${doubanParams(defaultDoubanFilters(media, chart))}`;
  }
  if (source === "imdb") {
    const chart = origin.get("chart") === "popular" ? "popular" : "top";
    const next = new URLSearchParams({ source, media, chart, sort: origin.get("sort") || "rank" });
    return `/?${next}`;
  }
  const next = new URLSearchParams(origin);
  next.set("media", media); next.delete("source"); next.delete("page"); next.delete("query");
  return `/?${next}`;
}

export function catalogReturnHref(pathname: string, params: URLSearchParams, remember: ReadCatalogMemory = () => undefined) {
  return catalogNavigationHref(preferredCatalogMedia(pathname, params, remember), pathname, params, remember);
}

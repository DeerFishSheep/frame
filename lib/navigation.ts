import { DEFAULT_FILTERS, type MediaType } from "./types";
import { serializeFilters } from "./ui";

/** A name search starts a clean catalog query; saved items keep their local filters. */
export function buildSearchHref(pathname: string, current: URLSearchParams, query: string) {
  if (pathname === "/favorites") {
    const params = new URLSearchParams(current);
    params.set("chart", "favorites");
    params.delete("page");
    if (query.trim()) params.set("query", query.trim());
    else params.delete("query");
    return `/favorites?${params}`;
  }
  const requested = current.get("media");
  const media: MediaType | "all" = pathname.startsWith("/tv/") ? "tv"
    : pathname.startsWith("/movie/") ? "movie"
    : requested === "movie" || requested === "tv" || requested === "all" ? requested : "movie";
  return `/?${serializeFilters({ ...DEFAULT_FILTERS, media, query: query.trim() })}`;
}

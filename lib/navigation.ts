import { DEFAULT_FILTERS, type MediaType } from "./types";
import { serializeFilters } from "./ui";
import { catalogReturnHref, type ReadCatalogMemory } from "./catalog-navigation";

/** A name search starts a clean catalog query; saved items keep their local filters. */
export function buildSearchHref(pathname: string, current: URLSearchParams, query: string, remember: ReadCatalogMemory = () => undefined) {
  if (pathname === "/favorites") {
    const params = new URLSearchParams(current);
    params.set("chart", "favorites");
    params.delete("page");
    if (query.trim()) params.set("query", query.trim());
    else params.delete("query");
    return `/favorites?${params}`;
  }
  if (!query.trim()) return catalogReturnHref(pathname, current, remember);
  return `/?${serializeFilters({ ...DEFAULT_FILTERS, media: "all", query: query.trim() })}`;
}

/** Repair provider-specific parameters on older search links without changing an explicit result filter. */
export function normalizeNameSearchHref(current: URLSearchParams) {
  const query = current.get("query")?.trim();
  if (!query || !["imdb", "douban"].includes(current.get("source") || "")) return null;
  const requested = current.get("media");
  const media: MediaType | "all" = requested === "movie" || requested === "tv" ? requested : "all";
  return `/?${serializeFilters({ ...DEFAULT_FILTERS, media, query })}`;
}

/** Workspace's empty-state reset removes a name query through its shared filter controls. */
export function clearedNameSearchHref(previous: URLSearchParams, current: URLSearchParams, remember: ReadCatalogMemory = () => undefined) {
  if (!previous.get("query")?.trim() || current.get("query")?.trim() || current.has("source")) return null;
  const expected = serializeFilters({
    ...DEFAULT_FILTERS,
    media: previous.get("media") === "tv" ? "tv" : previous.get("media") === "movie" ? "movie" : "all",
    period: previous.get("period") === "week" ? "week" : "day",
  });
  const actual = new URLSearchParams(current);
  expected.sort(); actual.sort();
  return actual.toString() === expected.toString() ? catalogReturnHref("/", previous, remember) : null;
}

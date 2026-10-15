import test from "node:test";
import assert from "node:assert/strict";
import { buildSearchHref, clearedNameSearchHref, normalizeNameSearchHref } from "../lib/navigation";
import { buildCatalogRequest, parseFilters } from "../lib/query";
import { DEFAULT_FILTERS } from "../lib/types";
import { CATALOG_MEDIA_MEMORY, CATALOG_SOURCE_MEMORY, catalogNavigationHref, catalogReturnHref, rememberCatalogLocation } from "../lib/catalog-navigation";

test("global search clears discover constraints and starts with all media", () => {
  const href = buildSearchHref("/discover", new URLSearchParams("media=tv&genres=18&scoreMin=8&sort=vote_average.desc&page=4"), " 暗黑 ");
  const filters = parseFilters(new URL(href, "http://localhost").searchParams);
  assert.equal(buildCatalogRequest(filters).path, "/search/multi");
  assert.equal(filters.query, "暗黑");
  assert.deepEqual(filters.genres, []);
  assert.equal(filters.scoreMin, "");
  assert.equal(filters.page, 1);
});

test("default movie page searches both movies and TV", () => {
  const href = buildSearchHref("/", new URLSearchParams(), "星际穿越");
  assert.equal(buildCatalogRequest(parseFilters(new URL(href, "http://localhost").searchParams)).path, "/search/multi");
});

test("every new name search starts with all media even after manually filtering prior results", () => {
  for (const path of ["/movie/157336", "/tv/1399", "/", "/discover"]) {
    const href = buildSearchHref(path, new URLSearchParams("media=tv&query=旧搜索&source=douban&chart=genres&collection=film_genre_32"), "Inception");
    const params = new URL(href, "http://localhost").searchParams;
    assert.equal(params.get("media"), "all");
    assert.equal(params.has("source"), false);
    assert.equal(params.has("collection"), false);
    assert.equal(buildCatalogRequest(parseFilters(params)).path, "/search/multi");
    params.set("media", "tv");
    assert.equal(buildCatalogRequest(parseFilters(params)).path, "/search/tv");
    params.set("media", "movie");
    assert.equal(buildCatalogRequest(parseFilters(params)).path, "/search/movie");
  }
});

test("favorite search keeps local filters and clearing removes the query", () => {
  const current = new URLSearchParams("media=tv&genres=18&page=3");
  const searched = new URL(buildSearchHref("/favorites", current, "暗黑"), "http://localhost");
  assert.equal(searched.pathname, "/favorites");
  assert.equal(searched.searchParams.get("genres"), "18");
  assert.equal(searched.searchParams.has("page"), false);
  const cleared = new URL(buildSearchHref("/favorites", searched.searchParams, ""), "http://localhost");
  assert.equal(cleared.searchParams.has("query"), false);
  assert.equal(cleared.searchParams.get("genres"), "18");
});


test("explicit combined search remains available without a separate homepage", () => {
  const href = buildSearchHref("/", new URLSearchParams("media=all"), "星际穿越");
  assert.equal(buildCatalogRequest(parseFilters(new URL(href, "http://localhost").searchParams)).path, "/search/multi");
  assert.equal(buildCatalogRequest(parseFilters(new URLSearchParams())).path, "/trending/movie/day");
});

function catalogMemory() {
  const values = new Map<string, string>();
  return { values, read: (key: string) => values.get(key), visit: (href: string) => {
    const url = new URL(href, "https://frame.test");
    rememberCatalogLocation(url.pathname, url.searchParams, (key, value) => values.set(key, value));
  } };
}

test("Douban and IMDB chart choices survive TMDB search, Discover and detail routes", () => {
  for (const source of ["douban", "imdb"]) {
    const memory = catalogMemory();
    const movie = source === "douban" ? "/?source=douban&media=movie&chart=genres&page=2&group=悬疑&collection=film_genre_32"
      : "/?source=imdb&media=movie&chart=popular&sort=num_votes&page=3";
    const tv = source === "douban" ? "/?source=douban&media=tv&chart=weekly&page=1&collection=tv_american"
      : "/?source=imdb&media=tv&chart=top&sort=user_rating&page=2";
    memory.visit(movie); memory.visit(tv);
    const expectedMovie = `/?${new URL(movie, "https://frame.test").searchParams}`;
    const expectedTv = `/?${new URL(tv, "https://frame.test").searchParams}`;
    const before = [...memory.values];
    for (const href of ["/?media=all&query=暗黑", "/discover?media=movie&genres=18", "/movie/411088", "/tv/1399?source=tmdb", "/lists"]) {
      memory.visit(href);
      const url = new URL(href, "https://frame.test");
      assert.equal(catalogNavigationHref("movie", url.pathname, url.searchParams, memory.read), expectedMovie);
      assert.equal(catalogNavigationHref("tv", url.pathname, url.searchParams, memory.read), expectedTv);
      assert.deepEqual([...memory.values], before);
    }
    assert.equal(memory.read(CATALOG_SOURCE_MEMORY), source);
    assert.equal(memory.read(CATALOG_MEDIA_MEMORY), "tv");
  }
});

test("clearing or submitting an empty global search returns to the remembered chart and media", () => {
  const memory = catalogMemory();
  const board = "/?source=imdb&media=tv&chart=popular&sort=num_votes&page=3";
  memory.visit(board);
  for (const query of ["", "   "]) {
    assert.equal(buildSearchHref("/", new URLSearchParams("media=all&query=暗黑"), query, memory.read), board);
    assert.equal(buildSearchHref("/", new URLSearchParams(board.slice(2)), query, memory.read), board);
    assert.equal(buildSearchHref("/discover", new URLSearchParams("media=tv&genres=18"), query, memory.read), board);
  }
  assert.equal(catalogReturnHref("/", new URLSearchParams("media=all&chart=trending"), memory.read), board);
  // Brand links deliberately target movies, but keep the selected provider.
  const brand = new URL(catalogNavigationHref("movie", "/", new URLSearchParams("media=all&query=暗黑"), memory.read), "https://frame.test");
  assert.equal(brand.searchParams.get("source"), "imdb");
  assert.equal(brand.searchParams.get("media"), "movie");
  assert.equal(brand.searchParams.has("query"), false);
});

test("only real chart navigation changes provider memory, and provider histories stay independent", () => {
  const memory = catalogMemory();
  const douban = "/?source=douban&media=movie&chart=weekly&collection=movie_weekly_best&page=1";
  const imdb = "/?source=imdb&media=movie&chart=top&sort=rank&page=2";
  memory.visit(douban); memory.visit(imdb);
  for (const route of ["/?source=douban&query=test", "/?chart=discover", "/?media=all", "/discover", "/favorites"]) memory.visit(route);
  assert.equal(memory.read(CATALOG_SOURCE_MEMORY), "imdb");
  assert.equal(memory.read("catalog-location:movie:douban"), douban);
  assert.equal(memory.read("catalog-location:movie:imdb"), imdb);
  memory.visit("/?media=movie&chart=trending&period=week");
  assert.equal(memory.read(CATALOG_SOURCE_MEMORY), "tmdb");
  assert.equal(memory.read("catalog-location:movie:douban"), douban);
});

test("a different media type without history receives compatible provider defaults", () => {
  const memory = catalogMemory();
  memory.visit("/?source=douban&media=movie&chart=top&page=4");
  const tv = new URL(catalogNavigationHref("tv", "/discover", new URLSearchParams(), memory.read), "https://frame.test");
  assert.equal(tv.searchParams.get("source"), "douban");
  assert.equal(tv.searchParams.get("media"), "tv");
  assert.equal(tv.searchParams.get("chart"), "weekly");
  assert.equal(tv.searchParams.get("page"), "1");
});

test("older provider search links become valid TMDB queries without losing an explicit media filter", () => {
  for (const source of ["douban", "imdb"]) {
    const href = normalizeNameSearchHref(new URLSearchParams(`source=${source}&media=tv&chart=genres&group=悬疑&sort=U&query=暗黑`));
    assert.ok(href);
    const params = new URL(href, "https://frame.test").searchParams;
    assert.equal(params.has("source"), false);
    assert.equal(params.get("media"), "tv");
    assert.equal(buildCatalogRequest(parseFilters(params)).path, "/search/tv");
  }
  assert.equal(normalizeNameSearchHref(new URLSearchParams("media=movie&query=暗黑")), null);
});

test("empty-result filter reset returns to saved charts even after selecting movie or TV search results", () => {
  const memory = catalogMemory();
  const movie = "/?source=douban&media=movie&chart=weekly&collection=movie_weekly_best&page=1";
  const tv = "/?source=douban&media=tv&chart=weekly&collection=tv_american&page=1";
  memory.visit(movie); memory.visit(tv);
  for (const media of ["all", "movie", "tv"]) {
    const previous = new URLSearchParams(`chart=trending&media=${media}&period=day&query=没有结果&genreLogic=${DEFAULT_FILTERS.genreLogic}&sort=popularity.desc`);
    const cleared = new URLSearchParams(previous); cleared.delete("query");
    assert.equal(clearedNameSearchHref(previous, cleared, memory.read), media === "movie" ? movie : tv);
    assert.equal(clearedNameSearchHref(previous, new URLSearchParams("source=tmdb&media=movie&chart=top"), memory.read), null);
    assert.equal(clearedNameSearchHref(previous, new URLSearchParams("media=movie&chart=top"), memory.read), null);
  }
});

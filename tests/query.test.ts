import assert from "node:assert/strict";
import test from "node:test";
import { buildCatalogRequest, parseFilters, QueryError } from "../lib/query";

const filters = (query: string) => parseFilters(new URLSearchParams(query));

test("filters have stable defaults and validate numeric ranges", () => {
  assert.equal(filters("").chart, "trending");
  assert.equal(filters("page=2").page, 2);
  for (const query of ["page=0", "page=501", "page=", "page=-1", "scoreMin=11", "scoreMin=foo", "votesMin=2.5", "runtimeMin=-1", "yearFrom=2020&yearTo=2010", "scoreMin=9&scoreMax=8", "genres=28|53", "media=person", "chart=../account", "page=1&page=2", "language=zh-CN", "region=China", "sort=random"]) {
    assert.throws(() => filters(query), QueryError, query);
  }
});

test("each chart maps to its real movie/TV endpoint", () => {
  const cases = [
    ["", "/trending/movie/day"], ["period=week&media=tv", "/trending/tv/week"],
    ["media=all", "/trending/all/day"], ["chart=popular", "/movie/popular"],
    ["chart=top&media=tv", "/tv/top_rated"], ["chart=now", "/movie/now_playing"],
    ["chart=now&media=tv", "/tv/on_the_air"], ["chart=upcoming", "/movie/upcoming"],
    ["chart=upcoming&media=tv", "/tv/airing_today"],
  ];
  for (const [query, path] of cases) assert.equal(buildCatalogRequest(filters(query)).path, path);
});

test("discover uses server-side AND/OR, date, rating, country, language, keywords and runtime filters", () => {
  const request = buildCatalogRequest(filters("chart=discover&genres=28,53&genreLogic=or&yearFrom=1990&yearTo=2020&scoreMin=7.5&scoreMax=9&votesMin=500&region=us&language=en&keywords=34,56&runtimeMin=90&runtimeMax=160&sort=vote_average.desc&page=2"));
  assert.equal(request.path, "/discover/movie");
  for (const [key, value] of Object.entries({ with_genres: "28|53", "primary_release_date.gte": "1990-01-01", "primary_release_date.lte": "2020-12-31", "vote_average.gte": "7.5", "vote_average.lte": "9", "vote_count.gte": "500", with_origin_country: "US", with_original_language: "en", with_keywords: "34,56", "with_runtime.gte": "90", "with_runtime.lte": "160", sort_by: "vote_average.desc", page: "2" })) {
    assert.equal(request.params.get(key), value, key);
  }
  assert.equal(buildCatalogRequest(filters("chart=discover&genres=28,53&genreLogic=and")).params.get("with_genres"), "28,53");
  const tv = buildCatalogRequest(filters("chart=discover&media=tv&yearFrom=2010&sort=release_date.desc&keywords=12|34"));
  assert.equal(tv.params.get("first_air_date.gte"), "2010-01-01");
  assert.equal(tv.params.get("sort_by"), "first_air_date.desc");
  assert.equal(tv.params.get("with_keywords"), "12|34");
  assert.equal(tv.ranked, false);
});

test("search cannot silently ignore advanced filters and all cannot run single-media charts", () => {
  const search = buildCatalogRequest(filters("media=all&query=星际穿越"));
  assert.equal(search.path, "/search/multi");
  assert.equal(search.params.get("query"), "星际穿越");
  assert.equal(search.ranked, false);
  for (const query of ["query=film&genres=28", "query=film&sort=vote_average.desc", "chart=popular&genres=28", "chart=top&media=all", "chart=discover&media=all", "chart=favorites", "chart=discover&media=tv&sort=revenue.desc"]) {
    assert.throws(() => buildCatalogRequest(filters(query)), QueryError, query);
  }
});

test("unrelated UI state is ignored but cannot choose a TMDB path", () => {
  const request = buildCatalogRequest(filters("view=list&source=demo&path=https://example.com&media=movie"));
  assert.equal(request.path, "/trending/movie/day");
});

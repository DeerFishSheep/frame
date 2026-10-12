import test from "node:test";
import assert from "node:assert/strict";
import { buildSearchHref } from "../lib/navigation";
import { buildCatalogRequest, parseFilters } from "../lib/query";

test("global search clears discover constraints and preserves media", () => {
  const href = buildSearchHref("/discover", new URLSearchParams("media=tv&genres=18&scoreMin=8&sort=vote_average.desc&page=4"), " 暗黑 ");
  const filters = parseFilters(new URL(href, "http://localhost").searchParams);
  assert.equal(buildCatalogRequest(filters).path, "/search/tv");
  assert.equal(filters.query, "暗黑");
  assert.deepEqual(filters.genres, []);
  assert.equal(filters.scoreMin, "");
  assert.equal(filters.page, 1);
});

test("homepage search includes both films and television", () => {
  const href = buildSearchHref("/", new URLSearchParams(), "星际穿越");
  assert.equal(buildCatalogRequest(parseFilters(new URL(href, "http://localhost").searchParams)).path, "/search/multi");
});

test("search on a detail page uses the detail media type", () => {
  const href = buildSearchHref("/movie/157336", new URLSearchParams(), "Inception");
  assert.equal(new URL(href, "http://localhost").searchParams.get("media"), "movie");
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

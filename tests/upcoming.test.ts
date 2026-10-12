import assert from "node:assert/strict";
import test from "node:test";
import { getTomorrowDate } from "../lib/date-filters";
import { cardNumber } from "../lib/media-presentation";
import { buildCatalogRequest, parseFilters, QueryError } from "../lib/query";
import { createTmdbClient } from "../lib/tmdb/client";
import { createTmdbService } from "../lib/tmdb/service";

const beforeMidnight = new Date("2026-10-12T15:59:59Z");
const afterMidnight = new Date("2026-10-12T16:00:00Z");
const filters = (query: string) => parseFilters(new URLSearchParams(query), beforeMidnight);
const json = (value: unknown) => new Response(JSON.stringify(value), {
  headers: { "Content-Type": "application/json" },
});

test("tomorrow advances the Beijing calendar across midnight, month end, leap day, and year end", () => {
  const cases = [
    ["2026-10-12T15:59:59Z", "2026-10-13"],
    ["2026-10-12T16:00:00Z", "2026-10-14"],
    ["2026-04-30T04:00:00Z", "2026-05-01"],
    ["2024-02-28T04:00:00Z", "2024-02-29"],
    ["2024-02-28T16:00:00Z", "2024-03-01"],
    ["2025-02-28T04:00:00Z", "2025-03-01"],
    ["2026-12-31T04:00:00Z", "2027-01-01"],
  ];
  for (const [instant, expected] of cases) {
    assert.equal(getTomorrowDate(new Date(instant)), expected, instant);
  }
});

test("movie upcoming requests future primary dates, theatrical releases, and popularity order", () => {
  const request = buildCatalogRequest(filters("chart=upcoming&media=movie"), beforeMidnight);
  assert.equal(request.path, "/discover/movie");
  assert.equal(request.mediaType, "movie");
  assert.equal(request.ranked, false);
  for (const [key, expected] of Object.entries({
    include_adult: "false", include_video: "false", language: "zh-CN", page: "1",
    with_release_type: "2|3", "primary_release_date.gte": "2026-10-13", sort_by: "popularity.desc",
  })) {
    assert.equal(request.params.get(key), expected, key);
  }
  assert.equal(request.params.has("primary_release_date.lte"), false);
  assert.equal(request.params.has("release_date.lte"), false);
  assert.equal(request.params.has("release_date.gte"), false);
});

test("upcoming pagination keeps the same cutoff and ordering instead of filtering individual loaded pages", () => {
  const first = buildCatalogRequest(filters("chart=upcoming"), beforeMidnight);
  const second = buildCatalogRequest(filters("chart=upcoming&page=2"), beforeMidnight);
  assert.equal(second.path, first.path);
  assert.equal(second.params.get("page"), "2");
  first.params.delete("page");
  second.params.delete("page");
  assert.deepEqual([...second.params], [...first.params]);
});

test("upcoming changes its cutoff after Beijing midnight even with the same restored filter", () => {
  const restored = filters("chart=upcoming&media=movie");
  assert.equal(restored.dateFrom, "");
  assert.equal(restored.dateTo, "");
  assert.equal(buildCatalogRequest(restored, beforeMidnight).params.get("primary_release_date.gte"), "2026-10-13");
  assert.equal(buildCatalogRequest(restored, afterMidnight).params.get("primary_release_date.gte"), "2026-10-14");
});

test("the new upcoming cutoff leaves now playing, TV schedules, and other rankings intact", () => {
  const cases = [
    ["", "/trending/movie/day"], ["media=tv&period=week", "/trending/tv/week"],
    ["chart=popular", "/movie/popular"], ["chart=top", "/movie/top_rated"],
    ["chart=now", "/movie/now_playing"], ["chart=now&media=tv", "/tv/on_the_air"],
    ["chart=upcoming&media=tv", "/tv/airing_today"],
  ];
  for (const [query, path] of cases) {
    const request = buildCatalogRequest(filters(query), beforeMidnight);
    assert.equal(request.path, path, query);
    assert.equal(request.ranked, true, query);
    assert.equal(request.params.has("primary_release_date.gte"), false, query);
    assert.equal(request.params.has("primary_release_date.lte"), false, query);
    assert.equal(request.params.has("with_release_type"), false, query);
  }
});

test("name searches are not constrained by upcoming dates and explicit advanced filters still require discover", () => {
  for (const query of ["query=film", "chart=upcoming&query=film", "chart=upcoming&media=tv&query=film"]) {
    const parsed = filters(query);
    const request = buildCatalogRequest(parsed, beforeMidnight);
    assert.equal(request.path, parsed.media === "tv" ? "/search/tv" : "/search/movie", query);
    assert.equal(request.ranked, false, query);
    assert.equal(request.params.has("primary_release_date.gte"), false, query);
    assert.equal(request.params.has("with_release_type"), false, query);
  }
  for (const query of ["chart=upcoming&genres=28", "chart=upcoming&dateFrom=2026-10-13", "chart=upcoming&sort=primary_release_date.asc"]) {
    assert.throws(() => buildCatalogRequest(filters(query), beforeMidnight), QueryError, query);
  }
});

test("date-specific upcoming requests do not reuse an earlier day's cache entry", async () => {
  const urls: string[] = [];
  const client = createTmdbClient({
    token: "test-token", now: () => beforeMidnight.getTime(),
    fetchImpl: async url => {
      urls.push(String(url));
      return json({ page: 1, total_pages: 1, total_results: 0, results: [] });
    },
  });
  const parsed = filters("chart=upcoming");
  const first = buildCatalogRequest(parsed, beforeMidnight);
  const second = buildCatalogRequest(parsed, afterMidnight);
  await client.request(first.path, first.params);
  await client.request(first.path, first.params);
  await client.request(second.path, second.params);
  assert.equal(urls.length, 2);
  assert.equal(new URL(urls[0]).searchParams.get("primary_release_date.gte"), "2026-10-13");
  assert.equal(new URL(urls[1]).searchParams.get("primary_release_date.gte"), "2026-10-14");
});

test("custom upcoming results retain provider order without acquiring official ranks", async () => {
  const service = createTmdbService(createTmdbClient({
    token: "test-token",
    fetchImpl: async url => {
      const request = new URL(String(url));
      assert.equal(request.pathname, "/3/discover/movie");
      assert.equal(request.searchParams.get("sort_by"), "popularity.desc");
      assert.equal(request.searchParams.get("page"), "2");
      return json({
        page: 2, total_pages: 3, total_results: 42,
        results: [
          { id: 900, title: "热度较高", release_date: "2099-10-20", popularity: 100 },
          { id: 901, title: "上映较早", release_date: "2098-11-10", popularity: 50 },
        ],
      });
    },
  }));
  const catalog = await service.catalog(filters("chart=upcoming&page=2"));
  assert.deepEqual(catalog.results.map(item => item.id), [900, 901]);
  assert.equal(catalog.page, 2);
  assert.equal(catalog.totalPages, 3);
  assert.equal(catalog.totalResults, 42);
  catalog.results.forEach((item, index) => {
    assert.equal(item.rank, undefined);
    const number = cardNumber(item, true, 21 + index);
    assert.equal(number?.kind, "result");
    assert.equal(number?.text, `#${21 + index}`);
    assert.match(number!.label, /非官方榜单名次/);
  });
});

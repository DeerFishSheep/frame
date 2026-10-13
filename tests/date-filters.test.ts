import assert from "node:assert/strict";
import test from "node:test";
import { getTodayDate, isCalendarDate, matchesDateRange, resolveDateTo } from "../lib/date-filters";
import { getDemoCatalog } from "../lib/demo";
import { buildCatalogRequest, parseFilters, QueryError } from "../lib/query";
import { serializeFilters } from "../lib/ui";

const beforeMidnight = new Date("2026-10-12T15:59:59Z");
const afterMidnight = new Date("2026-10-12T16:00:00Z");
const filters = (query: string, now = beforeMidnight) => parseFilters(new URLSearchParams(query), now);

test("today follows the Shanghai calendar across midnight without freezing at module load", () => {
  assert.equal(getTodayDate(beforeMidnight), "2026-10-12");
  assert.equal(getTodayDate(afterMidnight), "2026-10-13");
  assert.equal(getTodayDate(new Date("2026-12-31T16:00:00Z")), "2027-01-01");
});

test("calendar dates require full real dates within 1800 through 2200", () => {
  for (const date of ["1800-01-01", "2000-02-29", "2024-02-29", "2026-10-12", "2200-12-31"]) {
    assert.equal(isCalendarDate(date), true, date);
  }
  for (const date of ["", "today", "1799-12-31", "2201-01-01", "1900-02-29", "2100-02-29", "2023-02-29", "2026-02-30", "2026-04-31", "2026-00-01", "2026-13-01", "2026-01-00", "2026-1-01", "2026", "2026-10-12T00:00:00Z", "2026-10-12 "]) {
    assert.equal(isCalendarDate(date), false, date);
  }
});

test("today end dates stay dynamic while explicit end dates remain fixed", () => {
  assert.equal(resolveDateTo("today", "2026-10-12"), "2026-10-12");
  assert.equal(resolveDateTo("today", "2026-10-13"), "2026-10-13");
  assert.equal(resolveDateTo("2026-10-12", "2026-10-13"), "2026-10-12");
  assert.equal(resolveDateTo("", "2026-10-13"), "");
});

test("date ranges include both boundary days and exclude unknown or invalid dates when constrained", () => {
  assert.equal(matchesDateRange("2024-02-29", "2024-02-29", "2024-03-01"), true);
  assert.equal(matchesDateRange("2024-03-01", "2024-02-29", "2024-03-01"), true);
  assert.equal(matchesDateRange("2024-02-28", "2024-02-29", "2024-03-01"), false);
  assert.equal(matchesDateRange("2024-03-02", "2024-02-29", "2024-03-01"), false);
  assert.equal(matchesDateRange("2024-02-29", "2024-02-29", ""), true);
  assert.equal(matchesDateRange("2024-02-29", "", "2024-02-29"), true);
  for (const date of ["", "2024", "2024-02-30"]) {
    assert.equal(matchesDateRange(date, "2024-01-01", ""), false, date);
    assert.equal(matchesDateRange(date, "", "2024-12-31"), false, date);
  }
  assert.equal(matchesDateRange("", "", ""), true);
});

test("shared range matching updates a today boundary across days", () => {
  assert.equal(matchesDateRange("2026-10-13", "", "today", "2026-10-12"), false);
  assert.equal(matchesDateRange("2026-10-13", "", "today", "2026-10-13"), true);
  assert.equal(matchesDateRange("2026-10-13", "", "2026-10-12", "2026-10-13"), false);
});

test("date query validation rejects invalid dates, repeated parameters, and reverse ranges", () => {
  for (const query of [
    "dateFrom=2023-02-29", "dateTo=2026-04-31", "dateFrom=2026-1-01", "dateTo=2026",
    "dateFrom=1799-12-31", "dateTo=2201-01-01", "dateFrom=today",
    "dateFrom=2026-10-13&dateTo=2026-10-12", "dateFrom=2026-10-13&dateTo=today",
    "dateFrom=2026-01-01&dateFrom=2026-01-02", "dateTo=today&dateTo=2026-10-12",
  ]) {
    assert.throws(() => filters(`chart=discover&${query}`), QueryError, query);
  }
  const valid = filters("chart=discover&dateFrom=2024-02-29&dateTo=2024-02-29");
  assert.equal(valid.dateFrom, "2024-02-29");
  assert.equal(valid.dateTo, "2024-02-29");
});

test("only discover without a name search receives the dynamic default end date", () => {
  assert.equal(filters("chart=discover").dateTo, "today");
  for (const query of ["", "chart=popular", "chart=top", "chart=now", "chart=upcoming", "chart=favorites", "query=film", "chart=discover&query=film"]) {
    const parsed = filters(query);
    assert.equal(parsed.dateFrom, "", query);
    assert.equal(parsed.dateTo, "", query);
  }
  const search = buildCatalogRequest(filters("chart=discover&query=film"), beforeMidnight);
  assert.equal(search.path, "/search/movie");
  assert.equal(search.params.has("primary_release_date.lte"), false);
});

test("legacy year links retain whole-year bounds and current-year end dates become dynamic", () => {
  const old = filters("chart=discover&yearFrom=1990&yearTo=2020");
  assert.equal(old.dateFrom, "1990-01-01");
  assert.equal(old.dateTo, "2020-12-31");
  const current = filters("chart=discover&yearFrom=2026&yearTo=2026");
  assert.equal(current.dateFrom, "2026-01-01");
  assert.equal(current.dateTo, "today");
  const future = filters("chart=discover&yearTo=2027");
  assert.equal(future.dateTo, "2027-12-31");
});

test("new complete-date fields take precedence over matching legacy year fields", () => {
  const parsed = filters("chart=discover&yearFrom=1990&yearTo=2020&dateFrom=2024-02-29&dateTo=2024-03-01");
  assert.equal(parsed.dateFrom, "2024-02-29");
  assert.equal(parsed.dateTo, "2024-03-01");
  assert.equal(filters("chart=discover&yearTo=2020&dateTo=today").dateTo, "today");
});

test("movie and TV discover requests send exact inclusive calendar bounds", () => {
  const movie = buildCatalogRequest(filters("chart=discover&dateFrom=2024-02-29&dateTo=2024-03-01"), beforeMidnight);
  assert.equal(movie.path, "/discover/movie");
  assert.equal(movie.params.get("primary_release_date.gte"), "2024-02-29");
  assert.equal(movie.params.get("primary_release_date.lte"), "2024-03-01");
  assert.equal(movie.params.has("first_air_date.gte"), false);
  const tv = buildCatalogRequest(filters("chart=discover&media=tv&dateFrom=2024-02-29&dateTo=2024-03-01"), beforeMidnight);
  assert.equal(tv.path, "/discover/tv");
  assert.equal(tv.params.get("first_air_date.gte"), "2024-02-29");
  assert.equal(tv.params.get("first_air_date.lte"), "2024-03-01");
  assert.equal(tv.params.has("primary_release_date.gte"), false);
});

test("the same dynamic filter resolves at request time while an explicit date does not move", () => {
  const dynamic = filters("chart=discover&dateTo=today");
  assert.equal(buildCatalogRequest(dynamic, beforeMidnight).params.get("primary_release_date.lte"), "2026-10-12");
  assert.equal(buildCatalogRequest(dynamic, afterMidnight).params.get("primary_release_date.lte"), "2026-10-13");
  const fixed = filters("chart=discover&dateTo=2026-10-12");
  assert.equal(buildCatalogRequest(fixed, afterMidnight).params.get("primary_release_date.lte"), "2026-10-12");
});

test("default end dates leave all original ranking endpoint paths intact", () => {
  const cases = [
    ["", "/trending/movie/day"], ["period=week", "/trending/movie/week"],
    ["media=tv", "/trending/tv/day"], ["media=tv&period=week", "/trending/tv/week"],
    ["chart=popular", "/movie/popular"], ["chart=top&media=tv", "/tv/top_rated"],
    ["chart=now", "/movie/now_playing"], ["chart=now&media=tv", "/tv/on_the_air"],
    ["chart=upcoming", "/discover/movie"], ["chart=upcoming&media=tv", "/tv/airing_today"],
  ];
  for (const [query, path] of cases) {
    const request = buildCatalogRequest(filters(query), beforeMidnight);
    assert.equal(request.path, path, query);
    assert.equal(request.params.has("primary_release_date.lte"), false, query);
    assert.equal(request.params.has("first_air_date.lte"), false, query);
  }
});

test("date filter links preserve today semantics and explicit dates when restored on a later day", () => {
  const dynamic = filters("chart=discover&dateFrom=2024-02-29&dateTo=today");
  const link = serializeFilters(dynamic);
  assert.equal(link.get("dateFrom"), "2024-02-29");
  assert.equal(link.get("dateTo"), "today");
  assert.equal(link.has("yearFrom"), false);
  assert.equal(link.has("yearTo"), false);
  const restored = parseFilters(new URLSearchParams(link), afterMidnight);
  assert.equal(restored.dateTo, "today");
  assert.equal(buildCatalogRequest(restored, afterMidnight).params.get("primary_release_date.lte"), "2026-10-13");
  const fixed = filters("chart=discover&dateFrom=2024-02-29&dateTo=2024-03-01");
  assert.deepEqual(parseFilters(serializeFilters(fixed), afterMidnight), fixed);
});

test("preview filtering compares full movie dates and includes both selected boundary days", () => {
  const sameDay = getDemoCatalog(filters("chart=discover&dateFrom=2014-11-04&dateTo=2014-11-04"));
  assert.deepEqual(sameDay.results.map(item => item.id), [157336]);
  const twoDates = getDemoCatalog(filters("chart=discover&dateFrom=2014-10-10&dateTo=2014-11-04"));
  assert.deepEqual(twoDates.results.map(item => item.id).sort((a, b) => Number(a) - Number(b)), [157336, 244786]);
  const after = getDemoCatalog(filters("chart=discover&dateFrom=2014-11-05&dateTo=2014-11-30"));
  assert.equal(after.totalResults, 0);
});

test("preview filtering uses full TV premiere dates instead of only the release year", () => {
  const exact = getDemoCatalog(filters("chart=discover&media=tv&dateFrom=2017-12-01&dateTo=2017-12-01"));
  assert.deepEqual(exact.results.map(item => item.id), [70523]);
  const before = getDemoCatalog(filters("chart=discover&media=tv&dateFrom=2017-01-01&dateTo=2017-11-30"));
  assert.equal(before.totalResults, 0);
});

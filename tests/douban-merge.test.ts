import assert from "node:assert/strict";
import test from "node:test";
import { buildDoubanRequest, defaultDoubanFilters, doubanParams, migrateDoubanPopularHref, parseDoubanFilters, visibleDoubanCharts } from "../lib/douban/query";
import { doubanFilterRows, selectDoubanFilter } from "../lib/douban/filter-options";
import { catalogSourceHref } from "../lib/catalog-sources";

const parse = (query: string) => parseDoubanFilters(new URLSearchParams(query));
const fromHref = (href: string) => parseDoubanFilters(new URL(href, "https://frame.local").searchParams);

test("one visible movie recommendation entry defaults to popular while TV still defaults to weekly", () => {
  const movie = defaultDoubanFilters("movie");
  assert.deepEqual([movie.chart, movie.category, movie.area, movie.sort, movie.page], ["recommend", "热门", "全部", "recommend", 1]);
  assert.deepEqual(defaultDoubanFilters("movie", "recommend"), movie);
  assert.equal(defaultDoubanFilters("tv").chart, "weekly");
  const charts = visibleDoubanCharts("movie");
  assert.equal(charts.some(chart => chart.value === "popular"), false);
  assert.equal(charts.filter(chart => chart.value === "recommend").length, 1);
});

test("merged popular exposes effective sorts and sends each area, sort and page to hot_gaia", () => {
  for (const sort of ["recommend", "time", "rank"]) {
    const filters = parse(`chart=recommend&category=热门&area=韩国&sort=${sort}&page=3`);
    const rows = doubanFilterRows(filters);
    assert.deepEqual(rows.map(row => row.key).sort(), ["area", "category", "sort"]);
    assert.deepEqual(rows.find(row => row.key === "sort")!.options.map(option => option.value), ["recommend", "time", "rank"]);
    const url = new URL(buildDoubanRequest(filters).url);
    assert.equal(url.pathname, "/rexxar/api/v2/movie/hot_gaia");
    assert.equal(url.searchParams.get("sort"), sort);
    assert.equal(url.searchParams.get("area"), "韩国");
    assert.equal(url.searchParams.get("start"), "40");
    assert.equal(url.searchParams.has("category"), false);
    assert.deepEqual(parseDoubanFilters(doubanParams(filters)), filters);
  }
});

test("non-popular recent categories keep their own endpoint and never advertise ignored sorting", () => {
  for (const category of ["最新", "豆瓣高分", "冷门佳片"]) {
    const filters = parse(`chart=recommend&category=${category}&area=欧美&page=2`);
    assert.deepEqual(doubanFilterRows(filters).map(row => row.key).sort(), ["area", "category"]);
    const url = new URL(buildDoubanRequest(filters).url);
    assert.equal(url.pathname, "/rexxar/api/v2/subject/recent_hot/movie");
    assert.equal(url.searchParams.get("category"), category);
    assert.equal(url.searchParams.get("type"), "欧美");
    assert.equal(url.searchParams.has("sort"), false);
    for (const sort of ["rank", "time", "recommend", "S", "U"]) {
      assert.throws(() => parse(`chart=recommend&category=${category}&sort=${sort}`));
      assert.throws(() => selectDoubanFilter(filters, "sort", sort));
    }
    assert.deepEqual(parseDoubanFilters(doubanParams(filters)), filters);
  }
});

test("all category preserves advanced filters and its separate sort domain", () => {
  for (const sort of ["U", "T", "R", "S"]) {
    const filters = parse(`media=movie&chart=recommend&category=全部&genre=悬疑&region=美国&year=2025&score=8&sort=${sort}&page=2`);
    const url = new URL(buildDoubanRequest(filters).url);
    assert.equal(url.pathname, "/rexxar/api/v2/movie/recommend");
    assert.equal(url.searchParams.get("tags"), "悬疑,美国,2025");
    assert.equal(url.searchParams.get("score_range"), "8,10");
    assert.equal(url.searchParams.get("sort"), sort);
    assert.equal(url.searchParams.get("start"), "20");
    assert.deepEqual(parseDoubanFilters(doubanParams(filters)), filters);
    assert.throws(() => selectDoubanFilter(filters, "sort", "rank"));
  }
  assert.throws(() => parse("chart=recommend&category=全部&sort=rank"));
  assert.throws(() => parse("chart=recommend&category=热门&sort=S"));
});

test("category switches reset incompatible sort domains and hidden tags without mutating prior state", () => {
  const all = parse("chart=recommend&category=全部&genre=悬疑&region=美国&year=2025&score=8&sort=S&page=4");
  const popular = selectDoubanFilter(all, "category", "热门");
  assert.deepEqual(popular, defaultDoubanFilters("movie"));
  assert.equal(all.sort, "S"); assert.equal(all.page, 4);
  const ranked = selectDoubanFilter(selectDoubanFilter(popular, "area", "韩国"), "sort", "rank");
  const latest = selectDoubanFilter(ranked, "category", "最新");
  assert.equal(latest.sort, "U");
  assert.equal(latest.page, 1);
  assert.equal(doubanParams(latest).has("sort"), false);
  const restored = selectDoubanFilter(ranked, "category", "全部");
  assert.deepEqual(restored, parse("chart=recommend&category=全部"));
  assert.equal(selectDoubanFilter(latest, "category", "热门").sort, "recommend");
});

test("legacy popular URLs migrate with valid area, sort and page intact and become idempotent", () => {
  for (const sort of ["recommend", "time", "rank"]) {
    const legacy = `/?source=douban&media=movie&chart=popular&area=韩国&sort=${sort}&page=3`;
    const migrated = migrateDoubanPopularHref(legacy);
    const filters = fromHref(migrated);
    assert.deepEqual([filters.chart, filters.category, filters.area, filters.sort, filters.page], ["recommend", "热门", "韩国", sort, 3]);
    assert.equal(migrateDoubanPopularHref(migrated), migrated);
    const oldRequest = new URL(buildDoubanRequest(fromHref(legacy)).url);
    const newRequest = new URL(buildDoubanRequest(filters).url);
    assert.equal(newRequest.href, oldRequest.href);
  }
});

test("invalid legacy parameters fall back to movie default without redirect loops or affecting other URLs", () => {
  for (const query of ["area=invalid", "sort=S", "page=0", "page=501", "sort=time&sort=rank", "genre=喜剧", "media=tv"]) {
    const migrated = migrateDoubanPopularHref(`/?source=douban&chart=popular&${query}`);
    assert.deepEqual(fromHref(migrated), defaultDoubanFilters("movie"), query);
    assert.equal(migrateDoubanPopularHref(migrated), migrated);
  }
  for (const href of ["/?source=imdb&chart=popular", "/?chart=popular", "/?source=douban&chart=weekly", "/lists", "/discover?source=douban&chart=popular", "https://external.example/?source=douban&chart=popular", "//external.example/?source=douban&chart=popular"]) {
    assert.equal(migrateDoubanPopularHref(href), href);
  }
});

test("source switching migrates remembered popular filters and defaults into the merged chart", () => {
  const current = new URLSearchParams("source=imdb&media=movie&chart=top");
  const remembered = "/?source=douban&media=movie&chart=popular&area=日本&sort=time&page=4";
  const selected = fromHref(catalogSourceHref("douban", current, () => remembered));
  assert.deepEqual([selected.chart, selected.category, selected.area, selected.sort, selected.page], ["recommend", "热门", "日本", "time", 4]);
  assert.deepEqual(fromHref(catalogSourceHref("douban", current, () => undefined)), defaultDoubanFilters("movie"));
  assert.deepEqual(fromHref(catalogSourceHref("douban", current, () => "/?source=douban&chart=popular&sort=bad")), defaultDoubanFilters("movie"));
  assert.deepEqual(fromHref(catalogSourceHref("douban", new URL(remembered, "https://frame.local").searchParams, () => undefined)), selected);
});

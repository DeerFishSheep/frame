import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { doubanFilterRows } from "../lib/douban/filter-options";
import { DOUBAN_OPTIONS, defaultDoubanFilters, doubanChart, parseDoubanFilters, visibleDoubanCharts } from "../lib/douban/query";
import { ProviderCatalogResults } from "../components/provider-catalog";
import type { CatalogView } from "../lib/catalog-view";

const genre = (media: "movie" | "tv", group: string) => parseDoubanFilters(new URLSearchParams({ media, chart: "genres", group }));
const labels = (media: "movie" | "tv", group: string) => doubanFilterRows(genre(media, group)).find(row => row.key === "collection")!.options.map(option => option.title);

test("Douban visible chart labels and order match each media without changing their IDs", () => {
  assert.deepEqual(visibleDoubanCharts("movie").map(({ value, title }) => [value, title]), [
    ["recommend", "选电影"], ["weekly", "一周口碑"], ["now", "影院热映"], ["genres", "类型榜单"], ["top", "TOP 250"],
  ]);
  assert.deepEqual(visibleDoubanCharts("tv").map(({ value, title }) => [value, title]), [
    ["recommend", "选电视剧"], ["weekly", "一周口碑"], ["genres", "类型榜单"],
  ]);
  assert.equal(doubanChart(defaultDoubanFilters("movie", "recommend")).title, "选电影");
  assert.equal(doubanChart(defaultDoubanFilters("tv", "recommend")).title, "选电视剧");
  assert.equal(doubanChart(defaultDoubanFilters("movie", "top")).title, "TOP 250 电影");
});

test("specific-board chips remove only the selected group suffix and leave source titles intact", () => {
  const before = JSON.stringify(DOUBAN_OPTIONS.genres);
  assert.equal(labels("movie", "喜剧")[0], "近期热门榜");
  assert.ok(labels("movie", "喜剧").includes("中国大陆榜"));
  assert.equal(labels("movie", "短片")[0], "高分经典榜");
  assert.equal(labels("tv", "大陆剧")[0], "近期热门榜");
  assert.ok(labels("tv", "美剧").includes("喜剧榜"));
  assert.equal(labels("tv", "动画剧集")[0], "高分经典榜");
  assert.equal(doubanChart(genre("movie", "喜剧")).title, "近期热门喜剧片榜");
  assert.equal(doubanChart(genre("movie", "短片")).title, "高分经典短片榜");
  assert.equal(doubanChart(genre("tv", "大陆剧")).title, "近期热门大陆剧榜");
  assert.equal(JSON.stringify(DOUBAN_OPTIONS.genres), before);
});

test("one-item genre boards stay visible while the single movie weekly picker stays hidden", () => {
  for (const media of ["movie", "tv"] as const) for (const group of DOUBAN_OPTIONS.genres[media]) {
    const rows = doubanFilterRows(genre(media, group.value));
    assert.ok(rows.some(row => row.key === "collection" && row.options.length === group.boards.length));
  }
  assert.deepEqual(doubanFilterRows(defaultDoubanFilters("movie", "weekly")), []);
});

test("provider notices are omitted while cache and failure/retry information remain visible", () => {
  const current: CatalogView = { results: [], page: 1, totalPages: 1, totalResults: 0, source: "douban", stale: true,
    retrievedAt: "2026-10-15T00:00:00Z", notice: "部分作品暂无本站详情，点击可在豆瓣查看。",
    context: { title: "榜单", featuredLabel: "榜单", ranked: true, startPage: 1, feature: false } };
  const props = { current, source: "douban" as const, loading: false, layout: "grid" as const, page: 1, countLabel: "原榜", retry() {}, onReset() {} };
  const success = renderToStaticMarkup(createElement(ProviderCatalogResults, props));
  assert.match(success, /缓存数据/);
  assert.doesNotMatch(success, /provider-notice|部分作品暂无本站详情/);
  const failure = renderToStaticMarkup(createElement(ProviderCatalogResults, { ...props, error: "数据请求失败" }));
  assert.match(failure, /数据请求失败/);
  assert.match(failure, /重试/);
  assert.doesNotMatch(failure, /provider-notice|部分作品暂无本站详情/);
});

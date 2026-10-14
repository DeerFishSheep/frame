import assert from "node:assert/strict";
import test from "node:test";
import { doubanFilterRows, selectDoubanFilter } from "../lib/douban/filter-options";
import { DOUBAN_OPTIONS, buildDoubanRequest, defaultDoubanFilters, doubanCharts, doubanParams, parseDoubanFilters, visibleDoubanCharts, type DoubanFilters } from "../lib/douban/query";
import { catalogSourceHref, isHiddenDoubanHref } from "../lib/catalog-sources";

const parse = (query: string) => parseDoubanFilters(new URLSearchParams(query));
const keys = (filters: DoubanFilters) => doubanFilterRows(filters).map(row => row.key).sort();
const roundTrip = (filters: DoubanFilters) => assert.deepEqual(parseDoubanFilters(doubanParams(filters)), filters);

test("movie weekly needs no picker while all four TV weekly collections remain directly selectable", () => {
  assert.deepEqual(doubanFilterRows(defaultDoubanFilters("movie", "weekly")), []);
  const filters = defaultDoubanFilters("tv", "weekly");
  const rows = doubanFilterRows(filters);
  assert.deepEqual(rows.map(row => row.key), ["collection"]);
  assert.deepEqual(rows[0].options.map(option => option.value), [
    "tv_chinese_best_weekly", "tv_global_best_weekly", "show_chinese_best_weekly", "show_global_best_weekly",
  ]);
  for (const option of rows[0].options) {
    const selected = selectDoubanFilter({ ...filters, page: 3 }, "collection", option.value);
    assert.equal(selected.collection, option.value);
    assert.equal(new URL(buildDoubanRequest(selected).url).pathname, `/rexxar/api/v2/subject_collection/${option.value}/items`);
    roundTrip(selected);
  }
  assert.deepEqual(doubanFilterRows(defaultDoubanFilters("movie", "top")), []);
  assert.deepEqual(doubanFilterRows(defaultDoubanFilters("movie", "now")), []);
});

test("popular exposes every area and sort and preserves independent selections when paging resets", () => {
  const filters = parse("chart=popular&area=韩国&sort=time&page=3");
  const rows = doubanFilterRows(filters);
  assert.deepEqual(keys(filters), ["area", "sort"]);
  assert.deepEqual(rows.find(row => row.key === "area")!.options, DOUBAN_OPTIONS.popular.area);
  assert.deepEqual(rows.find(row => row.key === "sort")!.options, DOUBAN_OPTIONS.popular.sort);
  const selected = selectDoubanFilter(filters, "sort", "rank");
  assert.deepEqual(selected, { ...filters, sort: "rank", page: 1 });
  assert.equal(filters.page, 3);
  assert.equal(selectDoubanFilter(filters, "sort", "time"), filters);
  roundTrip(selected);
});

test("changing genre group replaces its dependent board and all 298 boards remain reachable by tags", () => {
  let visited = 0;
  for (const media of ["movie", "tv"] as const) {
    const base = defaultDoubanFilters(media, "genres");
    const groups = DOUBAN_OPTIONS.genres[media];
    assert.deepEqual(doubanFilterRows(base).find(row => row.key === "group")!.options.map(option => option.value), groups.map(group => group.value));
    for (const group of groups) {
      const grouped = selectDoubanFilter(base, "group", group.value);
      assert.equal(grouped.collection, group.boards[0].value);
      const row = doubanFilterRows(grouped).find(row => row.key === "collection");
      if (group.boards.length === 1) assert.equal(row, undefined);
      else assert.deepEqual(row!.options, group.boards);
      for (const board of group.boards) {
        const selected = row ? selectDoubanFilter(grouped, "collection", board.value) : grouped;
        assert.equal(selected.collection, board.value);
        assert.equal(new URL(buildDoubanRequest(selected).url).pathname, `/rexxar/api/v2/subject_collection/${board.value}/items`);
        roundTrip(selected); visited++;
      }
    }
    const priorGroup = groups.find(group => group.boards.length > 1)!;
    const otherGroup = groups.find(group => group.value !== priorGroup.value)!;
    const before = parseDoubanFilters(new URLSearchParams({ media, chart: "genres", group: priorGroup.value, collection: priorGroup.boards[1].value, page: "4" }));
    const after = selectDoubanFilter(before, "group", otherGroup.value);
    assert.equal(after.collection, otherGroup.boards[0].value);
    assert.equal(after.page, 1);
  }
  assert.equal(visited, 298);
});

test("recommendation tags expose all endpoint choices without adding unsupported combinations", () => {
  for (const media of ["movie", "tv"] as const) {
    const filters = defaultDoubanFilters(media, "recommend");
    assert.deepEqual(keys(filters), ["category", "genre", ...(media === "tv" ? ["platform"] : []), "region", "score", "sort", "year"]);
    const options = DOUBAN_OPTIONS.recommend[media];
    for (const row of doubanFilterRows(filters)) {
      const expected = row.key === "platform" ? DOUBAN_OPTIONS.recommend.tv.platform : options[row.key as keyof typeof options];
      assert.deepEqual(row.options.map(option => option.value), expected.map(option => option.value));
      for (const option of row.options) roundTrip(selectDoubanFilter(filters, row.key, option.value));
    }
    for (const category of options.category.filter(option => option.value !== "全部")) {
      const selected = selectDoubanFilter(filters, "category", category.value);
      assert.deepEqual(keys(selected), media === "movie" ? ["area", "category"] : ["category"]);
      const request = new URL(buildDoubanRequest(selected).url);
      assert.equal(request.pathname, `/rexxar/api/v2/subject/recent_hot/${media}`);
      assert.equal(request.searchParams.get("tags"), null);
      roundTrip(selected);
    }
  }
});

test("category transitions discard stale fields and returning to all starts from valid defaults", () => {
  for (const media of ["movie", "tv"] as const) {
    const initial = parse(`media=${media}&chart=recommend&genre=悬疑&region=美国&year=2025&sort=S&score=8&page=4${media === "tv" ? "&platform=HBO" : ""}`);
    const selected = selectDoubanFilter(initial, "category", media === "movie" ? "最新" : "tv_korean");
    assert.deepEqual([selected.genre, selected.region, selected.year, selected.platform, selected.sort, selected.score, selected.page], ["", "", "", "", "U", "4", 1]);
    assert.equal(selected.area, "全部");
    const withArea = media === "movie" ? selectDoubanFilter(selected, "area", "韩国") : selected;
    const restored = selectDoubanFilter(withArea, "category", "全部");
    assert.deepEqual(restored, defaultDoubanFilters(media, "recommend"));
    roundTrip(restored);
  }
});

test("changing one recommendation tag preserves others and produces the exact server query after refresh", () => {
  const filters = parse("media=tv&chart=recommend&genre=悬疑&region=美国&year=2025&platform=HBO&sort=S&score=8&page=4");
  const selected = selectDoubanFilter(filters, "year", "2024");
  assert.deepEqual(selected, { ...filters, year: "2024", page: 1 });
  const refreshed = parseDoubanFilters(doubanParams(selected));
  const url = new URL(buildDoubanRequest(refreshed).url);
  assert.equal(url.searchParams.get("tags"), "悬疑,美国,2024,HBO");
  assert.equal(url.searchParams.get("score_range"), "8,10");
  assert.equal(url.searchParams.get("sort"), "S");
  assert.equal(url.searchParams.get("start"), "0");
});

test("tag changes reject hidden fields, cross-group boards and invalid values before serialization", () => {
  const popular = defaultDoubanFilters("movie", "popular");
  for (const [key, value] of [["genre", "喜剧"], ["genre", ""], ["page", "3"], ["media", "tv"], ["chart", "recommend"], ["area", "not-an-area"], ["sort", "S"]] as const) {
    assert.throws(() => selectDoubanFilter(popular, key, value), `${key}=${value}`);
  }
  assert.throws(() => selectDoubanFilter(defaultDoubanFilters("movie", "weekly"), "collection", "movie_weekly_best"));
  assert.throws(() => selectDoubanFilter(defaultDoubanFilters("movie", "recommend"), "platform", "HBO"));
  assert.throws(() => selectDoubanFilter(defaultDoubanFilters("tv", "recommend"), "score", "10"));
  const filtered = selectDoubanFilter(defaultDoubanFilters("tv", "recommend"), "category", "tv");
  assert.throws(() => selectDoubanFilter(filtered, "genre", "喜剧"));
  const groups = DOUBAN_OPTIONS.genres.movie;
  const grouped = defaultDoubanFilters("movie", "genres");
  const foreignBoard = groups.flatMap(group => group.boards).find(board => !groups[0].boards.some(current => current.value === board.value))!;
  assert.throws(() => selectDoubanFilter(grouped, "collection", foreignBoard.value));
});

test("visible chart navigation hides realtime and lists without deleting API compatibility", () => {
  assert.deepEqual(visibleDoubanCharts("movie").map(chart => chart.value), ["popular", "weekly", "top", "now", "genres", "recommend"]);
  assert.deepEqual(visibleDoubanCharts("tv").map(chart => chart.value), ["weekly", "genres", "recommend"]);
  assert.equal(defaultDoubanFilters("tv").chart, "weekly");
  for (const media of ["movie", "tv"] as const) {
    assert.ok(doubanCharts(media).some(chart => chart.value === "realtime"));
    const legacy = parse(`media=${media}&chart=realtime`);
    assert.equal(legacy.chart, "realtime");
    assert.ok(buildDoubanRequest(legacy).url.includes("real_time_hotest"));
  }
});

test("switching source skips hidden Douban history but preserves visible chart conditions", () => {
  for (const media of ["movie", "tv"] as const) {
    const current = new URLSearchParams({ source: "imdb", media, chart: "popular" });
    for (const chart of ["realtime", "lists"]) {
      const remembered = `/?source=douban&media=${media}&chart=${chart}`;
      assert.equal(isHiddenDoubanHref(remembered), true);
      assert.equal(catalogSourceHref("douban", current, () => remembered), `/?source=douban&media=${media}&chart=${media === "movie" ? "popular" : "weekly"}`);
    }
    const weekly = `/?source=douban&media=${media}&chart=weekly&page=2`;
    assert.equal(isHiddenDoubanHref(weekly), false);
    assert.equal(catalogSourceHref("douban", current, () => weekly), weekly);
  }
  assert.equal(isHiddenDoubanHref("/lists/douban/doulist-240612"), false);
  assert.equal(isHiddenDoubanHref("/?source=tmdb&chart=realtime"), false);
});

import assert from "node:assert/strict";
import test from "node:test";
import { DOUBAN_OPTIONS, buildDoubanRequest, defaultDoubanFilters, doubanChart, doubanCharts, doubanListUrl, doubanParams, parseDoubanFilters, parseDoubanListUrl } from "../lib/douban/query";
import { createDoubanClient, parseDoubanPage } from "../lib/douban/client";
import { normalizeDoubanItem, enrichDoubanMedia } from "../lib/douban/normalize";
import { createDoubanService } from "../lib/douban/service";
import { exactMediaMatch } from "../lib/media-match";
import { imageUrl, mediaHref, mediaKey, type Media } from "../lib/types";
import { parseFavorites, toggleFavorite, sameFavorite } from "../lib/favorites";
import { catalogSourceHref, formatCatalogTitle } from "../lib/catalog-sources";

const parse = (query: string) => parseDoubanFilters(new URLSearchParams(query));
// Minimal public fields from the real movie_top250 response; no reviews or user records.
const subject = { id: "1292052", type: "movie", title: "肖申克的救赎", rank: 1, card_subtitle: "1994 / 美国 / 剧情 犯罪 / 弗兰克·德拉邦特 / 蒂姆·罗宾斯",
  rating: { value: 9.7, count: 3350350 }, cover_url: "https://img3.doubanio.com/view/photo/m_ratio_poster/public/p2934829882.jpg" };
const response = (items: unknown[] = [subject], total = items.length, start = 0) => ({ start, count: items.length, total, subject_collection_items: items });
const movie = () => normalizeDoubanItem(subject, "movie")!;

test("all nine module functions have routes and movie-only charts never appear as TV charts", () => {
  assert.equal(doubanCharts("movie").length, 8);
  assert.deepEqual(doubanCharts("tv").map(x => x.value), ["realtime", "weekly", "genres", "recommend", "lists"]);
  for (const media of ["movie", "tv"] as const) for (const chart of doubanCharts(media)) {
    const filters = defaultDoubanFilters(media, chart.value);
    assert.deepEqual(parseDoubanFilters(doubanParams(filters)), filters);
    assert.equal(new URL(buildDoubanRequest(filters).url).origin, "https://m.douban.com");
  }
  assert.throws(() => parse("media=tv&chart=top"));
});

test("the complete 26 movie / 10 TV category matrix keeps all 298 module board IDs addressable", () => {
  assert.equal(DOUBAN_OPTIONS.genres.movie.length, 26); assert.equal(DOUBAN_OPTIONS.genres.tv.length, 10);
  let count = 0;
  for (const media of ["movie", "tv"] as const) for (const group of DOUBAN_OPTIONS.genres[media]) for (const board of group.boards) {
    const filters = parseDoubanFilters(new URLSearchParams({ media, chart: "genres", group: group.value, collection: board.value }));
    assert.equal(doubanChart(filters).title, board.title);
    assert.equal(new URL(buildDoubanRequest(filters).url).pathname, `/rexxar/api/v2/subject_collection/${board.value}/items`);
    count++;
  }
  assert.equal(count, 298);
});

test("custom lists accept official desktop, mobile and app-dispatch links without forwarding arbitrary URLs", () => {
  assert.equal(parseDoubanListUrl("https://www.douban.com/doulist/240612/?dt_dapp=1"), "doulist:240612");
  assert.equal(parseDoubanListUrl("https://m.douban.com/subject_collection/movie_top250"), "collection:movie_top250");
  assert.equal(parseDoubanListUrl("https://www.douban.com/doubanapp/dispatch?uri=%2Fsubject_collection%2Fmovie_top250%3Ffoo%3Dbar"), "collection:movie_top250");
  for (const url of ["https://douban.com.evil.test/doulist/1", "https://evil.test/?uri=/doulist/1", "https://user@www.douban.com/doulist/1/", "http://127.0.0.1/doulist/1/", "javascript:alert(1)", "https://www.douban.com:8000/doulist/1", "https://movie.douban.com/subject/1292052/", "https://www.douban.com/doulist/1/extra"]) assert.throws(() => parseDoubanListUrl(url), url);
  assert.equal(DOUBAN_OPTIONS.lists.length, 8);
  for (const list of DOUBAN_OPTIONS.lists) assert.equal(parseDoubanListUrl(doubanListUrl(list.value)), list.value);
});

test("strict query validation rejects unused filters, repeated values, mixed categories and invalid pages", () => {
  for (const q of ["source=imdb", "media=all", "page=0", "page=1.5", "page=501", "chart=top&page=14", "chart=top&sort=rank", "chart=lists&url=https://localhost", "chart=lists&list=collection:../movie", "chart=genres&group=剧情&collection=movie_comedy", "chart=weekly&collection=tv_global_best_weekly", "sort=recommend&sort=rank", "chart=recommend&score=10", "chart=recommend&platform=HBO", "media=tv&chart=recommend&category=tv&genre=喜剧"]) assert.throws(() => parse(q), q);
});

test("recommendation filters and page offsets are sent upstream rather than filtering a local sample", () => {
  const filters = parse("media=tv&chart=recommend&genre=悬疑&region=美国&year=2025&platform=HBO&sort=S&score=0&page=3");
  const url = new URL(buildDoubanRequest(filters).url);
  assert.equal(url.pathname, "/rexxar/api/v2/tv/recommend");
  assert.equal(url.searchParams.get("tags"), "悬疑,美国,2025,HBO");
  assert.equal(url.searchParams.get("score_range"), "0,10");
  assert.equal(url.searchParams.get("sort"), "S"); assert.equal(url.searchParams.get("start"), "40");
  const recent = new URL(buildDoubanRequest(parse("chart=recommend&category=最新&area=韩国")).url);
  assert.equal(recent.pathname, "/rexxar/api/v2/subject/recent_hot/movie");
  assert.equal(recent.searchParams.get("type"), "韩国");
});

test("real-time and weekly variants preserve the module's collection IDs", () => {
  for (const option of DOUBAN_OPTIONS.realtime.hot_type) {
    const filters = parseDoubanFilters(new URLSearchParams({ media: option.value.startsWith("tv_") ? "tv" : "movie", chart: "realtime", collection: option.value }));
    assert.ok(buildDoubanRequest(filters).url.includes(`/subject_collection/${option.value}/items?`));
  }
  for (const option of DOUBAN_OPTIONS.weekly.list_type) {
    const media = option.value.startsWith("movie_") ? "movie" : "tv";
    assert.equal(doubanChart(parseDoubanFilters(new URLSearchParams({ media, chart: "weekly", collection: option.value }))).title, option.title);
  }
});

test("normalization uses a doulist target ID, retains the original rating and never invents a January 1 date", () => {
  const item = normalizeDoubanItem({ ...subject, id: "1929216", target_id: "1292052", url: "https://movie.douban.com/subject/1292052/" }, "tv")!;
  assert.equal(item.id, "douban:1292052"); assert.equal(item.mediaType, "movie");
  assert.deepEqual([item.voteAverage, item.voteCount, item.year, item.releaseDate], [9.7, 3350350, "1994", ""]);
  assert.deepEqual(item.genres, ["剧情", "犯罪"]); assert.deepEqual(item.countryCodes, ["US"]);
  assert.equal(normalizeDoubanItem({ ...subject, year: "2024", release_date: "02.29" }, "movie")!.releaseDate, "2024-02-29");
  assert.equal(normalizeDoubanItem({ ...subject, year: "2023", release_date: "02.29" }, "movie")!.releaseDate, "");
});

test("mixed lists unwrap targets, omit non-film items and deduplicate by subject, not row ID", () => {
  const filters = defaultDoubanFilters("movie", "lists");
  const data = parseDoubanPage({ total: 5, start: 0, items: [{ target: subject }, { subject: { ...subject, id: "2", type: "tv" } }, { ...subject }, { ...subject, id: "3", type: "book" }, { ...subject, type: "ad" }] }, filters);
  assert.deepEqual(data.items.map(x => [x.doubanId, x.mediaType]), [["1292052", "movie"], ["2", "tv"]]);
  assert.equal(data.omitted, 3); assert.equal(data.total, 5); assert.equal(data.hasMore, false);
});

test("pagination distinguishes exact totals, unknown totals, empty pages and mismatched upstream offsets", () => {
  const filters = defaultDoubanFilters("movie", "recommend"), entries = Array.from({ length: 20 }, (_, i) => ({ ...subject, id: String(i + 1) }));
  assert.equal(parseDoubanPage({ items: entries, start: 0 }, filters).hasMore, true);
  assert.equal(parseDoubanPage({ items: entries, start: 0 }, filters).totalExact, false);
  assert.equal(parseDoubanPage(response([], 50, 20), { ...filters, page: 2 }).hasMore, false);
  assert.throws(() => parseDoubanPage(response(entries), { ...filters, page: 2 }));
  assert.throws(() => parseDoubanPage({ error: "blocked" }, filters));
});

test("TMDB enrichment preserves Douban identity, original score, count, name and rank", () => {
  const original = movie();
  const match: Media = { ...original, id: 278, title: "Other title", voteAverage: 8.7, voteCount: 10, source: "tmdb", rank: 20, releaseDate: "1994-09-23" };
  const combined = enrichDoubanMedia(original, match);
  assert.deepEqual([combined.id, combined.title, combined.source, combined.voteAverage, combined.voteCount, combined.rank], [278, original.title, "douban", 9.7, 3350350, 1]);
  assert.equal(mediaKey(combined), mediaKey(original)); assert.equal(mediaHref(combined), "/movie/278");
  assert.equal(mediaHref(original), "https://movie.douban.com/subject/1292052/");
  assert.equal(enrichDoubanMedia(original, null), original);
});

test("matching accepts only a unique exact name and year and rejects ambiguous remakes", () => {
  const item = { ...movie(), id: 278, source: "tmdb" as const };
  assert.equal(exactMediaMatch([item], "肖申克的救赎", "1994", "movie"), item);
  assert.equal(exactMediaMatch([item], "肖申克的救赎", "1995", "movie"), null);
  assert.equal(exactMediaMatch([item], "肖申克", "1994", "movie"), null);
  assert.equal(exactMediaMatch([item, { ...item, id: 9 }], item.title, item.year, "movie"), null);
  assert.equal(exactMediaMatch([item], item.title, "", "movie"), null);
});

test("Douban favorites round-trip both matched and unmatched subjects without colliding with TMDB IDs", () => {
  const item = movie(), matched = { ...item, id: 278 };
  assert.deepEqual(parseFavorites(JSON.stringify([item])), [item]);
  assert.deepEqual(parseFavorites(JSON.stringify([matched])), [matched]);
  assert.equal(toggleFavorite([item], matched).length, 0);
  assert.notEqual(mediaKey({ ...matched, doubanId: "2" }), mediaKey(matched));
  assert.equal(parseFavorites(JSON.stringify([{ ...item, id: "douban:2" }])).length, 0);
  assert.equal(parseFavorites(JSON.stringify([{ ...matched, doubanId: "bad" }])).length, 0);
});

test("only trusted HTTPS Douban image hosts and photo paths are displayed", () => {
  assert.equal(imageUrl(subject.cover_url), subject.cover_url);
  const signed = "https://qnmob3-sign.doubanio.com/view/photo/large/public/p1.jpg?sa_ct=123";
  assert.equal(imageUrl(signed), signed);
  for (const path of ["http://img3.doubanio.com/view/photo/a.jpg", "https://img3.doubanio.com.evil.test/view/photo/a.jpg", "https://img3.doubanio.com/api/private", "https://user@img3.doubanio.com/view/photo/a.jpg", "https://img3.doubanio.com:444/view/photo/a.jpg"]) assert.equal(imageUrl(path), null);
});

test("a matched Douban card and its TMDB detail share favorites without merging movie and TV IDs", () => {
  const douban = { ...movie(), id: 278 };
  const tmdb = { ...douban, source: "tmdb" as const, doubanId: undefined };
  assert.equal(sameFavorite(douban, tmdb), true);
  assert.equal(sameFavorite(douban, { ...tmdb, mediaType: "tv" }), false);
  assert.deepEqual(toggleFavorite([douban], tmdb), []);
  assert.deepEqual(parseFavorites(JSON.stringify([douban, tmdb])), [douban]);
});

test("source navigation preserves remembered Douban conditions and adds its shared title prefix exactly once", () => {
  const params = new URLSearchParams("source=imdb&media=tv&chart=top");
  assert.equal(catalogSourceHref("douban", params, () => undefined), "/?source=douban&media=tv&chart=realtime");
  assert.equal(catalogSourceHref("douban", params, () => "/?source=douban&media=tv&chart=weekly"), "/?source=douban&media=tv&chart=weekly");
  assert.equal(formatCatalogTitle("douban", "豆瓣·Top 250 电影"), "豆瓣 · Top 250 电影");
});

test("Douban transport coalesces requests, reuses a bounded fresh cache and never follows redirects", async () => {
  let calls = 0;
  const client = createDoubanClient({ fetchImpl: (async (url, init) => {
    calls++; assert.equal(new URL(String(url)).origin, "https://m.douban.com"); assert.equal(init?.redirect, "error");
    return Response.json(response());
  }) as typeof fetch });
  const filters = defaultDoubanFilters("movie", "top");
  await Promise.all([client.page(filters), client.page(filters)]); await client.page(filters);
  assert.equal(calls, 1);
});

test("upstream failures use only recent successful stale data and never disguise an initial error as an empty list", async () => {
  let now = 0, broken = false;
  const client = createDoubanClient({ now: () => now, fetchImpl: (async () => broken ? new Response("blocked", { status: 403 }) : Response.json(response())) as typeof fetch });
  const filters = defaultDoubanFilters("movie", "top"), initial = await client.page(filters);
  broken = true; now = 11 * 60_000;
  const stale = await client.page(filters); assert.equal(stale.stale, true); assert.equal(stale.retrievedAt, initial.retrievedAt);
  now = 25 * 60 * 60_000; await assert.rejects(client.page(filters), /限制访问/);
  await assert.rejects(client.page(defaultDoubanFilters("movie", "weekly")), /限制访问/);
});

test("service preserves order and unmatched records while limiting enrichment to four concurrent requests", async () => {
  const items = Array.from({ length: 9 }, (_, i) => ({ ...movie(), id: `douban:${i + 1}`, doubanId: String(i + 1), title: `Film ${i + 1}` }));
  let active = 0, max = 0;
  const service = createDoubanService({ page: async () => ({ items, total: 9, totalExact: true, hasMore: false, omitted: 0, retrievedAt: "2026-10-14T00:00:00Z", stale: false }) }, async () => {
    active++; max = Math.max(max, active); await new Promise(resolve => setTimeout(resolve, 1)); active--; throw new Error("TMDB unavailable");
  });
  const page = await service.catalog(defaultDoubanFilters("movie", "top"));
  assert.equal(max, 4); assert.deepEqual(page.results, items); assert.equal(page.source, "douban");
  assert.equal(page.totalPages, 1); assert.match(page.notice!, /豆瓣查看/);
});

import assert from "node:assert/strict";
import test from "node:test";
import { createDoubanClient, DoubanError, parseDoubanPage } from "../lib/douban/client";
import { DOUBAN_OPTIONS, buildDoubanRequest, defaultDoubanFilters, parseDoubanFilters, type DoubanFilters } from "../lib/douban/query";

const parse = (query: string) => parseDoubanFilters(new URLSearchParams(query));
const subject = (id = "1292052") => ({ id, type: "movie", title: "肖申克的救赎", rating: { value: 9.7, count: 3350350 } });
const goodPage = (id = "1292052") => ({ start: 0, total: 1, subject_collection: { id: "movie_weekly_best" }, subject_collection_items: [subject(id)] });
const invalid = (error: unknown) => error instanceof DoubanError && error.status === 502 && error.code === "DOUBAN_INVALID_RESPONSE";

test("weekly, top and all 298 genre boards send their exact collection page as Referer", async () => {
  const filters: DoubanFilters[] = [defaultDoubanFilters("movie", "top")];
  for (const option of DOUBAN_OPTIONS.weekly.list_type) filters.push(parse(`media=${option.value.startsWith("movie_") ? "movie" : "tv"}&chart=weekly&collection=${option.value}`));
  let genres = 0;
  for (const media of ["movie", "tv"] as const) for (const group of DOUBAN_OPTIONS.genres[media]) for (const board of group.boards) {
    filters.push(parseDoubanFilters(new URLSearchParams({ media, chart: "genres", group: group.value, collection: board.value }))); genres++;
  }
  assert.equal(genres, 298);
  for (const filter of filters) for (const page of [1, 2]) {
    const request = buildDoubanRequest({ ...filter, page });
    const url = new URL(request.url), collection = url.pathname.split("/").at(-2)!;
    assert.equal(request.referer, `https://m.douban.com/subject_collection/${collection}`);
    assert.equal(url.searchParams.get("start"), page === 1 ? "0" : "20");
  }
  let sent = 0;
  const client = createDoubanClient({ fetchImpl: (async (url, init) => {
    const collection = new URL(String(url)).pathname.split("/").at(-2)!;
    assert.equal(new Headers(init?.headers).get("referer"), `https://m.douban.com/subject_collection/${collection}`);
    sent++; return Response.json(goodPage());
  }) as typeof fetch });
  for (const chart of ["weekly", "top", "genres"] as const) await client.page(defaultDoubanFilters("movie", chart));
  assert.equal(sent, 3);
});

test("doulist and imported collection pages use their own public source Referers", () => {
  const doulist = buildDoubanRequest(parse("chart=lists&list=doulist:1654175"));
  assert.equal(doulist.referer, "https://www.douban.com/doulist/1654175/");
  const collection = buildDoubanRequest(parse("chart=lists&list=collection:movie_top250"));
  assert.equal(collection.referer, "https://m.douban.com/subject_collection/movie_top250");
});

test("empty collection metadata and empty Top250 first pages are failures, not cached empty success", async () => {
  const softEmpty = { start: 0, total: 0, subject_collection: {}, subject_collection_items: [] };
  for (const chart of ["weekly", "top", "genres"] as const) {
    let calls = 0;
    const filters = defaultDoubanFilters("movie", chart);
    const client = createDoubanClient({ fetchImpl: (async () => Response.json(++calls === 1 ? softEmpty : goodPage())) as typeof fetch });
    await assert.rejects(client.page(filters), invalid);
    const page = await client.page(filters);
    assert.equal(page.items.length, 1); assert.equal(page.stale, false);
    await client.page(filters); assert.equal(calls, 2);
  }
  const top = defaultDoubanFilters("movie", "top");
  assert.throws(() => parseDoubanPage({ start: 0, total: 0, subject_collection_items: [] }, top), invalid);
  assert.throws(() => parseDoubanPage({ start: 0, total: 250, subject_collection: { id: "movie_top250" }, subject_collection_items: [] }, top), invalid);
});

test("HTTP 200 soft error payloads cannot enter the page cache and a retry can recover", async () => {
  for (const payload of [
    { start: 0, total: 0, items: [], error: "denied" },
    { start: 0, total: 0, items: [], code: 403 },
    { start: 0, total: 1, items: [subject()], code: "404" },
  ]) {
    let calls = 0;
    const filters = defaultDoubanFilters("movie", "weekly");
    const client = createDoubanClient({ fetchImpl: (async () => Response.json(++calls === 1 ? payload : goodPage())) as typeof fetch });
    await assert.rejects(client.page(filters), invalid);
    assert.equal((await client.page(filters)).items.length, 1);
    assert.equal(calls, 2);
  }
});

test("soft failures retain a recent real page without replacing it or extending its stale lifetime", async () => {
  let now = 0, calls = 0;
  const client = createDoubanClient({ now: () => now, fetchImpl: (async () => Response.json(++calls === 1 ? goodPage() : { start: 0, total: 0, subject_collection: {}, subject_collection_items: [] })) as typeof fetch });
  const filters = defaultDoubanFilters("movie", "weekly"), initial = await client.page(filters);
  now = 11 * 60_000;
  const stale = await client.page(filters);
  assert.deepEqual(stale.items, initial.items);
  assert.equal(stale.retrievedAt, initial.retrievedAt); assert.equal(stale.stale, true);
  await client.page(filters); assert.equal(calls, 3);
  now = 25 * 60 * 60_000;
  await assert.rejects(client.page(filters), invalid);
});

test("legitimate filter misses, empty public lists and exhausted pagination remain valid", () => {
  const recommend = parse("chart=recommend&category=全部&genre=悬疑&score=9");
  const weekly = defaultDoubanFilters("movie", "weekly"), top = defaultDoubanFilters("movie", "top");
  for (const filters of [recommend, defaultDoubanFilters("movie", "lists")]) {
    const page = parseDoubanPage({ start: 0, total: 0, items: [] }, filters);
    assert.equal(page.items.length, 0); assert.equal(page.total, 0); assert.equal(page.hasMore, false);
  }
  assert.equal(parseDoubanPage({ start: 0, total: 0, subject_collection: { id: "movie_weekly_best" }, subject_collection_items: [] }, weekly).hasMore, false);
  for (const filters of [weekly, top]) {
    const page = parseDoubanPage({ start: 20, total: 20, subject_collection: {}, subject_collection_items: [] }, { ...filters, page: 2 });
    assert.equal(page.items.length, 0); assert.equal(page.hasMore, false);
  }
});

test("the same endpoint with distinct Referers has separate caches and in-flight requests", async () => {
  const legacy = defaultDoubanFilters("movie", "popular"), merged = defaultDoubanFilters("movie", "recommend");
  const a = buildDoubanRequest(legacy), b = buildDoubanRequest(merged);
  assert.equal(a.url, b.url); assert.notEqual(a.referer, b.referer);
  const calls: string[] = [];
  const client = createDoubanClient({ fetchImpl: (async (_url, init) => {
    const referer = new Headers(init?.headers).get("referer")!;
    calls.push(referer); return Response.json(goodPage(referer === a.referer ? "1292052" : "1291546"));
  }) as typeof fetch });
  const [first, second] = await Promise.all([client.page(legacy), client.page(merged)]);
  assert.deepEqual(calls.sort(), [a.referer, b.referer].sort());
  assert.equal(first.items[0].doubanId, "1292052"); assert.equal(second.items[0].doubanId, "1291546");
  assert.equal((await client.page(legacy)).items[0].doubanId, "1292052");
  assert.equal((await client.page(merged)).items[0].doubanId, "1291546");
  assert.equal(calls.length, 2);
});

test("404 diagnostics distinguish ranking requests, public lists and subject details", async () => {
  const client = createDoubanClient({ fetchImpl: (async () => new Response(null, { status: 404 })) as typeof fetch });
  const expected = (word: string) => (error: unknown) => error instanceof DoubanError && error.status === 404 && error.code === "DOUBAN_UPSTREAM_FAILED" && error.message.includes(word);
  for (const chart of ["weekly", "top", "genres"] as const) await assert.rejects(client.page(defaultDoubanFilters("movie", chart)), expected("榜单"));
  await assert.rejects(client.page(defaultDoubanFilters("movie", "lists")), expected("片单"));
  await assert.rejects(client.collection("doulist:1654175"), expected("片单"));
  await assert.rejects(client.subject("movie", "1292052"), expected("作品"));
});

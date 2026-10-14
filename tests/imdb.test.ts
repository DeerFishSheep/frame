import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MediaCard } from "../components/media-card";
import { FrameProvider } from "../components/providers";
import { buildImdbRequest, createImdbClient, ImdbError, parseImdbChart, type ImdbTitle } from "../lib/imdb/client";
import { IMDB_SORTS, imdbChart, imdbParams, parseImdbFilters, type ImdbFilters } from "../lib/imdb/query";
import { createImdbService, imdbMedia } from "../lib/imdb/service";
import { createTmdbClient } from "../lib/tmdb/client";
import { createTmdbService } from "../lib/tmdb/service";
import { cardNumber } from "../lib/media-presentation";
import { imageUrl, mediaHref, mediaKey, type Media } from "../lib/types";
import { parseFavorites, toggleFavorite } from "../lib/favorites";

const filters = (query = "") => parseImdbFilters(new URLSearchParams(query));
const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status });
function payload(count = 3) {
  return { data: { chartTitles: { total: count, edges: Array.from({ length: count }, (_, i) => ({ currentRank: i + 1, node: {
    id: `tt${String(i + 1).padStart(7, "0")}`, titleText: { text: `Film ${i + 1}` },
    ratingsSummary: { aggregateRating: 9.3, voteCount: 200000 }, primaryImage: { url: "https://m.media-amazon.com/images/M/poster.jpg" },
    releaseDate: { year: 2024, month: 2, day: 29 }, releaseYear: { year: 2024 },
    titleGenres: { genres: [{ genre: { text: "Sci-Fi" } }] }, plot: { plotText: { plainText: "Plot" } },
  } })) } } };
}
const title: ImdbTitle = { id: "tt0111161", title: "Original", overview: "IMDB plot", poster: "https://m.media-amazon.com/images/M/poster.jpg", date: "1994-10-14", year: "1994", genres: ["Drama"], rating: 9.3, votes: 3000000, rank: 1 };
const match: Media = { id: 278, mediaType: "movie", title: "中文片名", originalTitle: "Original", posterPath: "/poster.jpg", backdropPath: "/backdrop.jpg", overview: "中文简介", releaseDate: "1994-09-23", year: "1994", genreIds: [18], genres: ["剧情"], voteAverage: 8.7, voteCount: 100, popularity: 80, source: "tmdb" };

test("IMDB accepts exactly the module's four charts, four sorts and bounded pages", () => {
  const types = new Set<string>();
  for (const media of ["movie", "tv"]) for (const chart of ["top", "popular"]) for (const sort of IMDB_SORTS) {
    const state = filters(`media=${media}&chart=${chart}&sort=${sort.value}`);
    assert.deepEqual(parseImdbFilters(imdbParams(state)), state);
    types.add(imdbChart(state).type);
  }
  assert.equal(types.size, 4);
  assert.equal(filters("chart=top&page=13").page, 13);
  for (const query of ["media=all", "chart=now", "sort=vote_average.desc", "page=0", "page=1.5", "page=14", "chart=popular&page=6", "media=movie&media=tv", "sort=rank&sort=popularity", "source=tmdb", "url=https://example.com", "genres=28", "query=film"]) {
    assert.throws(() => filters(query), query);
  }
});

test("IMDB query requests the complete chart with each exact upstream sort direction", () => {
  for (const option of IMDB_SORTS) {
    const url = new URL(buildImdbRequest(filters(`sort=${option.value}`)));
    assert.equal(url.origin, "https://api.graphql.imdb.com");
    assert.deepEqual(JSON.parse(url.searchParams.get("variables")!), { first: 250, sort: { sortBy: option.sortBy, sortOrder: option.sortOrder } });
    assert.ok(url.searchParams.get("query")?.includes("TOP_RATED_MOVIES"));
    assert.ok(!url.search.includes("+"));
  }
  assert.equal(JSON.parse(new URL(buildImdbRequest(filters("media=tv&chart=popular"))).searchParams.get("variables")!).first, 100);
});

test("IMDB parsing keeps full dates and rejects partial, duplicate or GraphQL-error charts", () => {
  const input = payload();
  assert.equal(parseImdbChart(input, 250)[0].date, "2024-02-29");
  input.data.chartTitles.edges[0].node.releaseDate.day = 0;
  assert.equal(parseImdbChart(input, 250)[0].date, "");
  assert.equal(parseImdbChart(input, 250)[0].year, "2024");
  assert.throws(() => parseImdbChart({ ...input, errors: [{ message: "private upstream details" }] }, 250), ImdbError);
  input.data.chartTitles.total = 4;
  assert.throws(() => parseImdbChart(input, 250), ImdbError);
  input.data.chartTitles.total = 3;
  input.data.chartTitles.edges[1].node.id = input.data.chartTitles.edges[0].node.id;
  assert.throws(() => parseImdbChart(input, 250), ImdbError);
  const badVotes = payload(); badVotes.data.chartTitles.edges[0].node.ratingsSummary.voteCount = -1;
  assert.throws(() => parseImdbChart(badVotes, 250), ImdbError);
});

test("IMDB metadata enrichment never replaces original scores, votes or ranks with TMDB values", () => {
  const item = imdbMedia(title, "movie", match);
  assert.equal(item.title, "中文片名");
  assert.equal(item.source, "imdb");
  assert.deepEqual([item.voteAverage, item.voteCount, item.rank, item.imdbId], [9.3, 3000000, 1, "tt0111161"]);
  assert.equal(mediaHref(item), "/movie/278?source=imdb");
  assert.equal(mediaKey(item), mediaKey(match));
  assert.equal(cardNumber(item, true, 4)?.kind, "rank");
  assert.equal(cardNumber(item, false, 4)?.text, "#4");
  assert.equal(imdbMedia({ ...title, rating: 0 }, "movie", match).voteAverage, 0);
});

test("unmatched IMDB entries keep distinct identity, safe original links and persisted favorites", () => {
  const unmatched = imdbMedia(title, "movie", null), matched = imdbMedia(title, "movie", match);
  assert.equal(mediaKey(unmatched), "imdb:tt0111161");
  assert.equal(mediaHref(unmatched), "https://www.imdb.com/title/tt0111161/");
  assert.equal(mediaHref({ id: "javascript:alert(1)", mediaType: "movie" }), "/");
  assert.deepEqual(parseFavorites(JSON.stringify([unmatched, matched])), [unmatched, matched]);
  assert.deepEqual(toggleFavorite([match], matched), []);
  assert.equal(parseFavorites(JSON.stringify([{ ...unmatched, id: "tt9999999" }])).length, 0);
  assert.equal(imageUrl(title.poster), title.poster);
  for (const path of ["https://m.media-amazon.com.evil.test/images/M/a.jpg", "http://m.media-amazon.com/images/M/a.jpg", "https://evil.test/a.jpg", "https://user@m.media-amazon.com/images/M/a.jpg"]) assert.equal(imageUrl(path), null);
});

test("shared media cards label IMDB scores and link unmatched records to the original title", () => {
  const item = imdbMedia(title, "movie", null);
  const html = renderToStaticMarkup(createElement(FrameProvider, { configured: true, children: createElement(MediaCard, { item, resultIndex: 1 }) }));
  assert.match(html, /IMDB 评分 9.3/);
  assert.match(html, /<small>IMDB<\/small>/);
  assert.match(html, /https:\/\/www.imdb.com\/title\/tt0111161\//);
  assert.ok(!html.includes("/movie/tt"));
});

test("complete chart pagination keeps all 250 positions, including ten entries on the last page", async () => {
  let requests = 0;
  const client = createImdbClient({ fetchImpl: async () => { requests++; return json(payload(250)); } });
  const service = createImdbService(client, async () => null);
  const seen: string[] = [];
  for (let page = 1; page <= 13; page++) {
    const result = await service.catalog(filters(`page=${page}`));
    assert.equal(result.results.length, page === 13 ? 10 : 20);
    assert.equal(result.results[0].rank, (page - 1) * 20 + 1);
    assert.equal(result.totalPages, 13);
    seen.push(...result.results.map(item => item.imdbId!));
  }
  assert.equal(new Set(seen).size, 250);
  assert.equal(requests, 1);
});

test("popular charts stop at 100 and do not map entries outside the requested page", async () => {
  let calls = 0;
  const service = createImdbService(createImdbClient({ fetchImpl: async () => json(payload(100)) }), async () => { calls++; return null; });
  const result = await service.catalog(filters("media=tv&chart=popular&page=5"));
  assert.equal(result.totalPages, 5); assert.equal(result.results.length, 20); assert.equal(calls, 20);
  assert.equal(result.results[19].rank, 100);
});

test("TMDB mapping runs at bounded concurrency, preserves order and retains failed entries", async () => {
  let active = 0, max = 0;
  const service = createImdbService(createImdbClient({ fetchImpl: async () => json(payload(20)) }), async id => {
    active++; max = Math.max(max, active);
    await new Promise(resolve => setTimeout(resolve, Number(id.slice(-1)) % 3));
    active--;
    if (id.endsWith("3")) throw new Error("lookup failed");
    return null;
  });
  const result = await service.catalog(filters());
  assert.ok(max <= 6); assert.equal(result.results.length, 20);
  assert.deepEqual(result.results.map(item => item.rank), Array.from({ length: 20 }, (_, i) => i + 1));
  assert.match(result.notice!, /保留原榜/);
});

test("IMDB cache deduplicates concurrent loads and stale failures preserve original retrieval time", async () => {
  let time = 0, calls = 0, fail = false;
  const client = createImdbClient({ now: () => time, sleep: async () => {}, fetchImpl: async () => {
    calls++; await Promise.resolve(); return fail ? json({ errors: [{ message: "error" }] }) : json(payload());
  } });
  const [first, second] = await Promise.all([client.chart(filters()), client.chart(filters("page=2"))]);
  assert.equal(calls, 1); assert.equal(first.retrievedAt, second.retrievedAt);
  time = 31 * 60000; fail = true;
  const stale = await client.chart(filters());
  assert.equal(stale.stale, true); assert.equal(stale.retrievedAt, first.retrievedAt);
  time = 25 * 3600000;
  await assert.rejects(client.chart(filters()), ImdbError);
});

test("IMDB retries rate limits once, sanitizes errors, and keeps sort caches separate", async () => {
  let calls = 0;
  const client = createImdbClient({ sleep: async () => {}, fetchImpl: async () => ++calls === 1 ? json({}, 429) : json(payload()) });
  await client.chart(filters()); assert.equal(calls, 2);
  await client.chart(filters("sort=num_votes")); assert.equal(calls, 3);
  const failing = createImdbClient({ sleep: async () => {}, fetchImpl: async () => { throw new Error("private-proxy-string"); } });
  await assert.rejects(failing.chart(filters()), (err: unknown) => err instanceof ImdbError && !err.message.includes("private"));
});

test("TMDB external ID lookup uses the requested media type and validates both the ID and response", async () => {
  const paths: URL[] = [];
  const service = createTmdbService(createTmdbClient({ token: "test-token", fetchImpl: async input => {
    paths.push(new URL(String(input)));
    return json({ movie_results: [{ id: 2, title: "movie" }], tv_results: [{ id: 3, name: "series" }] });
  } }));
  assert.equal((await service.findByImdbId("tt1234567", "tv"))?.id, 3);
  assert.equal(paths[0].pathname, "/3/find/tt1234567"); assert.equal(paths[0].searchParams.get("external_source"), "imdb_id");
  await assert.rejects(service.findByImdbId("../../movie/1", "movie"));
  const bad = createTmdbClient({ token: "test-token", fetchImpl: async () => json({ results: [] }) });
  await assert.rejects(bad.request("/find/tt1234567"));
});

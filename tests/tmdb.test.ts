import assert from "node:assert/strict";
import test from "node:test";
import { parseFilters } from "../lib/query";
import { createTmdbClient, TmdbError } from "../lib/tmdb/client";
import { apiError } from "../lib/tmdb/http";
import { normalizeDetail, normalizeMedia } from "../lib/tmdb/normalize";
import { createTmdbService } from "../lib/tmdb/service";

const fixture = { id: 42, title: "中文片名", original_title: "Original", release_date: "2024-06-01", genre_ids: [18, 878], vote_average: 8.3, vote_count: 1000, poster_path: "/abc.jpg" };
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers: { "Content-Type": "application/json" } });
const options = (fetchImpl: typeof fetch) => ({ token: "test-token", fetchImpl });

test("normalizes movie/TV identity, Chinese fallback and distinct genre structures", () => {
  const movie = normalizeMedia(fixture, "movie", 21);
  assert.deepEqual([movie.id, movie.mediaType, movie.title, movie.rank, movie.year, movie.source], [42, "movie", "中文片名", 21, "2024", "tmdb"]);
  assert.deepEqual(movie.genres, ["剧情", "科幻"]);
  const tv = normalizeMedia({ id: 42, name: "", original_name: "TV Original", first_air_date: "2020-01-01", genres: [{ id: 10765, name: "科幻奇幻" }], poster_path: "https://bad.example/img" }, "tv");
  assert.equal(tv.title, "TV Original");
  assert.deepEqual(tv.genreIds, [10765]);
  assert.equal(tv.posterPath, null);
  assert.equal(tv.rank, undefined);
});

test("detail tolerates missing data and maps appended detail resources", () => {
  const detail = normalizeDetail({ ...fixture, runtime: 125, imdb_id: "tt12345", credits: { crew: [{ job: "Director", name: "导演" }], cast: [{ id: 3, name: "演员", character: "角色", profile_path: "/actor.jpg" }] }, keywords: { keywords: [{ id: 4, name: "time travel" }] }, images: { backdrops: [{ file_path: "/scene.jpg" }] }, recommendations: { results: [fixture] } }, "movie");
  assert.equal(detail.runtime, 125);
  assert.deepEqual(detail.directors, ["导演"]);
  assert.deepEqual(detail.images, ["/scene.jpg"]);
  assert.equal(detail.keywords[0].id, 4);
  assert.equal(detail.imdbId, "tt12345");
  assert.equal(normalizeDetail({}, "tv").runtime, null);
  assert.equal(normalizeDetail({}, "tv").numberOfSeasons, null);
  assert.deepEqual(normalizeDetail({}, "tv").cast, []);
});

test("mixed trend pagination removes people without changing real rank positions", async () => {
  const service = createTmdbService(createTmdbClient(options(async () => json({ page: 2, total_pages: 10, total_results: 200, results: [{ id: 1, media_type: "person", name: "person" }, { ...fixture, media_type: "movie" }, { id: 42, media_type: "tv", name: "series" }] }))));
  const catalog = await service.catalog(parseFilters(new URLSearchParams("media=all&page=2")));
  assert.deepEqual(catalog.results.map((item) => [item.mediaType, item.id, item.rank]), [["movie", 42, 22], ["tv", 42, 23]]);
  assert.equal(catalog.totalPages, 10);
  assert.equal(catalog.source, "tmdb");
});

test("missing credentials returns 503 and never requests or substitutes demo", async () => {
  let calls = 0;
  const client = createTmdbClient({ token: "", fetchImpl: async () => { calls++; return json({}); } });
  await assert.rejects(client.request("/movie/popular"), (error: unknown) => error instanceof TmdbError && error.status === 503 && error.code === "TMDB_NOT_CONFIGURED");
  assert.equal(calls, 0);
  const response = apiError(new TmdbError("配置缺失", "TMDB_NOT_CONFIGURED", 503));
  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), { error: "配置缺失", code: "TMDB_NOT_CONFIGURED" });
});

test("v3 API key authenticates server requests without entering returned data", async () => {
  const params = new URLSearchParams({ language: "zh-CN" });
  const client = createTmdbClient({ apiKey: " test-api-key ", fetchImpl: async (url, init) => {
    const request = new URL(String(url));
    assert.equal(request.origin, "https://api.themoviedb.org");
    assert.equal(request.searchParams.get("api_key"), "test-api-key");
    assert.equal(request.searchParams.get("language"), "zh-CN");
    assert.equal(new Headers(init?.headers).has("Authorization"), false);
    return json({ results: [fixture] });
  } });
  const result = await client.request("/trending/movie/day", params);
  assert.equal(JSON.stringify(result).includes("test-api-key"), false);
  assert.equal(params.has("api_key"), false);
});

test("Bearer authentication takes precedence when both credentials are configured", async () => {
  const client = createTmdbClient({ token: " test-token ", apiKey: "test-api-key", fetchImpl: async (url, init) => {
    assert.equal(new URL(String(url)).searchParams.has("api_key"), false);
    assert.equal(new Headers(init?.headers).get("Authorization"), "Bearer test-token");
    return json({ results: [] });
  } });
  await client.request("/movie/popular");
});

test("API key authentication errors remain generic", async () => {
  const client = createTmdbClient({ apiKey: "test-api-key", fetchImpl: async () => json({}, 401) });
  await assert.rejects(client.request("/movie/popular"), (error: unknown) => error instanceof TmdbError && error.code === "TMDB_AUTH_FAILED" && !error.message.includes("test-api-key"));
});

test("transient network failure retries once and persistent failure stays sanitized", async () => {
  let calls = 0;
  const recovered = createTmdbClient({ apiKey: "test-api-key", sleep: async () => {}, fetchImpl: async () => {
    if (++calls === 1) throw new TypeError("fetch failed");
    return json({ results: [fixture] });
  } });
  await recovered.request("/movie/popular");
  assert.equal(calls, 2);
  calls = 0;
  const failed = createTmdbClient({ apiKey: "test-api-key", sleep: async () => {}, fetchImpl: async () => {
    calls++;
    throw new TypeError("request containing test-api-key failed");
  } });
  await assert.rejects(failed.request("/movie/popular"), (error: unknown) => error instanceof TmdbError && error.code === "TMDB_UNAVAILABLE" && !error.message.includes("test-api-key"));
  assert.equal(calls, 2);
});

test("cache deduplicates concurrent requests and marks expired fallback with the original timestamp", async () => {
  let now = Date.UTC(2026, 0, 1);
  let calls = 0;
  let unavailable = false;
  const client = createTmdbClient({ ...options(async () => { calls++; if (unavailable) return json({}, 503); await Promise.resolve(); return json({ results: [fixture] }); }), cacheSeconds: 30, now: () => now });
  const [first, simultaneous] = await Promise.all([client.request("/movie/popular"), client.request("/movie/popular")]);
  assert.equal(calls, 1);
  assert.deepEqual(first, simultaneous);
  await client.request("/movie/popular");
  assert.equal(calls, 1);
  now += 31_000;
  unavailable = true;
  const fallback = await client.request("/movie/popular");
  assert.equal(calls, 2);
  assert.equal(fallback.stale, true);
  assert.equal(fallback.retrievedAt, first.retrievedAt);
  now += 25 * 60 * 60 * 1000;
  await assert.rejects(client.request("/movie/popular"), (error: unknown) => error instanceof TmdbError && error.status === 502);
});

test("429 retries once; auth and upstream errors return meaningful status codes", async () => {
  let calls = 0;
  const client = createTmdbClient({ ...options(async () => { calls++; return calls === 1 ? json({}, 429) : json({ results: [] }); }), sleep: async () => {} });
  await client.request("/movie/popular");
  assert.equal(calls, 2);
  const limited = createTmdbClient({ ...options(async () => json({}, 429)), sleep: async () => {} });
  await assert.rejects(limited.request("/movie/popular"), (error: unknown) => error instanceof TmdbError && error.status === 429);
  const auth = createTmdbClient(options(async () => json({}, 401)));
  await assert.rejects(auth.request("/movie/popular"), (error: unknown) => error instanceof TmdbError && error.code === "TMDB_AUTH_FAILED");
  const missing = createTmdbClient(options(async () => json({}, 404)));
  await assert.rejects(missing.request("/movie/42"), (error: unknown) => error instanceof TmdbError && error.status === 404);
  await assert.rejects(auth.request("https://evil.example"), (error: unknown) => error instanceof TmdbError && error.status === 400);
});

test("timeout aborts and retries exactly once", async () => {
  let calls = 0;
  const client = createTmdbClient({ ...options(async (_url, init) => {
    calls++;
    return new Promise<Response>((_resolve, reject) => init?.signal?.addEventListener("abort", () => reject(new Error("aborted")), { once: true }));
  }), timeoutMs: 5 });
  await assert.rejects(client.request("/movie/popular"), (error: unknown) => error instanceof TmdbError && error.status === 504);
  assert.equal(calls, 2);
});

test("details whitelist IDs and keywords return normalized IDs and names", async () => {
  const requests: string[] = [];
  const service = createTmdbService(createTmdbClient(options(async (url) => {
    requests.push(String(url));
    return json(String(url).includes("search/keyword") ? { results: [{ id: 8, name: "space" }, { name: "invalid" }] } : fixture);
  })));
  const result = await service.detail("movie", "42");
  assert.equal(result.detail.id, 42);
  assert.match(requests[0], /append_to_response=credits%2Ckeywords%2Cexternal_ids%2Cimages%2Crecommendations/);
  await assert.rejects(service.detail("person", "42"));
  await assert.rejects(service.detail("movie", "../42"));
  assert.deepEqual((await service.keywords("space")).results, [{ id: 8, name: "space" }]);
  await assert.rejects(service.keywords(""));
});

test("malformed upstream catalog is an error, never an empty successful chart", async () => {
  const service = createTmdbService(createTmdbClient(options(async () => json({ message: "bad" }))));
  await assert.rejects(service.catalog(parseFilters(new URLSearchParams())), (error: unknown) => error instanceof TmdbError && error.code === "TMDB_INVALID_RESPONSE");
});

test("malformed refresh preserves the last valid cache and invalid credentials never use stale data", async () => {
  let now = Date.UTC(2026, 0, 1);
  let mode = "valid";
  const client = createTmdbClient({ ...options(async () => mode === "valid" ? json({ results: [fixture] }) : mode === "malformed" ? json({ unrelated: [] }) : json({}, 401)), cacheSeconds: 1, now: () => now });
  const valid = await client.request("/movie/popular");
  now += 2000;
  mode = "malformed";
  const fallback = await client.request("/movie/popular");
  assert.equal(fallback.stale, true);
  assert.deepEqual(fallback.data, valid.data);
  mode = "auth";
  await assert.rejects(client.request("/movie/popular"), (error: unknown) => error instanceof TmdbError && error.code === "TMDB_AUTH_FAILED");
});

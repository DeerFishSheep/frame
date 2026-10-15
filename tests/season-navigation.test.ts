import assert from "node:assert/strict";
import test from "node:test";
import { detailFavorite, parseRatingContext, type RatingContext } from "../lib/detail-rating";
import { createDetailRatingService } from "../lib/detail-rating-service";
import { FAVORITES_KEY, parseFavorites, readFavorites, sameFavorite, toggleFavorite, writeFavorites } from "../lib/favorites";
import { normalizeDetail } from "../lib/tmdb/normalize";
import { mediaHref, mediaKey, type MediaDetail } from "../lib/types";

const at = "2026-10-15T04:00:00Z";
const whole = { ...normalizeDetail({ id: 298931, name: "示例旅途", first_air_date: "2025-10-09", vote_average: 8.1, vote_count: 900 }, "tv"), imdbId: "tt1234567" };
const first: MediaDetail = { ...whole, title: "示例旅途 第一季", seasonNumber: 1, voteAverage: 7.1, voteCount: 110 };
const second: MediaDetail = { ...whole, title: "示例旅途 第二季", seasonNumber: 2, year: "2026", releaseDate: "2026-10-08", voteAverage: 7.2, voteCount: 120 };
const doubanSecond: MediaDetail = { ...second, source: "douban", doubanId: "38353939", voteAverage: 9.2, voteCount: 200 };

test("season links retain the selected season and rating provider through shared mediaHref", () => {
  assert.equal(mediaHref(whole), "/tv/298931");
  assert.equal(mediaHref(second), "/tv/298931?season=2");
  for (const item of [doubanSecond, { ...second, source: "imdb" as const }, { ...second, detailSource: "douban" as const, detailDoubanId: "38353939" }]) {
    const url = new URL(mediaHref(item), "https://frame.test");
    assert.equal(url.pathname, "/tv/298931");
    assert.equal(url.searchParams.get("season"), "2");
    assert.equal(url.searchParams.get("source"), item.detailSource ?? item.source);
    if ((item.detailSource ?? item.source) === "douban") assert.equal(url.searchParams.get("doubanId"), "38353939");
  }
  assert.equal(new URL(mediaHref({ ...second, mediaType: "movie" }), "https://frame.test").searchParams.has("season"), false);
  assert.equal(mediaHref({ ...doubanSecond, id: "douban:38353939" }), "https://movie.douban.com/subject/38353939/");
});

test("whole-series and season identities cannot share resource or view-state keys", () => {
  assert.equal(new Set([whole, first, second].map(mediaKey)).size, 3);
  const renamed: MediaDetail = { ...second, title: "不同显示名称", source: "imdb" };
  assert.equal(mediaKey(second), mediaKey(renamed));
  assert.notEqual(mediaKey(doubanSecond), mediaKey({ ...doubanSecond, seasonNumber: 1 }));
  assert.notEqual(mediaKey(doubanSecond), mediaKey({ ...doubanSecond, seasonNumber: undefined }));
  assert.notEqual(mediaKey({ ...second, id: 42 }), mediaKey({ ...second, id: 43 }));
});

test("favorites persist season identity and retain whole-series and separate seasons independently", () => {
  const storage = new Map<string, string>();
  writeFavorites({ setItem: (key, value) => { storage.set(key, value); } }, [whole, first, second]);
  const restored = readFavorites({ getItem: key => storage.get(key) ?? null });
  assert.deepEqual(restored.map(item => item.seasonNumber), [undefined, 1, 2]);
  assert.deepEqual(restored.map(mediaHref), ["/tv/298931", "/tv/298931?season=1", "/tv/298931?season=2"]);
  assert.ok(storage.has(FAVORITES_KEY));
  assert.deepEqual(parseFavorites(storage.get(FAVORITES_KEY)!), restored);
});

test("the same season shares favorites across providers but toggling it never removes another season or the series", () => {
  assert.equal(sameFavorite(second, doubanSecond), true);
  assert.equal(sameFavorite(first, doubanSecond), false);
  assert.equal(sameFavorite(whole, doubanSecond), false);
  assert.equal(sameFavorite(doubanSecond, { ...doubanSecond, seasonNumber: 1 }), false);
  const added = toggleFavorite([whole, first], doubanSecond);
  assert.equal(added.length, 3);
  assert.deepEqual(toggleFavorite(added, second), [whole, first]);
  const restored = parseFavorites(JSON.stringify([whole, first, second, doubanSecond]));
  assert.equal(restored.length, 3);
  const unresolved = { ...doubanSecond, id: "douban:38353939" };
  assert.equal(sameFavorite(unresolved, doubanSecond), true);
  assert.equal(sameFavorite(unresolved, { ...doubanSecond, seasonNumber: 1 }), false);
});

test("legacy Douban season favorites retain their identity without merging into the whole series", () => {
  const legacy = { ...doubanSecond, seasonNumber: undefined };
  assert.equal(sameFavorite(legacy, second), true);
  assert.equal(sameFavorite(legacy, first), false);
  assert.equal(sameFavorite(legacy, whole), false);
  const restored = parseFavorites(JSON.stringify([whole, first, legacy, second]));
  assert.equal(restored.length, 3);
  assert.equal(restored[2].seasonNumber, undefined, "legacy title inference is an identity alias, not newly verified metadata");
});

test("damaged season fields cannot be silently restored as whole-series or movie favorites", () => {
  for (const seasonNumber of [0, -1, 100, 1.5, "2", null]) {
    assert.deepEqual(parseFavorites(JSON.stringify([{ ...second, seasonNumber }])), []);
  }
  assert.deepEqual(parseFavorites(JSON.stringify([{ ...second, mediaType: "movie" }])), []);
  assert.equal(parseFavorites(JSON.stringify([whole])).length, 1);
});

test("rating context accepts one strict season parameter and preserves old links without a season", () => {
  assert.deepEqual(parseRatingContext(new URLSearchParams()), { source: "tmdb" });
  for (const season of [1, 2, 99]) {
    assert.deepEqual(parseRatingContext(new URLSearchParams(`source=douban&doubanId=38353939&season=${season}`)), { source: "douban", doubanId: "38353939", seasonNumber: season });
  }
  assert.deepEqual(parseRatingContext(new URLSearchParams("season=2")), { source: "tmdb", seasonNumber: 2 });
  for (const query of ["season=", "season=0", "season=100", "season=-1", "season=1.5", "season=NaN", "season=01", "season=2&season=3", "source=imdb&doubanId=38353939&season=2", "season=2&rating=9.9"]) {
    assert.throws(() => parseRatingContext(new URLSearchParams(query)), query);
  }
});

const rawSecond = { id: "38353939", title: second.title, year: "2026", type: "tv", rating: { value: 9.2, count: 200 } };
const context: RatingContext = { source: "douban", doubanId: "38353939", seasonNumber: 2 };
const dependencies = {
  detail: async (_media: string, _id: string, _seasonNumber?: number) => ({ detail: second, retrievedAt: at, stale: false }),
  imdb: async () => ({ rating: 9.8, votes: 9999, retrievedAt: at, stale: false }),
  subject: async () => ({ data: rawSecond, retrievedAt: at, stale: false }),
  match: async () => second,
};

test("rating lookup requests the season detail and accepts only that season's verified Douban score", async () => {
  const detailCalls: Array<[string, string, number | undefined]> = [];
  const rating = createDetailRatingService({ ...dependencies, detail: async (media, id, seasonNumber) => { detailCalls.push([media, id, seasonNumber]); return { detail: second, retrievedAt: at, stale: false }; } });
  const result = await rating("tv", "298931", context);
  assert.deepEqual(detailCalls, [["tv", "298931", 2]]);
  assert.deepEqual([result.source, result.voteAverage, result.voteCount], ["douban", 9.2, 200]);
  for (const wrong of [first, whole, { ...second, id: 999 }]) {
    const rejected = await createDetailRatingService({ ...dependencies, match: async () => wrong })("tv", "298931", context);
    assert.deepEqual([rejected.source, rejected.voteAverage, rejected.voteCount, rejected.fallback], ["tmdb", 7.2, 120, "missing"]);
  }
});

test("season detail does not display whole-series IMDB ratings when a season rating is unavailable", async () => {
  let calls = 0;
  const rating = createDetailRatingService({ ...dependencies, imdb: async () => { calls++; return dependencies.imdb(); } });
  const result = await rating("tv", "298931", { source: "imdb", seasonNumber: 2 });
  assert.equal(calls, 0);
  assert.deepEqual([result.source, result.voteAverage, result.voteCount, result.fallback], ["tmdb", 7.2, 120, "missing"]);
});

test("saving a seasonal rating fallback retains season navigation without trusting the unverified provider identity", async () => {
  const mismatch = await createDetailRatingService({ ...dependencies, match: async () => first })("tv", "298931", context);
  const saved = parseFavorites(JSON.stringify([detailFavorite(second, mismatch, context)]))[0];
  assert.equal(saved.seasonNumber, 2);
  assert.equal(saved.source, "tmdb");
  assert.equal(saved.doubanId, undefined);
  assert.equal(saved.detailSource, "douban");
  assert.equal(saved.detailDoubanId, "38353939");
  assert.deepEqual(parseRatingContext(new URL(mediaHref(saved), "https://frame.test").searchParams), context);
  assert.equal(sameFavorite(saved, { ...first, source: "douban", doubanId: "38353939" }), false);
  const verified = await createDetailRatingService(dependencies)("tv", "298931", context);
  const confirmed = parseFavorites(JSON.stringify([detailFavorite(second, verified, context)]))[0];
  assert.equal(confirmed.seasonNumber, 2);
  assert.equal(confirmed.doubanId, "38353939");
  assert.equal(sameFavorite(confirmed, second), true);
});

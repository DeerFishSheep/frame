import test from "node:test";
import assert from "node:assert/strict";
import { parseRatingContext, detailFavorite } from "../lib/detail-rating";
import { createDetailRatingService } from "../lib/detail-rating-service";
import { createImdbClient } from "../lib/imdb/client";
import { normalizeDetail } from "../lib/tmdb/normalize";
import { mediaHref } from "../lib/types";
import { parseFavorites, sameFavorite, toggleFavorite } from "../lib/favorites";

const at = "2026-10-14T16:00:00Z";
const film = { ...normalizeDetail({ id: 1368337, title: "奥德赛", release_date: "2026-07-15", vote_average: 8, vote_count: 4121 }, "movie"), imdbId: "tt33764258" };
const raw = { id: "36808876", title: "奥德赛", year: "2026", type: "movie", rating: { value: 8.6, count: 561767 } };
const dependencies = {
  detail: async () => ({ detail: film, retrievedAt: at, stale: false }),
  imdb: async () => ({ rating: 8.4, votes: 4567, retrievedAt: at, stale: false }),
  subject: async () => ({ data: raw, retrievedAt: at, stale: false }),
  match: async () => film,
};

test("detail ratings follow the selected provider and keep the rating/count pair together", async () => {
  const rating = createDetailRatingService(dependencies);
  for (const [context, expected] of [
    [{ source: "tmdb" as const }, ["tmdb", 8, 4121]],
    [{ source: "imdb" as const }, ["imdb", 8.4, 4567]],
    [{ source: "douban" as const, doubanId: raw.id }, ["douban", 8.6, 561767]],
  ] as const) {
    const result = await rating("movie", String(film.id), context);
    assert.deepEqual([result.source, result.voteAverage, result.voteCount], expected);
  }
  assert.equal(film.source, "tmdb"); assert.equal(film.voteAverage, 8);
});

test("missing or unrated source data explicitly falls back to TMDB", async () => {
  const rating = createDetailRatingService({ ...dependencies, imdb: async () => ({ rating: 0, votes: 0, retrievedAt: at, stale: false }), subject: async () => ({ data: { ...raw, rating: null }, retrievedAt: at, stale: false }) });
  for (const context of [{ source: "imdb" as const }, { source: "douban" as const }, { source: "douban" as const, doubanId: raw.id }]) {
    const result = await rating("movie", String(film.id), context);
    assert.deepEqual([result.source, result.voteAverage, result.voteCount, result.fallback], ["tmdb", 8, 4121, "missing"]);
  }
});

test("a failed provider request is distinguished from a genuine missing rating", async () => {
  const rating = createDetailRatingService({ ...dependencies, imdb: async () => { throw new Error("offline"); } });
  const result = await rating("movie", String(film.id), { source: "imdb" });
  assert.equal(result.source, "tmdb"); assert.equal(result.fallback, "unavailable");
});

test("invalid raw Douban values cannot become valid ratings through normalizer clamping or rounding", async () => {
  for (const score of [{ value: 12, count: 10 }, { value: 8, count: 1.9 }, { value: -3, count: 4 }, { value: 8, count: "20" }]) {
    const rating = createDetailRatingService({ ...dependencies, subject: async () => ({ data: { ...raw, rating: score }, retrievedAt: at, stale: false }) });
    const result = await rating("movie", String(film.id), { source: "douban", doubanId: raw.id });
    assert.equal(result.source, "tmdb"); assert.equal(result.fallback, "unavailable");
  }
});

test("a URL cannot apply another Douban film's rating to this detail", async () => {
  const rating = createDetailRatingService({ ...dependencies, match: async () => ({ ...film, id: 1698863 }) });
  const result = await rating("movie", String(film.id), { source: "douban", doubanId: raw.id });
  assert.equal(result.source, "tmdb"); assert.equal(result.fallback, "missing");
});

test("source context travels in shared card/hero links and validates strict IDs rather than URL score numbers", () => {
  assert.equal(mediaHref(film), "/movie/1368337");
  assert.equal(mediaHref({ ...film, source: "imdb" }), "/movie/1368337?source=imdb");
  const href = mediaHref({ ...film, source: "douban", doubanId: raw.id });
  assert.equal(href, "/douban/movie/36808876");
  const legacy = new URL(`/movie/${film.id}?source=douban&doubanId=${raw.id}`, "https://frame.test");
  assert.deepEqual(parseRatingContext(legacy.searchParams), { source: "douban", doubanId: raw.id });
  assert.deepEqual(parseRatingContext(new URLSearchParams()), { source: "tmdb" });
  for (const query of ["source=bad", "source=imdb&source=douban", "source=douban&doubanId=../x", "source=imdb&doubanId=123", "source=douban&rating=9.9"]) assert.throws(() => parseRatingContext(new URLSearchParams(query)));
});

test("favorites created in a provider detail retain its score and source across storage", async () => {
  const context = { source: "douban" as const, doubanId: raw.id };
  const rating = await createDetailRatingService(dependencies)("movie", String(film.id), context);
  const saved = parseFavorites(JSON.stringify([detailFavorite(film, rating, context)]))[0];
  assert.deepEqual([saved.source, saved.voteAverage, saved.voteCount, saved.doubanId], ["douban", 8.6, 561767, raw.id]);
  assert.equal(sameFavorite(saved, film), true);
  assert.equal(mediaHref(saved), "/douban/movie/36808876");
});

test("IMDB single-title lookup supports direct opens, coalesces and caches exact title ratings", async () => {
  let calls = 0;
  const client = createImdbClient({ fetchImpl: (async input => {
    calls++; const url = new URL(String(input));
    assert.equal(JSON.parse(url.searchParams.get("variables")!).id, film.imdbId);
    assert.match(url.searchParams.get("query")!, /title\(id:\$id\)/);
    return Response.json({ data: { title: { id: film.imdbId, ratingsSummary: { aggregateRating: 8.4, voteCount: 4567 } } } });
  }) as typeof fetch });
  const [a, b] = await Promise.all([client.rating(film.imdbId), client.rating(film.imdbId)]);
  assert.equal(calls, 1); assert.equal(a, b); assert.equal(a.rating, 8.4);
  await client.rating(film.imdbId); assert.equal(calls, 1);
  await assert.rejects(client.rating("../../private")); assert.equal(calls, 1);
});

test("saving a fallback score preserves the entry provider for later recovery without relabeling TMDB values", async () => {
  const rating = createDetailRatingService({ ...dependencies, imdb: async () => { throw new Error("offline"); }, subject: async () => { throw new Error("offline"); } });
  for (const context of [{ source: "imdb" as const }, { source: "douban" as const, doubanId: raw.id }]) {
    const result = await rating("movie", String(film.id), context);
    const saved = parseFavorites(JSON.stringify([detailFavorite(film, result, context)]))[0];
    assert.deepEqual([saved.source, saved.voteAverage, saved.voteCount], ["tmdb", 8, 4121]);
    assert.equal(saved.detailSource, context.source);
    const url = new URL(mediaHref(saved), "https://frame.test");
    if (context.source === "douban") assert.equal(url.pathname, `/douban/movie/${raw.id}`);
    else assert.equal(url.searchParams.get("source"), context.source);
  }
});

test("unverified source navigation IDs cannot merge unrelated favorite identities", async () => {
  const rating = createDetailRatingService({ ...dependencies, match: async () => ({ ...film, id: 278 }) });
  const context = { source: "douban" as const, doubanId: raw.id };
  const result = await rating("movie", String(film.id), context);
  const saved = parseFavorites(JSON.stringify([detailFavorite(film, result, context)]))[0];
  const differentFilm = { ...film, id: 278, imdbId: "tt0111161", doubanId: raw.id };
  assert.equal(saved.doubanId, undefined); assert.equal(saved.detailDoubanId, raw.id);
  assert.equal(sameFavorite(saved, differentFilm), false);
  assert.equal(toggleFavorite([differentFilm], saved).length, 2);
  assert.equal(mediaHref(saved), "/douban/movie/36808876");
});

test("IMDB malformed or mismatched title ratings are not cached as valid data", async () => {
  for (const title of [
    { id: "tt0000001", ratingsSummary: { aggregateRating: 8, voteCount: 1 } },
    { id: film.imdbId, ratingsSummary: { aggregateRating: 12, voteCount: 1 } },
    { id: film.imdbId, ratingsSummary: { aggregateRating: 8, voteCount: -1 } },
  ]) {
    const client = createImdbClient({ fetchImpl: (async () => Response.json({ data: { title } })) as typeof fetch });
    await assert.rejects(client.rating(film.imdbId));
  }
});

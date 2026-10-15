import assert from "node:assert/strict";
import test from "node:test";
import { createMediaDetailService } from "../lib/media-detail";
import { TmdbError } from "../lib/tmdb/client";
import { normalizeDetail } from "../lib/tmdb/normalize";
import type { RatingContext } from "../lib/detail-rating";
import type { Media, MediaDetail } from "../lib/types";

const at = "2026-10-15T08:00:00Z";
const seasonDetail: MediaDetail = {
  ...normalizeDetail({ id: 210001, name: "边界旅途", first_air_date: "2024-02-01" }, "tv"),
  id: 210001, seasonNumber: 2, mediaType: "tv", title: "边界旅途 第2季", originalTitle: "Boundary Journey Season 2",
  posterPath: "/season-two.jpg", backdropPath: "/season-still.jpg", overview: "TMDB 第二季简介", releaseDate: "2025-03-02", year: "2025",
  genres: ["剧情"], genreIds: [18], countryCodes: ["US"], voteAverage: 8, voteCount: 100, popularity: 0, source: "tmdb", imdbId: "tt1234567",
  runtime: 45, numberOfSeasons: null, numberOfEpisodes: 8, status: "", countries: ["美国"], directors: ["第二季导演"],
  cast: [{ id: 1, name: "第二季演员", character: "主角", profilePath: null }], images: ["/season-still.jpg"],
  recommendations: { results: [], page: 1, totalPages: 1, totalResults: 0 },
};
const source = {
  id: "38000102", type: "tv", title: "边界旅途 第二季", original_title: "Boundary Journey Season 2", year: "2025",
  description: "豆瓣确认过的第二季简介", cover_url: "https://img1.doubanio.com/view/photo/s_ratio_poster/public/p12345.jpg",
  rating: { value: 8.9, count: 1200 },
};
type Dependencies = Parameters<typeof createMediaDetailService>[0];
function setup(overrides: Partial<Dependencies> = {}) {
  const calls = { detail: [] as Array<[string, string, number | undefined]>, subject: [] as Array<[string, string]>, match: [] as Media[] };
  const dependencies: Dependencies = {
    detail: async (media, id, seasonNumber) => { calls.detail.push([media, id, seasonNumber]); return { detail: seasonDetail, retrievedAt: at, stale: false }; },
    subject: async (media, id) => { calls.subject.push([media, id]); return { data: source, retrievedAt: at, stale: false }; },
    match: async item => { calls.match.push(item); return seasonDetail; },
    ...overrides,
  };
  return { calls, read: createMediaDetailService(dependencies) };
}
const context: RatingContext = { source: "douban", doubanId: source.id };
const isError = (code: string, status: number) => (error: unknown) => error instanceof TmdbError && error.code === code && error.status === status;

test("an old Douban URL resolves its verified season before requesting detail data", async () => {
  const { read, calls } = setup();
  const result = await read("tv", String(seasonDetail.id), context);
  assert.deepEqual(calls.subject, [["tv", source.id]]);
  assert.equal(calls.match.length, 1);
  assert.equal(calls.match[0].id, `douban:${source.id}`);
  assert.deepEqual(calls.detail, [["tv", String(seasonDetail.id), 2]]);
  assert.equal(result.detail.seasonNumber, 2);
  assert.equal(result.detail.title, source.title);
  assert.equal(result.detail.doubanId, source.id);
  assert.equal(result.detail.overview, seasonDetail.overview);
  assert.equal(result.detail.releaseDate, seasonDetail.releaseDate);
  assert.equal(result.retrievedAt, at);
  assert.equal(result.stale, false);
});

test("explicit season links use the same verified Douban identity or directly load the requested TMDB season", async () => {
  const douban = setup();
  const result = await douban.read("tv", String(seasonDetail.id), { ...context, seasonNumber: 2 });
  assert.deepEqual(douban.calls.detail, [["tv", String(seasonDetail.id), 2]]);
  assert.equal(result.detail.seasonNumber, 2);
  const direct = setup({ subject: async () => { throw new Error("No source lookup for plain season links"); }, match: async () => { throw new Error("No source matching for plain season links"); } });
  assert.equal((await direct.read("tv", String(seasonDetail.id), { source: "tmdb", seasonNumber: 2 })).detail, seasonDetail);
  assert.deepEqual(direct.calls.detail, [["tv", String(seasonDetail.id), 2]]);
});

test("a conflicting requested season and failed or incorrect source matches cannot fall back to whole-series detail", async () => {
  const mismatch = setup();
  await assert.rejects(mismatch.read("tv", String(seasonDetail.id), { ...context, seasonNumber: 1 }), isError("SEASON_MISMATCH", 400));
  assert.equal(mismatch.calls.detail.length, 0);
  for (const matched of [null, { ...seasonDetail, id: seasonDetail.id + 1 }, { ...seasonDetail, mediaType: "movie" as const }, { ...seasonDetail, seasonNumber: undefined }, { ...seasonDetail, seasonNumber: 1 }]) {
    const { read, calls } = setup({ match: async () => matched });
    await assert.rejects(read("tv", String(seasonDetail.id), context), isError("SEASON_MATCH_UNAVAILABLE", 502));
    assert.equal(calls.detail.length, 0);
  }
  const ordinary = setup({ subject: async () => ({ data: { ...source, title: "边界旅途" }, retrievedAt: at, stale: false }) });
  await assert.rejects(ordinary.read("tv", String(seasonDetail.id), { ...context, seasonNumber: 2 }), isError("SEASON_MATCH_UNAVAILABLE", 502));
  assert.equal(ordinary.calls.detail.length, 0);
  const failed = setup({ match: async () => { throw new Error("Matching service unavailable"); } });
  await assert.rejects(failed.read("tv", String(seasonDetail.id), context), /Matching service unavailable/);
  assert.equal(failed.calls.detail.length, 0);
});

test("incorrect Douban subjects and source failures stop before requesting any local detail", async () => {
  for (const data of [{ ...source, id: "38000999" }, { ...source, type: "movie" }, { ...source, title: "" }, null]) {
    const { read, calls } = setup({ subject: async () => ({ data, retrievedAt: at, stale: false }) });
    await assert.rejects(read("tv", String(seasonDetail.id), context), isError("INVALID_DETAIL_SOURCE", 502));
    assert.equal(calls.match.length, 0);
    assert.equal(calls.detail.length, 0);
  }
  const failure = new Error("Subject unavailable");
  const { read, calls } = setup({ subject: async () => { throw failure; } });
  await assert.rejects(read("tv", String(seasonDetail.id), context), error => error === failure);
  assert.equal(calls.detail.length, 0);
});

test("detail responses must retain the verified series, media, season and source year", async () => {
  for (const change of [{ id: seasonDetail.id + 1 }, { mediaType: "movie" as const }, { seasonNumber: undefined }, { seasonNumber: 1 }, { year: "2024" }]) {
    const { read } = setup({ detail: async () => ({ detail: { ...seasonDetail, ...change }, retrievedAt: at, stale: false }) });
    await assert.rejects(read("tv", String(seasonDetail.id), context), isError("INVALID_SEASON_DETAIL", 502));
  }
});

test("only a verified same-season Douban subject can fill missing season overview and poster", async () => {
  const emptySeason: MediaDetail = { ...seasonDetail, overview: "", posterPath: null };
  const { read } = setup({
    detail: async () => ({ detail: emptySeason, retrievedAt: at, stale: false }),
    subject: async () => ({ data: source, retrievedAt: at, stale: true }),
  });
  const result = await read("tv", String(seasonDetail.id), context);
  assert.equal(result.detail.overview, source.description);
  assert.equal(result.detail.posterPath, source.cover_url);
  assert.deepEqual(result.detail.posterFallbacks, [source.cover_url]);
  assert.equal(result.stale, true);
  assert.equal(emptySeason.overview, "");
  assert.equal(emptySeason.posterPath, null);
  const direct = setup({ detail: async () => ({ detail: emptySeason, retrievedAt: at, stale: false }) });
  const plain = await direct.read("tv", String(seasonDetail.id), { source: "tmdb", seasonNumber: 2 });
  assert.equal(plain.detail.overview, "");
  assert.equal(plain.detail.posterPath, null);
  assert.equal(direct.calls.subject.length, 0);
});

test("ordinary TV and movie details retain their original behavior and result objects", async () => {
  for (const mediaType of ["tv", "movie"] as const) {
    const plain: MediaDetail = { ...seasonDetail, mediaType, seasonNumber: undefined, title: "普通作品", overview: "普通作品简介" };
    const response = { detail: plain, retrievedAt: at, stale: false };
    for (const sourceType of ["tmdb", "imdb", "douban"] as const) {
      let detailCalls = 0;
      const { read, calls } = setup({ detail: async (media, id, season) => { detailCalls++; assert.deepEqual([media, id, season], [mediaType, String(plain.id), undefined]); return response; } });
      const ordinaryContext: RatingContext = { source: sourceType, ...(mediaType === "movie" && sourceType === "douban" ? { doubanId: source.id } : {}) };
      assert.equal(await read(mediaType, String(plain.id), ordinaryContext), response);
      assert.equal(detailCalls, 1);
      assert.equal(calls.subject.length, 0);
      assert.equal(calls.match.length, 0);
    }
  }
  const plain = { ...seasonDetail, seasonNumber: undefined, title: "整剧资料" };
  const response = { detail: plain, retrievedAt: at, stale: false };
  const { read, calls } = setup({ detail: async () => response, subject: async () => ({ data: { ...source, title: "整剧条目" }, retrievedAt: at, stale: false }) });
  assert.equal(await read("tv", String(plain.id), context), response);
  assert.equal(calls.match.length, 0);
});

test("invalid media IDs and seasons fail before any dependency call", async () => {
  const { read, calls } = setup();
  for (const [media, id] of [["person", "123"], ["", "123"], ["tv", "0"], ["tv", "01"], ["tv", "-1"], ["tv", "1.5"], ["tv", "../123"], ["movie", "9007199254740992"]]) {
    await assert.rejects(read(media, id, context), isError("INVALID_MEDIA_ID", 400));
  }
  for (const seasonNumber of [0, -1, 1.5, NaN, Infinity, 100]) {
    await assert.rejects(read("tv", String(seasonDetail.id), { ...context, seasonNumber }), isError("INVALID_SEASON", 400));
  }
  await assert.rejects(read("movie", String(seasonDetail.id), { ...context, seasonNumber: 2 }), isError("INVALID_SEASON", 400));
  assert.deepEqual(calls, { detail: [], subject: [], match: [] });
});

test("unsupported season suffixes in old Douban links cannot silently open whole-series data", async () => {
  for (const title of ["边界旅途 第零季", "边界旅途 第一百季", "Boundary Journey Season 0", "Boundary Journey S100"]) {
    const { read, calls } = setup({ subject: async () => ({ data: { ...source, title }, retrievedAt: at, stale: false }) });
    await assert.rejects(read("tv", String(seasonDetail.id), context), isError("INVALID_SEASON", 400));
    assert.equal(calls.match.length, 0);
    assert.equal(calls.detail.length, 0);
  }
});

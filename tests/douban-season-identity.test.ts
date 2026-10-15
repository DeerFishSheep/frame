import assert from "node:assert/strict";
import test from "node:test";
import { createDoubanMatcher } from "../lib/douban/matcher";
import { enrichDoubanMedia, normalizeDoubanItem } from "../lib/douban/normalize";
import type { Media } from "../lib/types";
import type { TvSeasonEvidence } from "../lib/tmdb/season-match";

const series: Media = {
  id: 200001, mediaType: "tv", title: "边界行者", originalTitle: "Boundary Journey", source: "tmdb",
  posterPath: "/series.jpg", backdropPath: "/backdrop.jpg", overview: "整剧简介", releaseDate: "2024-02-01", year: "2024",
  genreIds: [18], genres: ["剧情"], countryCodes: ["US"], voteAverage: 7, voteCount: 300, popularity: 10,
};
const seasonItems = [
  normalizeDoubanItem({ id: "38000001", title: "边界行者 第一季", original_title: "Boundary Journey Season 1", year: "2024", type: "tv", rating: { value: 8.1, count: 1200 } }, "tv")!,
  normalizeDoubanItem({ id: "38000002", title: "边界行者 第二季", original_title: "Boundary Journey Season 2", year: "2025", type: "tv", rating: { value: 8.8, count: 2400 } }, "tv")!,
];
const cast = [{ id: 1, name: "演员甲", character: "主角", profilePath: null }, { id: 2, name: "演员乙", character: "配角", profilePath: null }];
const seasonEvidence = (number: number): TvSeasonEvidence => ({
  seriesId: Number(series.id), seasonNumber: number, airDate: number === 1 ? "2024-02-01" : "2025-03-02",
  posterPath: `/season-${number}.jpg`, overview: `第${number}季简介`, imdbId: "tt1234567", cast, directors: [],
});
const matcher = (overrides: Partial<Parameters<typeof createDoubanMatcher>[0]> = {}) => createDoubanMatcher({
  search: async () => { throw new Error("Explicit seasons require season evidence"); },
  subject: async (_media, id) => {
    const item = seasonItems.find(item => item.doubanId === id)!;
    return { data: { title: item.title, original_title: item.originalTitle, year: item.year, actors: cast.map(person => ({ name: person.name })) } };
  },
  detail: async () => { throw new Error("Series details cannot confirm season identity"); },
  seasonCandidates: async () => [series],
  seasonEvidence: async (_id, number) => seasonEvidence(number),
  ...overrides,
});

test("verified Douban seasons sharing a TMDB series ID retain separate season identities and source metadata", async () => {
  const resolve = matcher();
  const matched = await Promise.all(seasonItems.map(item => resolve(item)));
  assert.deepEqual(matched.map(item => [item?.id, item?.seasonNumber]), [[series.id, 1], [series.id, 2]]);
  const enriched = seasonItems.map((item, index) => enrichDoubanMedia(item, matched[index]));
  assert.deepEqual(enriched.map(item => ({ id: item.id, doubanId: item.doubanId, season: item.seasonNumber, title: item.title, year: item.year, score: item.voteAverage, votes: item.voteCount, source: item.source })), [
    { id: series.id, doubanId: "38000001", season: 1, title: "边界行者 第一季", year: "2024", score: 8.1, votes: 1200, source: "douban" },
    { id: series.id, doubanId: "38000002", season: 2, title: "边界行者 第二季", year: "2025", score: 8.8, votes: 2400, source: "douban" },
  ]);
  assert.deepEqual(enriched.map(item => item.releaseDate), ["2024-02-01", "2025-03-02"]);
  assert.deepEqual(enriched.map(item => item.posterPath), ["/season-1.jpg", "/season-2.jpg"]);
  assert.equal(series.seasonNumber, undefined);
  assert.ok(seasonItems.every(item => item.seasonNumber === undefined));
});

test("a season suffix or raw season field alone never creates a verified local season identity", async () => {
  const item = normalizeDoubanItem({ id: "38000002", title: "边界行者 第二季", year: "2025", type: "tv", seasonNumber: 2, season_number: 2 }, "tv")!;
  assert.equal(item.seasonNumber, undefined);
  const match = await matcher({ seasonEvidence: async () => null })(item);
  assert.equal(match, null);
  const enriched = enrichDoubanMedia(item, match);
  assert.equal(enriched.id, "douban:38000002");
  assert.equal(enriched.seasonNumber, undefined);
  assert.equal(enriched.title, "边界行者 第二季");
});

test("ordinary shows and movies do not invent season numbers or enter the season evidence path", async () => {
  for (const mediaType of ["tv", "movie"] as const) {
    const title = mediaType === "tv" ? "边界行者" : "边界行者 第二季";
    const source = normalizeDoubanItem({ id: "38000003", title, year: "2024", type: mediaType, rating: { value: 8.5, count: 900 } }, mediaType)!;
    const candidate: Media = { ...series, mediaType, title, originalTitle: title };
    const resolve = matcher({ search: async () => [candidate], seasonCandidates: async () => { throw new Error("No explicit TV season"); } });
    const matched = await resolve(source);
    assert.equal(matched?.id, series.id);
    assert.equal(matched?.seasonNumber, undefined);
    const enriched = enrichDoubanMedia(source, matched);
    assert.equal(enriched.seasonNumber, undefined);
    assert.equal(enriched.title, title);
    assert.equal(enriched.voteAverage, 8.5);
  }
});

test("season enrichment only copies positive verified TV season numbers", () => {
  const source = seasonItems[1];
  for (const seasonNumber of [undefined, 0, -1, 1.5, NaN, 100]) {
    assert.equal(enrichDoubanMedia(source, { ...series, seasonNumber }).seasonNumber, undefined);
  }
  assert.equal(enrichDoubanMedia({ ...source, mediaType: "movie" }, { ...series, mediaType: "movie", seasonNumber: 2 }).seasonNumber, undefined);
  assert.equal(enrichDoubanMedia(source, { ...series, mediaType: "movie", seasonNumber: 2 }).seasonNumber, undefined);
  assert.equal(enrichDoubanMedia(source, { ...series, seasonNumber: 2 }).seasonNumber, 2);
});

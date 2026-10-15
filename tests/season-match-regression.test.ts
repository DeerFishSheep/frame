import assert from "node:assert/strict";
import test from "node:test";
import { createDoubanMatcher } from "../lib/douban/matcher";
import { normalizeDoubanItem } from "../lib/douban/normalize";
import { parseDoubanFilters } from "../lib/douban/query";
import { createDoubanService } from "../lib/douban/service";
import type { TvSeasonEvidence } from "../lib/tmdb/season-match";
import { mediaHref, type Media } from "../lib/types";

// Minimal identity/date/artwork facts captured from the three reported works on 2026-10-15.
// These are test fixtures only. The runtime matcher has no title/ID mapping table.
const reported = [
  { doubanId: "38353939", title: "杀死你的旅途 第二季", original: "あなたを殺す旅 続編", seriesTitle: "杀死你的旅途", seriesOriginal: "あなたを殺す旅", id: 298931, season: 2, date: "2026-10-08", poster: "/uUMdBJltlWCgiPzePVUQJBQ43gD.jpg", sourceEpisodes: 6 },
  { doubanId: "36781597", title: "警之光 第四季", original: "Blue Lights Season 4", seriesTitle: "警之光", seriesOriginal: "Blue Lights", id: 218344, season: 4, date: "2026-09-29", poster: "/py35lzjLM8yaTGSJZQiJU3rnZLc.jpg", sourceEpisodes: 6 },
  { doubanId: "36689816", title: "流人 第六季", original: "Slow Horses Season 6", seriesTitle: "流人", seriesOriginal: "Slow Horses", id: 95480, season: 6, date: "2026-09-16", poster: "/8lDa5VFK18oAlNlRvff2gSHpnDZ.jpg", sourceEpisodes: 7 },
] as const;
type Reported = typeof reported[number];
const actors = [{ id: 2089128, name: "和田雅成", character: "", profilePath: null }, { id: 4734845, name: "高桥大翔", character: "", profilePath: null }];
const rawSubject = (item: Reported, withJapaneseActors = true) => ({
  id: item.doubanId, type: "tv", title: item.title, original_title: item.original, year: "2026",
  pubdate: [item.date], episodes_count: item.sourceEpisodes,
  actors: item.season === 2 && withJapaneseActors ? actors.map(actor => ({ name: actor.name })) : [],
  directors: [],
});
const source = (item: Reported) => normalizeDoubanItem(rawSubject(item), "tv")!;
const candidate = (item: Reported): Media => ({
  ...source(item), id: item.id, doubanId: undefined, source: "tmdb", title: item.seriesTitle, originalTitle: item.seriesOriginal,
  year: "2020", releaseDate: "", posterPath: "/synthetic-series-poster.jpg", overview: "Synthetic series metadata",
});
const evidence = (item: Reported): TvSeasonEvidence => ({
  seriesId: item.id, seasonNumber: item.season, airDate: item.date, episodeCount: 6,
  posterPath: item.poster, overview: "", imdbId: null, directors: [], cast: item.season === 2 ? actors : [],
});

function createReportedMatcher(withJapaneseActors = true) {
  const calls = { aggregate: 0, originals: [] as string[] };
  const matcher = createDoubanMatcher({
    search: async () => [],
    subject: async (_media, id) => {
      const item = reported.find(entry => entry.doubanId === id);
      return { data: item ? rawSubject(item, withJapaneseActors) : {} };
    },
    detail: async () => { throw new Error("reported seasons must never use whole-series detail as identity evidence"); },
    seasonCandidates: async title => {
      const item = reported.find(entry => entry.title === title || entry.original === title);
      if (!item || item.season === 6 && title === item.title) return [];
      if (title === item.original) calls.originals.push(title);
      return [candidate(item)];
    },
    seasonEvidence: async (id, seasonNumber) => {
      const item = reported.find(entry => entry.id === id && entry.season === seasonNumber);
      return item ? evidence(item) : null;
    },
    seriesEvidence: async () => { calls.aggregate++; return null; },
  });
  return { matcher, calls };
}

for (const item of reported) test(`${item.title} keeps its verified series ID, season, premiere date and seasonal poster`, async () => {
  const { matcher, calls } = createReportedMatcher();
  const result = await matcher(source(item));
  assert.ok(result);
  assert.deepEqual([result.id, result.seasonNumber, result.releaseDate, result.posterPath], [item.id, item.season, item.date, item.poster]);
  assert.equal(calls.aggregate, 0);
  assert.equal(result.backdropPath, null);
  assert.equal(result.overview, "");
  if (item.season === 6) assert.deepEqual(calls.originals, ["Slow Horses Season 6"]);
});

test("the Japanese sequel retains its credit fallback while Blue Lights and Slow Horses need no actors", async () => {
  const { matcher, calls } = createReportedMatcher(false);
  assert.equal(await matcher(source(reported[0])), null);
  for (const item of reported.slice(1)) assert.equal((await matcher(source(item)))?.id, item.id);
  assert.equal(calls.aggregate, 0);
});

test("a mixed catalog batch preserves all three matches, existing identities, order and unmatched entries", async () => {
  const whole = normalizeDoubanItem({ id: "990001", type: "tv", title: "Synthetic established series", year: "2020" }, "tv")!;
  const missing = normalizeDoubanItem({ id: "990002", type: "tv", title: "Synthetic unknown series 第二季", year: "2026" }, "tv")!;
  const temporaryFailure = normalizeDoubanItem({ id: "990003", type: "tv", title: "Synthetic temporarily unavailable series", year: "2026" }, "tv")!;
  const established: Media = { ...whole, id: 800001, doubanId: undefined, source: "tmdb" };
  const rows = [source(reported[2]), whole, source(reported[0]), missing, source(reported[1]), temporaryFailure].map((item, index) => ({ ...item, rank: index + 1 }));
  const { matcher } = createReportedMatcher();
  const catalog = createDoubanService({ page: async () => ({ items: rows, total: rows.length, totalExact: true, hasMore: false, omitted: 0, retrievedAt: "2026-10-15T00:00:00Z", stale: false }) }, async item => {
    if (item.doubanId === whole.doubanId) return established;
    if (item.doubanId === temporaryFailure.doubanId) throw new Error("synthetic upstream interruption");
    return matcher(item);
  });
  const result = await catalog.catalog(parseDoubanFilters(new URLSearchParams("source=douban&media=tv&chart=recommend")));
  assert.equal(result.results.length, rows.length);
  assert.deepEqual(result.results.map(item => item.doubanId), rows.map(item => item.doubanId));
  assert.deepEqual(result.results.map(item => item.rank), [1, 2, 3, 4, 5, 6]);
  assert.deepEqual(result.results.map(item => [item.id, item.seasonNumber]), [
    [95480, 6], [800001, undefined], [298931, 2], [missing.id, undefined], [218344, 4], [temporaryFailure.id, undefined],
  ]);
  for (const item of reported) {
    const matched = result.results.find(entry => entry.doubanId === item.doubanId)!;
    const url = new URL(mediaHref(matched), "https://frame.test");
    assert.equal(url.pathname, `/tv/${item.id}`);
    assert.equal(url.searchParams.get("season"), String(item.season));
    assert.equal(url.searchParams.get("doubanId"), item.doubanId);
    assert.equal(matched.posterPath, item.poster);
  }
  assert.deepEqual(result.results[3], rows[3]);
  assert.deepEqual(result.results[5], rows[5]);
});

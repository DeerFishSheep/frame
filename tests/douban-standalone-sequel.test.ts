import assert from "node:assert/strict";
import test from "node:test";
import { createDoubanMatcher } from "../lib/douban/matcher";
import type { Media } from "../lib/types";
import type { TvSeasonEvidence, TvWorkEvidence } from "../lib/tmdb/season-match";

const cast = [
  { id: 1, name: "演员甲", character: "", profilePath: null },
  { id: 2, name: "演员乙", character: "", profilePath: null },
];
const base = (doubanId: string, title: string, year: string): Media => ({
  id: `douban:${doubanId}`, doubanId, mediaType: "tv", title, originalTitle: "", source: "douban",
  posterPath: null, backdropPath: null, overview: "", releaseDate: "", year, genreIds: [], genres: [],
  voteAverage: 0, voteCount: 0, popularity: 0,
});
const tmdbSeries = (id: number, title: string, originalTitle: string, year: string): Media => ({
  ...base(String(id), title, year), id, source: "tmdb", originalTitle,
});
const season = (seriesId: number, seasonNumber: number, airDate: string): TvSeasonEvidence =>
  ({ seriesId, seasonNumber, airDate, posterPath: null, overview: "", imdbId: null, directors: [], cast });
const work = (seriesId: number, names: string[], firstAirDate: string): TvWorkEvidence =>
  ({ seriesId, names, firstAirDate, cast, directors: [], imdbId: null });

test("a Douban bare trailing number resolves to a TMDB season only when a source alias states that season", async () => {
  const source = base("37181749", "杀人者的购物中心2", "2026");
  const raw = { title: "杀人者的购物中心2", original_title: "쇼핑몰2", year: "2026", aka: ["A Shop for Killers Season 2"],
    pubdate: ["2026-07-22(韩国)"], actors: cast.map(person => ({ name: person.name })) };
  const series = tmdbSeries(215072, "杀人者的购物中心", "킬러들의 쇼핑몰", "2024");
  const find = createDoubanMatcher({
    search: async () => [], subject: async () => ({ data: raw }), detail: async () => { throw new Error("season path"); },
    seasonCandidates: async () => [series], seasonEvidence: async (_id, number) => number === 2 ? season(215072, 2, "2026-07-22") : null,
    seriesEvidence: async () => null, workEvidence: async () => null,
  });
  const match = await find(source);
  assert.equal(match?.id, 215072);
  assert.equal(match?.seasonNumber, 2);
  assert.equal(match?.releaseDate, "2026-07-22");
});

test("a standalone TMDB series numbered as a later Douban season matches its own season one", async () => {
  const source = base("37862314", "麻辣教师 第二季", "2026");
  const raw = { title: "麻辣教师 第二季", original_title: "GTO 続編", year: "2026", aka: ["GTO 2"],
    pubdate: ["2026-07-20(日本)"], actors: cast.map(person => ({ name: person.name })) };
  const series = tmdbSeries(325022, "麻辣教师", "GTO", "2026");
  const find = createDoubanMatcher({
    search: async () => [], subject: async () => ({ data: raw }), detail: async () => { throw new Error("season path"); },
    seasonCandidates: async () => [series],
    seasonEvidence: async (_id, number) => number === 1 ? season(325022, 1, "2026-07-20") : null,
    seriesEvidence: async () => null, workEvidence: async id => id === 325022 ? work(325022, ["麻辣教师", "GTO"], "2026-07-20") : null,
  });
  const match = await find(source);
  assert.equal(match?.id, 325022);
  assert.equal(match?.seasonNumber, 1);
  assert.equal(match?.releaseDate, "2026-07-20");
});

test("a suffixed standalone sequel name is matched through the source alias name set, not a wrong older series", async () => {
  const source = base("36768839", "极地恶灵 第三季", "2026");
  const raw = { title: "极地恶灵 第三季", original_title: "The Terror Season 3", year: "2026",
    aka: ["极地恶灵：银色恶魔", "The Terror: Devil in Silver"], pubdate: ["2026-05-07(美国)"],
    actors: cast.map(person => ({ name: person.name })) };
  const older = tmdbSeries(75191, "极地恶灵", "The Terror", "2018");
  const standalone = tmdbSeries(323903, "极地恶灵：银色恶魔", "The Terror: Devil in Silver", "2026");
  let seasonCalls: Array<[number, number]> = [];
  const find = createDoubanMatcher({
    search: async () => [], subject: async () => ({ data: raw }), detail: async () => { throw new Error("season path"); },
    seasonCandidates: async () => [older, standalone],
    seasonEvidence: async (id, number) => { seasonCalls.push([id, number]); return id === 323903 && number === 1 ? season(323903, 1, "2026-05-07") : null; },
    seriesEvidence: async () => null,
    workEvidence: async id => id === 323903 ? work(323903, ["极地恶灵：银色恶魔", "The Terror: Devil in Silver", "The Terror"], "2026-05-07") : null,
  });
  const match = await find(source);
  assert.equal(match?.id, 323903);
  assert.equal(match?.seasonNumber, 1);
  assert.ok(!seasonCalls.some(([id, number]) => id === 75191 && number === 1));
});

test("a standalone fallback is refused when the source date or season one identity disagrees", async () => {
  const source = base("37862314", "麻辣教师 第二季", "2026");
  const raw = { title: "麻辣教师 第二季", original_title: "GTO 続編", year: "2026", aka: ["GTO 2"],
    pubdate: ["2026-07-20(日本)"], actors: cast.map(person => ({ name: person.name })) };
  const series = tmdbSeries(325022, "麻辣教师", "GTO", "2026");
  const build = (evidence: TvWorkEvidence | null, first: TvSeasonEvidence | null) => createDoubanMatcher({
    search: async () => [], subject: async () => ({ data: raw }), detail: async () => { throw new Error("season path"); },
    seasonCandidates: async () => [series], seasonEvidence: async (_id, number) => number === 1 ? first : null,
    seriesEvidence: async () => null, workEvidence: async () => evidence,
  });
  assert.equal(await build(work(325022, ["麻辣教师"], "2026-07-21"), season(325022, 1, "2026-07-21"))(source), null);
  assert.equal(await build(work(325022, ["麻辣教师"], "2026-07-20"), season(325022, 1, "2026-07-19"))(source), null);
  assert.equal(await build(work(325022, ["完全不同的剧"], "2026-07-20"), season(325022, 1, "2026-07-20"))(source), null);
});

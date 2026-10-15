import assert from "node:assert/strict";
import test from "node:test";
import { createDoubanMatcher } from "../lib/douban/matcher";
import { normalizeDoubanItem } from "../lib/douban/normalize";
import { createTmdbClient } from "../lib/tmdb/client";
import { normalizeMedia } from "../lib/tmdb/normalize";
import { createTmdbSeasonMatcher, type TvSeasonEvidence } from "../lib/tmdb/season-match";

const source = normalizeDoubanItem({ id: "910003", type: "tv", title: "警之光 第三季", year: "2025", card_subtitle: "2025 / 英国 / 剧情" }, "tv")!;
const series = normalizeMedia({ id: 42, name: "北爱警灯", original_name: "Blue Lights", first_air_date: "2023-03-27", origin_country: ["GB"] }, "tv");
const rawSource = { title: source.title, original_title: "Blue Lights Season 3", year: "2025", countries: ["英国"], pubdate: ["2025-09-29(英国)"], episodes_count: 6 };
const season: TvSeasonEvidence = { seriesId: 42, seasonNumber: 3, airDate: "2025-09-29", episodeCount: 6, posterPath: "/third-season.jpg", overview: "本季简介", imdbId: null, directors: [], cast: [] };
const actors = [{ id: 1, name: "演员甲", character: "", profilePath: null }, { id: 2, name: "演员乙", character: "", profilePath: null }];
const matchWith = (raw: Record<string, unknown> = rawSource, overrides: Partial<Parameters<typeof createDoubanMatcher>[0]> = {}) => createDoubanMatcher({
  search: async () => { throw new Error("explicit seasons must not use the ordinary series-year search"); },
  subject: async () => ({ data: raw }), detail: async () => { throw new Error("metadata matching does not require whole-series detail"); },
  seasonCandidates: async () => [series], seasonEvidence: async () => season,
  seriesEvidence: async () => { throw new Error("complete metadata must not require actor evidence"); }, ...overrides,
});

test("a unique exact original title and verified season can match without any actor data", async () => {
  let aggregateCalls = 0;
  const result = await matchWith(rawSource, { seriesEvidence: async () => { aggregateCalls++; return null; } })(source);
  assert.equal(result?.id, 42);
  assert.equal(result?.seasonNumber, 3);
  assert.equal(result?.releaseDate, "2025-09-29");
  assert.equal(result?.year, "2025");
  assert.equal(result?.posterPath, season.posterPath);
  assert.equal(result?.overview, season.overview);
  assert.notEqual(source.title.replace(" 第三季", ""), series.title);
  assert.equal(aggregateCalls, 0);
});

test("country order, subsets, disjoint values and missing or unknown regions never block an otherwise verified unique season", async () => {
  for (const [countries, candidateCountries] of [
    [["英国", "美国"], ["US", "GB"]],
    [["美国", "英国"], ["GB", "US"]],
    [["英国", "美国"], ["GB"]],
    [["英国"], ["GB", "US"]],
    [["美国"], ["GB"]],
    [["UK"], ["GB"]],
    [[], []],
    [undefined, undefined],
    [["未识别地区"], ["ZZ"]],
  ] as Array<[string[] | undefined, string[] | undefined]>) {
    let aggregateCalls = 0;
    const result = await matchWith({ ...rawSource, countries }, {
      seasonCandidates: async () => [{ ...series, countryCodes: candidateCountries }],
      seriesEvidence: async () => { aggregateCalls++; return null; },
    })({ ...source, countryCodes: ["JP"] });
    assert.equal(result?.id, 42);
    assert.equal(aggregateCalls, 0);
  }
});

test("missing source full dates remain optional and returned dates always come from the verified season", async () => {
  for (const extra of [{ pubdate: undefined }, { pubdate: [] }, { pubdate: ["2025"] }, { pubdate: ["2025-02-30(英国)"] }]) {
    const result = await matchWith({ ...rawSource, ...extra })(source);
    assert.equal(result?.id, 42);
    assert.equal(result?.releaseDate, season.airDate);
  }
});

test("provided valid dates must include the season premiere for metadata confirmation", async () => {
  assert.equal(await matchWith({ ...rawSource, pubdate: ["2025-10-01(英国)"] })(source), null);
  assert.equal(await matchWith({ ...rawSource, pubdate: undefined, release_date: "2025-10-01" })(source), null);
  for (const extra of [
    { pubdate: ["2025-10-01(海外)", "2025-09-29(英国)"] },
    { pubdate: ["2025-09-29（英国）"] },
    { pubdate: undefined, release_date: "2025-09-29T00:00:00Z" },
  ]) assert.equal((await matchWith({ ...rawSource, ...extra })(source))?.id, 42);
  const withActors = { ...rawSource, pubdate: ["2025-10-01"], actors: [{ name: "演员甲" }, { name: "演员乙" }] };
  assert.equal((await matchWith(withActors, { seasonEvidence: async () => ({ ...season, cast: actors }) })(source))?.id, 42);
});

test("conflicting season identity, year and known episode counts cannot be rescued by actor overlap", async () => {
  const withActors = { ...rawSource, actors: [{ name: "演员甲" }, { name: "演员乙" }] };
  let aggregateCalls = 0;
  const noAggregate = async () => { aggregateCalls++; return null; };
  for (const changed of [{ seriesId: 999 }, { seasonNumber: 2 }, { airDate: "2024-09-29" }, { airDate: "2025-02-30" }, { episodeCount: 8 }]) {
    const result = await matchWith(withActors, { seasonEvidence: async () => ({ ...season, cast: actors, ...changed }), seriesEvidence: noAggregate })(source);
    assert.equal(result, null);
  }
  assert.equal(aggregateCalls, 0);
  assert.equal((await matchWith({ ...rawSource, episodes_count: undefined })(source))?.id, 42);
  assert.equal((await matchWith(rawSource, { seasonEvidence: async () => ({ ...season, episodeCount: undefined }) })(source))?.id, 42);
});

test("missing or mismatched exact original names cannot become a translated-name-only metadata match", async () => {
  assert.equal(await matchWith({ ...rawSource, original_title: undefined }, { seasonCandidates: async () => [{ ...series, title: "警之光" }] })(source), null);
  assert.equal(await matchWith({ ...rawSource, original_title: "Different Original Season 3" }, { seasonCandidates: async () => [{ ...series, title: "警之光" }] })(source), null);
  const noCountry = { ...rawSource, countries: undefined, actors: [{ name: "演员甲" }, { name: "演员乙" }] };
  assert.equal((await matchWith(noCountry, { seasonEvidence: async () => ({ ...season, cast: actors }) })({ ...source, countryCodes: [] }))?.id, 42);
});

test("two same-original candidates cannot be selected by country differences and require independent credit evidence", async () => {
  const pool = [series, { ...series, id: 43, countryCodes: ["US"] }];
  const options = { seasonCandidates: async () => pool, seasonEvidence: async (id: number) => ({ ...season, seriesId: id }) };
  for (const countries of [["GB"], ["US"], [], undefined]) {
    assert.equal(await matchWith(rawSource, { ...options, seasonCandidates: async () => [series, { ...series, id: 43, countryCodes: countries }] })(source), null);
  }
  const withActors = { ...rawSource, actors: [{ name: "演员甲" }, { name: "演员乙" }] };
  const result = await matchWith(withActors, { ...options, seasonEvidence: async id => ({ ...season, seriesId: id, cast: id === 43 ? actors : [] }), seriesEvidence: async () => null })(source);
  assert.equal(result?.id, 43);
});

test("Japanese sequel words are not stripped to manufacture an exact original-name match", async () => {
  const japaneseSource = { ...source, title: "日剧样本 第三季", countryCodes: ["JP"] };
  const japaneseRaw = { ...rawSource, title: japaneseSource.title, original_title: "架空ドラマ 続編", countries: ["日本"] };
  const japaneseSeries = { ...series, title: "日剧样本", originalTitle: "架空ドラマ", countryCodes: ["JP"] };
  assert.equal(await matchWith(japaneseRaw, { seasonCandidates: async () => [japaneseSeries] })(japaneseSource), null);
  let aggregateCalls = 0;
  const result = await matchWith({ ...japaneseRaw, actors: [{ name: "演员甲" }, { name: "演员乙" }] }, {
    seasonCandidates: async () => [japaneseSeries],
    seriesEvidence: async () => { aggregateCalls++; return { seriesId: 42, actors: [{ id: 1, names: ["演员甲"] }, { id: 2, names: ["演员乙"] }] }; },
  })(japaneseSource);
  assert.equal(result?.id, 42);
  assert.equal(aggregateCalls, 1);
});

test("season evidence exposes only known positive integer episode counts from its matching summary", async () => {
  for (const count of [6, undefined, 0, -1, 6.5, "6"]) {
    const payload = { id: 42, seasons: [{ id: 333, season_number: 3, air_date: season.airDate, episode_count: count }], "season/3": { season_number: 3, air_date: season.airDate }, "season/3/credits": { cast: [], crew: [] } };
    const adapter = createTmdbSeasonMatcher(createTmdbClient({ token: "synthetic-token", fetchImpl: async () => Response.json(payload) }));
    assert.equal((await adapter.seasonEvidence(42, 3))?.episodeCount, count === 6 ? 6 : undefined);
  }
});

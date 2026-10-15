import assert from "node:assert/strict";
import test from "node:test";
import { createDoubanMatcher } from "../lib/douban/matcher";
import { enrichDoubanMedia, normalizeDoubanItem } from "../lib/douban/normalize";
import { createTmdbClient, TmdbError } from "../lib/tmdb/client";
import { normalizeMedia } from "../lib/tmdb/normalize";
import { createTmdbSeasonMatcher, type TvSeasonEvidence, type TvSeriesEvidence } from "../lib/tmdb/season-match";

const source = normalizeDoubanItem({ id: "900001", type: "tv", title: "测试连续剧 第二季", year: "2021" }, "tv")!;
const candidate = normalizeMedia({ id: 42, name: "测试连续剧", original_name: "Public Test Series", first_air_date: "2020-01-01", poster_path: "/series.jpg", overview: "整剧简介" }, "tv");
const rawSource = { title: source.title, year: "2021", original_title: "Public Test Series Season 2", actors: [{ name: "演员甲" }, { name: "演员乙" }], directors: [{ name: "导演甲" }] };
const person = (id: number, name: string) => ({ id, name, character: "", profilePath: null });
const season: TvSeasonEvidence = { seriesId: 42, seasonNumber: 2, airDate: "2021-09-05", posterPath: "/season2.jpg", overview: "第二季独有简介", imdbId: "tt1234567", directors: [], cast: [] };
const aggregate: TvSeriesEvidence = { seriesId: 42, actors: [{ id: 1, names: ["演员甲", "Actor A"] }, { id: 2, names: ["演员乙", "Actor B"] }] };
const matcher = (overrides: Partial<Parameters<typeof createDoubanMatcher>[0]> = {}) => createDoubanMatcher({
  search: async () => { throw new Error("explicit season should use season candidates"); },
  subject: async () => ({ data: rawSource }),
  detail: async () => { throw new Error("whole-series detail cannot supply seasonal metadata"); },
  seasonCandidates: async () => [candidate], seasonEvidence: async () => season,
  seriesEvidence: async () => aggregate, ...overrides,
});

test("series actors can confirm identity while returned dates, artwork and synopsis remain from the verified season", async () => {
  const fallbackCalls: number[] = [];
  const result = await matcher({ seriesEvidence: async id => { fallbackCalls.push(id); return aggregate; } })(source);
  assert.equal(result?.id, 42);
  assert.equal(result?.seasonNumber, 2);
  assert.equal(result?.year, "2021");
  assert.equal(result?.releaseDate, season.airDate);
  assert.equal(result?.posterPath, season.posterPath);
  assert.equal(result?.overview, season.overview);
  assert.deepEqual(fallbackCalls, [42]);
  assert.equal(candidate.year, "2020");
  assert.equal(candidate.posterPath, "/series.jpg");
});

test("missing seasonal artwork and synopsis never borrow whole-series fields and enrichment keeps the original Douban season data", async () => {
  const seasonalRow = { ...source, posterPath: "/douban-season.jpg", posterFallbacks: ["/douban-season-backup.jpg"], backdropPath: "/douban-season-still.jpg", overview: "豆瓣该季简介" };
  const result = await matcher({
    seasonCandidates: async () => [{ ...candidate, posterFallbacks: ["/series-backup.jpg"], backdropPath: "/series-backdrop.jpg" }],
    seasonEvidence: async () => ({ ...season, posterPath: null, overview: "" }),
  })(seasonalRow);
  assert.ok(result);
  assert.deepEqual([result.posterPath, result.backdropPath, result.overview], [null, null, ""]);
  assert.equal(result.posterFallbacks, undefined);
  const enriched = enrichDoubanMedia(seasonalRow, result);
  assert.deepEqual([enriched.posterPath, enriched.backdropPath, enriched.overview], [seasonalRow.posterPath, seasonalRow.backdropPath, seasonalRow.overview]);
  assert.deepEqual(enriched.posterFallbacks, seasonalRow.posterFallbacks);
  assert.equal(enriched.seasonNumber, 2);
  assert.equal(enriched.releaseDate, season.airDate);
  const entirelyMissing = enrichDoubanMedia({ ...seasonalRow, posterPath: null, posterFallbacks: undefined, backdropPath: null, overview: "" }, result);
  assert.deepEqual([entirelyMissing.posterPath, entirelyMissing.backdropPath, entirelyMissing.overview], [null, null, ""]);
});

test("direct seasonal actor or director evidence avoids the aggregate fallback entirely", async () => {
  for (const evidence of [{ ...season, cast: [person(1, "演员甲"), person(2, "演员乙")] }, { ...season, directors: ["导演甲"] }]) {
    let fallbackCalls = 0;
    const result = await matcher({ seasonEvidence: async () => evidence, seriesEvidence: async () => { fallbackCalls++; return aggregate; } })(source);
    assert.equal(result?.id, 42);
    assert.equal(fallbackCalls, 0);
  }
});

test("title, series, season and year guards must pass before any aggregate evidence is requested", async () => {
  for (const evidence of [null, { ...season, seriesId: 999 }, { ...season, seasonNumber: 1 }, { ...season, airDate: "2020-09-05" }, { ...season, airDate: "2021-02-30" }]) {
    let fallbackCalls = 0;
    const result = await matcher({ seasonEvidence: async () => evidence, seriesEvidence: async () => { fallbackCalls++; return aggregate; } })(source);
    assert.equal(result, null);
    assert.equal(fallbackCalls, 0);
  }
  for (const other of [{ ...candidate, title: "另一部剧", originalTitle: "Other Show" }, { ...candidate, year: "2022" }, { ...candidate, mediaType: "movie" as const }]) {
    let fallbackCalls = 0;
    assert.equal(await matcher({ seasonCandidates: async () => [other], seriesEvidence: async () => { fallbackCalls++; return aggregate; } })(source), null);
    assert.equal(fallbackCalls, 0);
  }
});

test("aggregate confirmation requires two distinct actor names and people, never a director alone", async () => {
  for (const evidence of [
    null,
    { ...aggregate, seriesId: 999 },
    { seriesId: 42, actors: [], directors: ["导演甲"] },
    { seriesId: 42, actors: [{ id: 1, names: ["演员甲"] }], directors: ["导演甲"] },
    { seriesId: 42, actors: [{ id: 1, names: ["演员甲", "演员乙"] }] },
    { seriesId: 42, actors: [{ id: 1, names: ["演员甲"] }, { id: 1, names: ["演员乙"] }] },
    { seriesId: 42, actors: [{ id: 1, names: ["演员甲"] }, { id: 2, names: ["演员甲"] }] },
    { seriesId: 42, actors: [{ id: 0, names: ["演员甲"] }, { id: 2, names: ["演员乙"] }] },
  ]) {
    assert.equal(await matcher({ seriesEvidence: async () => evidence })(source), null);
  }
  let fallbackCalls = 0;
  assert.equal(await matcher({ subject: async () => ({ data: { ...rawSource, actors: [], directors: [{ name: "导演甲" }] } }), seriesEvidence: async () => { fallbackCalls++; return aggregate; } })(source), null);
  assert.equal(fallbackCalls, 0);
});

test("aggregate evidence does not choose between multiple verified candidates or exceed the candidate bound", async () => {
  for (const count of [2, 5]) {
    let fallbackCalls = 0;
    const candidates = Array.from({ length: count }, (_, index) => ({ ...candidate, id: 42 + index }));
    const result = await matcher({ seasonCandidates: async () => candidates, seasonEvidence: async id => ({ ...season, seriesId: id }), seriesEvidence: async id => { fallbackCalls++; return { ...aggregate, seriesId: id }; } })(source);
    assert.equal(result, null);
    assert.equal(fallbackCalls, count > 4 ? 0 : count);
  }
});

test("aggregate transport failures are not cached as missing matches and successful retries are cached", async () => {
  let calls = 0;
  const match = matcher({ seriesEvidence: async () => {
    if (++calls === 1) throw new Error("temporary aggregate outage");
    return aggregate;
  } });
  await assert.rejects(match(source), /temporary aggregate outage/);
  assert.equal((await match(source))?.seasonNumber, 2);
  assert.equal(calls, 2);
  assert.equal((await match(source))?.seasonNumber, 2);
  assert.equal(calls, 2);
});

test("an absent aggregate adapter leaves unmatched seasons unchanged and ordinary media never call it", async () => {
  assert.equal(await matcher({ seriesEvidence: undefined })(source), null);
  for (const item of [{ ...source, title: "测试连续剧" }, { ...source, mediaType: "movie" as const }]) {
    let calls = 0;
    const match = matcher({ search: async () => [], subject: async () => ({ data: {} }), seriesEvidence: async () => { calls++; return aggregate; } });
    assert.equal(await match(item), null);
    assert.equal(calls, 0);
  }
});

test("aggregate adapter uses the existing TV detail endpoint and retains the complete actor list and aliases", async () => {
  const cast = Array.from({ length: 35 }, (_, index) => ({ id: index + 1, name: `演员${index + 1}`, original_name: `Actor ${index + 1}` }));
  const payload = { id: 42, aggregate_credits: { id: 42, cast: [...cast, { id: 35, name: "末位演员别名", original_name: "Actor 35" }, { id: 0, name: "无效演员" }, { id: "999", name: "字符串编号" }] } };
  const urls: URL[] = [];
  const adapter = createTmdbSeasonMatcher(createTmdbClient({ token: "synthetic-token", fetchImpl: async input => { urls.push(new URL(String(input))); return Response.json(payload); } }));
  const result = await adapter.seriesEvidence(42);
  assert.equal(urls[0].pathname, "/3/tv/42");
  assert.ok(urls[0].searchParams.get("append_to_response")?.split(",").includes("aggregate_credits"));
  assert.equal(urls[0].searchParams.get("language"), "zh-CN");
  assert.equal(result?.seriesId, 42);
  assert.equal(result?.actors.length, 35);
  assert.deepEqual(result?.actors.find(actor => actor.id === 35)?.names, ["演员35", "Actor 35", "末位演员别名"]);
  assert.equal(new Set(result?.actors.map(actor => actor.id)).size, 35);
});

test("aggregate adapter rejects wrong series identity or broken cast structures instead of treating them as absent evidence", async () => {
  for (const payload of [{ id: 999, aggregate_credits: { cast: [] } }, { id: 42 }, { id: 42, aggregate_credits: { cast: {} } }, { id: 42, aggregate_credits: { id: 999, cast: [] } }]) {
    const adapter = createTmdbSeasonMatcher(createTmdbClient({ token: "synthetic-token", fetchImpl: async () => Response.json(payload) }));
    await assert.rejects(adapter.seriesEvidence(42), (error: unknown) => error instanceof TmdbError && error.code === "TMDB_INVALID_RESPONSE" && error.status === 502);
  }
  let calls = 0;
  const adapter = createTmdbSeasonMatcher(createTmdbClient({ token: "synthetic-token", fetchImpl: async () => { calls++; return Response.json({ id: 42, aggregate_credits: { cast: [] } }); } }));
  for (const id of [0, -1, 1.5, Number.NaN]) assert.equal(await adapter.seriesEvidence(id), null);
  assert.equal(calls, 0);
  assert.deepEqual(await adapter.seriesEvidence(42), { seriesId: 42, actors: [] });
});

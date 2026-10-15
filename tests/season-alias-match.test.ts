import assert from "node:assert/strict";
import test from "node:test";
import { createDoubanMatcher } from "../lib/douban/matcher";
import { normalizeDoubanItem } from "../lib/douban/normalize";
import { searchTitle } from "../lib/media-match";
import { createTmdbClient } from "../lib/tmdb/client";
import { normalizeMedia } from "../lib/tmdb/normalize";
import { createTmdbSeasonMatcher, type TvSeasonEvidence } from "../lib/tmdb/season-match";

const source = normalizeDoubanItem({ id: "700002", type: "tv", title: "别名剧 第二季", original_title: "CANON 2", year: "2026" }, "tv")!;
const candidate = normalizeMedia({ id: 42, name: "CANON", original_name: "CANON", first_air_date: "2023-01-01" }, "tv");
const actors = [{ id: 1, name: "演员甲", character: "", profilePath: null }, { id: 2, name: "演员乙", character: "", profilePath: null }];
const raw = { id: source.doubanId, title: source.title, original_title: "CANON 2", year: "2026", pubdate: ["2026-07-26"], actors: actors.map(actor => ({ name: actor.name })) };
const season: TvSeasonEvidence = { seriesId: 42, seasonNumber: 2, airDate: "2026-07-19", posterPath: "/season2.jpg", overview: "", imdbId: null, directors: [], cast: actors, aliases: ["别名剧"] };
const matcher = (overrides: Partial<Parameters<typeof createDoubanMatcher>[0]> = {}) => createDoubanMatcher({
  search: async () => [], subject: async () => ({ data: raw }), detail: async () => { throw new Error("unexpected whole-series evidence"); },
  seasonCandidates: async title => title === source.title ? [candidate] : [], seasonEvidence: async () => season,
  seriesEvidence: async () => null, ...overrides,
});

test("an official exact alias retains a Chinese-search candidate and then requires seasonal identity evidence", async () => {
  const searches: string[] = [], seasons: number[] = [];
  const result = await matcher({ seasonCandidates: async title => { searches.push(title); return title === source.title ? [candidate] : []; }, seasonEvidence: async id => { seasons.push(id); return season; } })(source);
  assert.equal(result?.id, 42);
  assert.equal(result?.seasonNumber, 2);
  assert.equal(result?.releaseDate, "2026-07-19");
  assert.equal(result?.posterPath, "/season2.jpg");
  assert.deepEqual(searches, [source.title, "CANON 2"]);
  assert.deepEqual(seasons, [42]);
  assert.equal(searchTitle("CANON 2", "tv"), "CANON 2", "a bare digit is not automatically a season suffix");
});

test("a search hit without an official exact alias cannot match even when its actors overlap", async () => {
  for (const aliases of [undefined, [], ["别名剧场"], ["CANON"]]) {
    let aggregateCalls = 0;
    const result = await matcher({ seasonEvidence: async () => ({ ...season, aliases }), seriesEvidence: async () => { aggregateCalls++; return { seriesId: 42, actors: actors.map(actor => ({ id: actor.id, names: [actor.name] })) }; } })(source);
    assert.equal(result, null);
    assert.equal(aggregateCalls, 0);
  }
});

test("official aliases cannot override wrong series, season, year or invalid dates", async () => {
  for (const changes of [{ seriesId: 999 }, { seasonNumber: 1 }, { airDate: "2025-07-19" }, { airDate: "2026-02-30" }]) {
    assert.equal(await matcher({ seasonEvidence: async () => ({ ...season, ...changes }) })(source), null);
  }
});

test("duplicate aliases are one naming fact and cannot replace missing actor evidence", async () => {
  assert.equal(await matcher({ seasonEvidence: async () => ({ ...season, aliases: ["别名剧", "别名剧", " 别名剧 "], cast: [] }) })(source), null);
  assert.equal((await matcher({ seasonEvidence: async () => ({ ...season, aliases: ["别名剧", "别名剧"] }) })(source))?.id, 42);
});

test("raw candidate unions are deduplicated and bounded before requesting official aliases", async () => {
  let seasonCalls = 0;
  const pool = Array.from({ length: 5 }, (_, index) => ({ ...candidate, id: index + 1 }));
  const overLimit = matcher({ seasonCandidates: async title => title === source.title ? pool.slice(0, 3) : pool.slice(3), seasonEvidence: async () => { seasonCalls++; return season; } });
  assert.equal(await overLimit(source), null);
  assert.equal(seasonCalls, 0);
  const duplicates = matcher({ seasonCandidates: async () => [candidate, candidate, candidate], seasonEvidence: async () => { seasonCalls++; return season; } });
  assert.equal((await duplicates(source))?.id, 42);
  assert.equal(seasonCalls, 1);
});

test("multiple alias-authorized seasons remain ambiguous instead of choosing a search ranking", async () => {
  const result = await matcher({ seasonCandidates: async () => [candidate, { ...candidate, id: 43 }], seasonEvidence: async id => ({ ...season, seriesId: id }) })(source);
  assert.equal(result, null);
});

test("exact original-name candidates keep their existing path without needing alternative-title evidence", async () => {
  let searchCalls = 0;
  const result = await matcher({ subject: async () => ({ data: { ...raw, original_title: "CANON Season 2" } }), seasonCandidates: async () => { searchCalls++; return [candidate, { ...candidate, id: 99, originalTitle: "Other", title: "Other" }]; }, seasonEvidence: async () => ({ ...season, aliases: undefined }) })(source);
  assert.equal(result?.id, 42);
  assert.equal(searchCalls, 1);
});

function seasonResponse(alternativeTitles: unknown) {
  return { id: 42, seasons: [{ id: 200, season_number: 2, air_date: season.airDate }], "season/2": { season_number: 2, air_date: season.airDate }, "season/2/credits": { cast: actors, crew: [] }, alternative_titles: alternativeTitles };
}
const adapter = (payload: unknown) => createTmdbSeasonMatcher(createTmdbClient({ token: "synthetic-token", fetchImpl: async () => Response.json(payload) }));

test("the adapter reads only well-formed aliases attached to the requested series and deduplicates titles", async () => {
  const payload = seasonResponse({ id: 42, results: [{ iso_3166_1: "CN", title: "别名剧" }, { title: "别名剧" }, { title: " " }, { title: 123 }, null] });
  assert.deepEqual((await adapter(payload).seasonEvidence(42, 2))?.aliases, ["别名剧"]);
  for (const block of [undefined, null, [], { id: 99, results: [{ title: "别名剧" }] }, { results: {} }, { results: ["别名剧", { title: 123 }] }]) {
    const evidence = await adapter(seasonResponse(block)).seasonEvidence(42, 2);
    assert.deepEqual(evidence?.aliases ?? [], []);
    assert.equal(await matcher({ seasonEvidence: async () => evidence })(source), null);
  }
});

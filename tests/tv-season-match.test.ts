import assert from "node:assert/strict";
import test from "node:test";
import { searchTitle, tvSeasonNumber } from "../lib/media-match";
import { createTmdbClient } from "../lib/tmdb/client";
import { createTmdbSeasonMatcher } from "../lib/tmdb/season-match";

const json = (value: unknown) => new Response(JSON.stringify(value));
const seasonPayload = () => ({
  id: 298931,
  seasons: [{ id: 777, season_number: 2, air_date: "2026-10-08" }],
  "season/2": { id: 777, season_number: 2, air_date: "2026-10-08", poster_path: "/season-two.jpg", overview: "第二季简介", episodes: [{ show_id: 298931, season_number: 2 }] },
  "season/2/credits": { id: 777, cast: [{ id: 1, name: "演员甲", original_name: "Actor A", character: "角色甲" }, { id: 2, name: "演员乙", original_name: "Actor B", character: "角色乙" }], crew: [{ id: 3, job: "Director", name: "季导演", original_name: "Season Director" }] },
  credits: { cast: [{ id: 99, name: "仅整剧演员" }], crew: [{ job: "Director", name: "仅整剧导演" }] },
  external_ids: { imdb_id: "tt1234567" },
});
const adapter = (payload: unknown) => createTmdbSeasonMatcher(createTmdbClient({ token: "synthetic-token", fetchImpl: async () => json(payload) }));

test("only explicit valid season suffixes are parsed and ordinary words such as Class2 remain whole", () => {
  for (const [title, number] of [["示例 第一季", 1], ["示例第十季", 10], ["示例 第十一季", 11], ["示例 第二十季", 20], ["示例 第九十九季", 99], ["Public Show Season 2", 2], ["Public Show S03", 3], ["示例 第２季", 2]] as const) {
    assert.equal(tvSeasonNumber(title), number);
  }
  for (const title of ["Class2", "Seasons", "Public Show", "Public Show Season 0", "Public Show S100", "示例 第零季", "示例 第一百季", "示例 第二季 下部"]) assert.equal(tvSeasonNumber(title), null);
  assert.equal(searchTitle("Class2", "tv"), "Class2");
  assert.equal(searchTitle("Public Show Season 2", "tv"), "Public Show");
  assert.equal(searchTitle("示例 第二季", "tv"), "示例");
  assert.equal(searchTitle("示例 第２季", "tv"), "示例");
  assert.equal(searchTitle("示例 第二季", "movie"), "示例 第二季");
});

test("explicit-season candidates search the series title without filtering by the later season year", async () => {
  const seen: URL[] = [];
  const matcher = createTmdbSeasonMatcher(createTmdbClient({ token: "synthetic-token", fetchImpl: async input => {
    seen.push(new URL(String(input)));
    return json({ results: [{ id: 298931, name: "示例", first_air_date: "2025-10-09" }] });
  } }));
  const result = await matcher.seasonCandidates("示例 第二季");
  assert.equal(result[0].id, 298931);
  assert.equal(result[0].year, "2025");
  assert.equal(seen[0].pathname, "/3/search/tv");
  assert.equal(seen[0].searchParams.get("query"), "示例");
  assert.equal(seen[0].searchParams.has("year"), false);
  assert.equal(seen[0].searchParams.has("first_air_date_year"), false);
});

test("season evidence uses appended season credits and never substitutes whole-series credits", async () => {
  let requestUrl = "";
  const matcher = createTmdbSeasonMatcher(createTmdbClient({ token: "synthetic-token", fetchImpl: async input => { requestUrl = String(input); return json(seasonPayload()); } }));
  const evidence = await matcher.seasonEvidence(298931, 2);
  assert.ok(evidence);
  assert.equal(evidence.seriesId, 298931);
  assert.equal(evidence.seasonNumber, 2);
  assert.equal(evidence.airDate, "2026-10-08");
  assert.equal(evidence.posterPath, "/season-two.jpg");
  assert.equal(evidence.imdbId, "tt1234567");
  assert.deepEqual(new Set(evidence.cast.map(actor => actor.id)), new Set([1, 2]));
  assert.ok(evidence.cast.some(actor => actor.name === "Actor A"));
  assert.ok(!evidence.directors.includes("仅整剧导演"));
  const url = new URL(requestUrl);
  assert.equal(url.pathname, "/3/tv/298931");
  assert.deepEqual(new Set(url.searchParams.get("append_to_response")?.split(",")), new Set(["season/2", "season/2/credits", "external_ids", "alternative_titles"]));
  const omittedIds = seasonPayload();
  delete (omittedIds["season/2"] as Partial<typeof omittedIds["season/2"]>).id;
  delete (omittedIds["season/2/credits"] as Partial<typeof omittedIds["season/2/credits"]>).id;
  assert.equal((await adapter(omittedIds).seasonEvidence(298931, 2))?.seriesId, 298931);
  const missing = seasonPayload();
  delete (missing as Partial<typeof missing>)["season/2/credits"];
  const empty = await adapter(missing).seasonEvidence(298931, 2);
  assert.deepEqual(empty?.cast ?? [], []);
  assert.deepEqual(empty?.directors ?? [], []);
});

test("conflicting season summaries, appended identities and episode identities are rejected", async () => {
  const fixtures = [
    (() => { const data = seasonPayload(); data.seasons[0].air_date = "2025-10-08"; return data; })(),
    (() => { const data = seasonPayload(); data.seasons.push({ ...data.seasons[0] }); return data; })(),
    (() => { const data = seasonPayload(); data["season/2"].season_number = 1; return data; })(),
    (() => { const data = seasonPayload(); data["season/2"].id = 999; return data; })(),
    (() => { const data = seasonPayload(); data["season/2/credits"].id = 999; return data; })(),
    (() => { const data = seasonPayload(); data["season/2"].episodes[0].show_id = 999; return data; })(),
    (() => { const data = seasonPayload(); data["season/2"].episodes[0].season_number = 1; return data; })(),
    (() => { const data = seasonPayload(); data["season/2"].air_date = data.seasons[0].air_date = "2026-02-30"; return data; })(),
  ];
  for (const data of fixtures) assert.equal(await adapter(data).seasonEvidence(298931, 2), null);
});

test("invalid series or season identifiers never create a TMDB request", async () => {
  let calls = 0;
  const matcher = createTmdbSeasonMatcher(createTmdbClient({ token: "synthetic-token", fetchImpl: async () => { calls++; return json(seasonPayload()); } }));
  for (const [id, number] of [[0, 2], [-1, 2], [1.5, 2], [Number.NaN, 2], [298931, 0], [298931, 100], [298931, 2.5]]) assert.equal(await matcher.seasonEvidence(id, number), null);
  assert.deepEqual(await matcher.seasonCandidates(""), []);
  assert.equal(calls, 0);
});

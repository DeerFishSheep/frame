import assert from "node:assert/strict";
import test from "node:test";
import { createDoubanMatcher } from "../lib/douban/matcher";
import { normalizeDoubanItem } from "../lib/douban/normalize";
import { normalizeDetail } from "../lib/tmdb/normalize";
import type { TvSeasonEvidence } from "../lib/tmdb/season-match";
import type { Media, MediaDetail, MediaType } from "../lib/types";

const source = normalizeDoubanItem({ id: "26580232", title: "看不见的客人", original_title: "Contratiempo", year: "2016", type: "movie" }, "movie")!;
const candidate = (id = 411088, year = "2017", mediaType: MediaType = "movie"): Media => ({ ...source, id, year, mediaType, source: "tmdb" });
const person = (name: string, id: number) => ({ id, name, character: "", profilePath: null });
const detail = (item: Media, directors = ["奥里奥尔·保罗"], actors: string[] = []): MediaDetail => ({
  ...normalizeDetail({ id: item.id }, item.mediaType), ...item, id: Number(item.id), directors, cast: actors.map(person), imdbId: "tt4857264",
});
const evidence = { original_title: "Contratiempo", directors: [{ name: "奥里奥尔·保罗" }], actors: [{ name: "马里奥·卡萨斯" }, { name: "阿娜·瓦格纳" }] };

test("a year-constrained search can return an adjacent release year, which requires unique credit confirmation", async () => {
  const calls: [string, string, MediaType][] = [], details: string[] = [];
  const actual = candidate(), remake = { ...candidate(1058588, "2026"), originalTitle: "The Invisible Guest" };
  const match = createDoubanMatcher({
    search: async (title, year, media) => { calls.push([title, year, media]); return [remake, actual]; },
    subject: async () => ({ data: evidence }),
    detail: async (_media, id) => { details.push(id); return { detail: detail(actual) }; },
  });
  const result = await match(source);
  assert.equal(result?.id, 411088); assert.equal(result?.imdbId, "tt4857264");
  assert.ok(calls.length >= 1 && calls.length <= 2);
  assert.ok(calls.every(([, year, media]) => year === "2016" && media === "movie"));
  assert.deepEqual(details, ["411088"]);
});

test("exact same-year unique matches retain the fast path without subject or detail requests", async () => {
  let searches = 0;
  const expected = candidate(411088, "2016");
  const match = createDoubanMatcher({ search: async () => { searches++; return [expected]; }, subject: async () => { throw new Error("unnecessary subject"); }, detail: async () => { throw new Error("unnecessary detail"); } });
  assert.equal(await match(source), expected); assert.equal(searches, 1);
});

test("adjacent-year single candidates remain unmatched without credits or with only one distinct actor", async () => {
  for (const data of [{ original_title: "Contratiempo" }, { original_title: "Contratiempo", actors: [{ name: "A" }] }, { original_title: "Contratiempo", actors: [{ name: "A" }, { name: "A" }] }]) {
    const actual = candidate();
    const match = createDoubanMatcher({ search: async () => [actual], subject: async () => ({ data }), detail: async () => ({ detail: detail(actual, [], ["A", "A"]) }) });
    assert.equal(await match(source), null);
  }
});

test("two distinct matching actors can confirm adjacent-year identity without a director", async () => {
  const actual = candidate();
  const match = createDoubanMatcher({ search: async () => [actual], subject: async () => ({ data: { original_title: "Contratiempo", actors: [{ name: "A" }, { latin_name: "B" }] } }), detail: async () => ({ detail: detail(actual, [], ["A", "B"]) }) });
  assert.equal((await match(source))?.id, actual.id);
});

test("two display names belonging to one actor ID cannot confirm an adjacent-year identity", async () => {
  const actual = candidate();
  const duplicatePerson = { ...detail(actual, []), cast: [person("A", 42), person("B", 42)] };
  const match = createDoubanMatcher({
    search: async () => [actual],
    subject: async () => ({ data: { original_title: "Contratiempo", actors: [{ name: "A" }, { name: "B" }] } }),
    detail: async () => ({ detail: duplicatePerson }),
  });
  assert.equal(await match(source), null);
});

test("year tolerance is limited to movies within one year and never selects a remote remake or wrong medium", async () => {
  for (const item of [candidate(1, "2014"), candidate(2, "2018"), candidate(3, "2026"), candidate(4, "2017", "tv")]) {
    let details = 0;
    const match = createDoubanMatcher({ search: async () => [item], subject: async () => ({ data: evidence }), detail: async () => { details++; return { detail: detail(item) }; } });
    assert.equal(await match(source), null); assert.equal(details, 0);
  }
  const tvSource = { ...source, mediaType: "tv" as const }, nextSeason = candidate(5, "2017", "tv");
  const tv = createDoubanMatcher({ search: async () => [nextSeason], subject: async () => ({ data: evidence }), detail: async () => { throw new Error("must not widen TV seasons"); } });
  assert.equal(await tv(tvSource), null);
});

test("both adjacent year directions are accepted only after matching credits", async () => {
  for (const year of ["2015", "2017"]) {
    const actual = candidate(411088, year);
    let checked = 0;
    const match = createDoubanMatcher({ search: async () => [actual], subject: async () => ({ data: evidence }), detail: async () => { checked++; return { detail: detail(actual) }; } });
    assert.equal((await match(source))?.id, actual.id); assert.equal(checked, 1);
  }
});

test("matching credits cannot rescue a different title, ambiguous identities or mismatched detail responses", async () => {
  const a = candidate(), b = candidate(12345);
  const ambiguous = createDoubanMatcher({ search: async () => [b, a], subject: async () => ({ data: evidence }), detail: async (_media, id) => ({ detail: detail(id === String(a.id) ? a : b) }) });
  assert.equal(await ambiguous(source), null);
  const other = { ...a, title: "另一个故事", originalTitle: "Another Story" };
  const wrongTitle = createDoubanMatcher({ search: async () => [other], subject: async () => ({ data: evidence }), detail: async () => { throw new Error("title must match first"); } });
  assert.equal(await wrongTitle(source), null);
  for (const bad of [{ ...detail(a), id: 999 }, { ...detail(a), mediaType: "tv" as const }]) {
    const mismatch = createDoubanMatcher({ search: async () => [a], subject: async () => ({ data: evidence }), detail: async () => ({ detail: bad }) });
    assert.equal(await mismatch(source), null);
  }
});

// The candidate bound was raised from four to eight: real Douban records carry same-name pools larger than four
// (a 2026 remake beside its 2014 and 2012 originals), and the bound is a request-cost limit, not an identity rule.
test("matching work is bounded to two constrained searches, one subject and at most eight candidate details", async () => {
  for (const count of [8, 9]) {
    let searches = 0, subjects = 0, details = 0;
    const pool = Array.from({ length: count }, (_, index) => candidate(index + 1));
    const match = createDoubanMatcher({ search: async (_title, year) => { assert.equal(year, "2016"); searches++; return pool; }, subject: async () => { subjects++; return { data: evidence }; }, detail: async (_media, id) => { details++; return { detail: detail(pool.find(item => String(item.id) === id)!, ["unrelated"]) }; } });
    assert.equal(await match(source), null);
    assert.ok(searches <= 2); assert.equal(subjects, 1); assert.equal(details, count === 8 ? 8 : 0);
  }
  for (const year of ["", "16", "2016x"]) {
    let calls = 0;
    const match = createDoubanMatcher({ search: async () => { calls++; return []; }, subject: async () => { calls++; return { data: evidence }; }, detail: async () => { calls++; return { detail: detail(candidate()) }; } });
    assert.equal(await match({ ...source, year }), null); assert.equal(calls, 0);
  }
});

test("duplicate search results are one identity and original-title results retain adjacent-year evidence", async () => {
  const actual = { ...candidate(), title: "其他中文译名" }, searches: string[] = [];
  const chinese: Media[] = [], originals = [actual, actual];
  let details = 0;
  const match = createDoubanMatcher({ search: async title => { searches.push(title); return title === source.title ? chinese : originals; }, subject: async () => ({ data: evidence }), detail: async () => { details++; return { detail: detail(actual) }; } });
  assert.equal((await match(source))?.id, actual.id);
  assert.deepEqual(searches, [source.title, "Contratiempo"]); assert.equal(details, 1);
  assert.deepEqual(chinese, []); assert.deepEqual(originals, [actual, actual]);
});

test("matching failures do not poison cache and concurrent retries share one resolution", async () => {
  let searches = 0, subjects = 0;
  const actual = candidate();
  const match = createDoubanMatcher({ search: async () => { searches++; return [actual]; }, subject: async () => { if (++subjects === 1) throw new Error("temporary outage"); return { data: evidence }; }, detail: async () => ({ detail: detail(actual) }) });
  await assert.rejects(match(source), /temporary outage/);
  const [a, b] = await Promise.all([match(source), match(source)]);
  assert.equal(a?.id, actual.id); assert.equal(b?.id, actual.id); assert.equal(subjects, 2);
  const before = searches; await match(source); assert.equal(searches, before);
});

test("successful cache expires after one hour and negative cache after five minutes", async () => {
  for (const succeeds of [false, true]) {
    let now = 0, calls = 0;
    const actual = candidate(411088, "2016"), ttl = (succeeds ? 60 : 5) * 60_000;
    const match = createDoubanMatcher({ now: () => now, search: async () => { calls++; return succeeds ? [actual] : []; }, subject: async () => ({ data: {} }), detail: async () => { throw new Error("not required"); } });
    await match(source); const first = calls;
    now = ttl - 1; await match(source); assert.equal(calls, first);
    now = ttl; await match(source); assert.equal(calls, first * 2);
  }
});

const seasonSource = normalizeDoubanItem({ id: "38353939", title: "杀死你的旅途 第二季", year: "2026", type: "tv" }, "tv")!;
const series = { ...candidate(298931, "2025", "tv"), title: "杀死你的旅途", originalTitle: "Public Journey", releaseDate: "2025-10-09", posterPath: "/series.jpg" };
const seasonSubject = { title: seasonSource.title, year: "2026", original_title: "Public Journey Season 2", actors: [{ name: "演员甲" }, { name: "演员乙" }] };
const season: TvSeasonEvidence = {
  seriesId: 298931, seasonNumber: 2, airDate: "2026-10-08", posterPath: "/season-two.jpg", overview: "第二季简介",
  imdbId: "tt1234567", directors: [], cast: [person("演员甲", 1), person("演员乙", 2)],
};
const seasonMatcher = (overrides: Partial<Parameters<typeof createDoubanMatcher>[0]> = {}) => createDoubanMatcher({
  search: async () => { throw new Error("explicit seasons must not use the series-year fast path"); },
  subject: async () => ({ data: seasonSubject }),
  detail: async () => { throw new Error("series credits are not season credits"); },
  seasonCandidates: async () => [series], seasonEvidence: async () => season, ...overrides,
});

test("an explicit later season resolves against its own air date and credits despite an older series premiere", async () => {
  const evidenceCalls: Array<[number, number]> = [];
  const match = seasonMatcher({ seasonEvidence: async (id, number) => { evidenceCalls.push([id, number]); return season; } });
  const result = await match(seasonSource);
  assert.equal(result?.id, 298931);
  assert.equal(result?.year, "2026");
  assert.equal(result?.releaseDate, "2026-10-08");
  assert.equal(result?.posterPath, "/season-two.jpg");
  assert.equal(result?.overview, "第二季简介");
  assert.deepEqual(evidenceCalls, [[298931, 2]]);
  assert.equal(series.year, "2025");
  assert.equal(series.posterPath, "/series.jpg");
});

test("an explicit first season and a unique same-year series still require genuine season evidence", async () => {
  const first = { ...seasonSource, title: "杀死你的旅途 第一季", year: "2025" };
  let checked = 0;
  const match = seasonMatcher({
    subject: async () => ({ data: { ...seasonSubject, title: first.title, year: "2025", original_title: "Public Journey Season 1" } }),
    seasonEvidence: async () => { checked++; return null; },
  });
  assert.equal(await match(first), null);
  assert.equal(checked, 1);
});

test("season mapping with incomplete metadata rejects missing evidence, duplicated actor identities, and unrelated season credits", async () => {
  const incomplete = { ...seasonSubject, original_title: undefined };
  for (const data of [{ title: seasonSource.title }, { ...incomplete, actors: [{ name: "演员甲" }] }, { ...incomplete, actors: [{ name: "演员甲" }, { name: "演员甲" }] }]) {
    let searched = 0;
    const match = seasonMatcher({ subject: async () => ({ data }), seasonCandidates: async () => { searched++; return [series]; } });
    assert.equal(await match(seasonSource), null);
    assert.equal(searched, 1);
  }
  for (const cast of [[person("演员甲", 1)], [person("演员甲", 1), person("演员乙", 1)], [person("另一演员", 3), person("别的演员", 4)]]) {
    assert.equal(await seasonMatcher({ subject: async () => ({ data: incomplete }), seasonEvidence: async () => ({ ...season, cast }) })(seasonSource), null);
  }
  const directorMatch = seasonMatcher({ subject: async () => ({ data: { ...incomplete, actors: [], directors: [{ name: "该季导演" }] } }), seasonEvidence: async () => ({ ...season, cast: [], directors: ["该季导演"] }) });
  assert.equal((await directorMatch(seasonSource))?.id, series.id);
});

test("wrong series, season number, invalid air date or mismatched season year cannot confirm a match", async () => {
  for (const changed of [
    { seriesId: 999 }, { seasonNumber: 1 }, { airDate: "2025-10-08" }, { airDate: "2027-10-08" },
    { airDate: "2026-02-30" }, { airDate: "2026" },
  ]) {
    assert.equal(await seasonMatcher({ seasonEvidence: async () => ({ ...season, ...changed }) })(seasonSource), null);
  }
  for (const wrong of [{ ...series, id: 123, title: "另一部剧", originalTitle: "Other Show" }, { ...series, year: "2027" }, { ...series, mediaType: "movie" as const }]) {
    let inspected = 0;
    const match = seasonMatcher({ seasonCandidates: async () => [wrong], seasonEvidence: async () => { inspected++; return season; } });
    assert.equal(await match(seasonSource), null);
    assert.equal(inspected, wrong.id === 123 ? 1 : 0, "a plausible alternate title may need one official-alias lookup; wrong-year/type candidates do not");
  }
});

test("conflicting source season numbers or years and invalid season suffixes remain unmatched", async () => {
  for (const changed of [{ year: "2025" }, { title: "杀死你的旅途 第三季" }, { original_title: "Public Journey Season 3" }]) {
    let searched = 0;
    const match = seasonMatcher({ subject: async () => ({ data: { ...seasonSubject, ...changed } }), seasonCandidates: async () => { searched++; return [series]; } });
    assert.equal(await match(seasonSource), null);
    assert.equal(searched, 0);
  }
  for (const title of ["杀死你的旅途 第零季", "杀死你的旅途 第一百季", "Public Journey Season 0", "Public Journey S100"]) {
    assert.equal(await seasonMatcher()({ ...seasonSource, title }), null);
  }
});

test("ambiguous season matches and overlarge candidate sets are rejected instead of choosing the first hit", async () => {
  for (const count of [2, 4, 8, 9]) {
    let inspected = 0;
    const pool = Array.from({ length: count }, (_, index) => ({ ...series, id: series.id as number + index }));
    const match = seasonMatcher({ seasonCandidates: async () => pool, seasonEvidence: async id => { inspected++; return { ...season, seriesId: id }; } });
    assert.equal(await match(seasonSource), null);
    assert.equal(inspected, count > 8 ? 0 : count);
  }
  let inspected = 0;
  const duplicates = seasonMatcher({ seasonCandidates: async () => [series, series], seasonEvidence: async () => { inspected++; return season; } });
  assert.equal((await duplicates(seasonSource))?.id, series.id);
  assert.equal(inspected, 1);
});

test("original-title season fallback is bounded and cannot broaden ordinary TV or movie searches", async () => {
  const searches: string[] = [];
  const translated = { ...series, title: "另一译名" };
  const match = seasonMatcher({ seasonCandidates: async title => { searches.push(title); return title === seasonSource.title ? [] : [translated]; } });
  assert.equal((await match(seasonSource))?.id, series.id);
  assert.deepEqual(searches, [seasonSource.title, "Public Journey Season 2"]);
  for (const item of [{ ...seasonSource, title: "杀死你的旅途" }, { ...seasonSource, mediaType: "movie" as const }]) {
    let broadSearches = 0;
    const ordinary = createDoubanMatcher({ search: async () => [], subject: async () => ({ data: {} }), detail: async () => { throw new Error("unused"); }, seasonCandidates: async () => { broadSearches++; return [series]; }, seasonEvidence: async () => season });
    assert.equal(await ordinary(item), null);
    assert.equal(broadSearches, 0);
  }
});

import assert from "node:assert/strict";
import test from "node:test";
import { createDoubanMatcher } from "../lib/douban/matcher";
import { normalizeDoubanItem } from "../lib/douban/normalize";
import { normalizeDetail } from "../lib/tmdb/normalize";
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

test("matching work is bounded to two constrained searches, one subject and at most four candidate details", async () => {
  for (const count of [4, 5]) {
    let searches = 0, subjects = 0, details = 0;
    const pool = Array.from({ length: count }, (_, index) => candidate(index + 1));
    const match = createDoubanMatcher({ search: async (_title, year) => { assert.equal(year, "2016"); searches++; return pool; }, subject: async () => { subjects++; return { data: evidence }; }, detail: async (_media, id) => { details++; return { detail: detail(pool.find(item => String(item.id) === id)!, ["unrelated"]) }; } });
    assert.equal(await match(source), null);
    assert.ok(searches <= 2); assert.equal(subjects, 1); assert.equal(details, count === 4 ? 4 : 0);
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

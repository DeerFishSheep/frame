import assert from "node:assert/strict";
import test from "node:test";
import { crossTypeAttempted, crossTypeFallback, resolveCrossType } from "../lib/douban/cross-type";
import { normalizeDetail } from "../lib/tmdb/normalize";
import type { Media, MediaDetail, MediaType } from "../lib/types";

const media = (overrides: Partial<Media> = {}): Media => ({
  id: 1, mediaType: "tv", title: "示例剧集", originalTitle: "", posterPath: null, backdropPath: null,
  overview: "", releaseDate: "2026-03-21", year: "2026", genreIds: [], genres: [],
  voteAverage: 0, voteCount: 0, popularity: 0, source: "tmdb", ...overrides,
});
const doubanTv = (overrides: Partial<Media> = {}): Media => media({ id: "douban:38079178", doubanId: "38079178", source: "douban", ...overrides });
const movie = (overrides: Partial<Media> = {}): Media => media({ mediaType: "movie", releaseDate: "2026-03-21", ...overrides });
const detail = (item: Media, directors: string[] = [], actors: string[] = []): MediaDetail => ({
  ...normalizeDetail({ id: item.id, release_date: item.releaseDate, title: item.title, original_title: item.originalTitle }, item.mediaType),
  ...item, id: Number(item.id), directors, cast: actors.map((name, index) => ({ id: index + 1, name, character: "", profilePath: null })),
});
const noDetail = async () => { throw new Error("detail must not be requested"); };
const neverSearch = async () => { throw new Error("search must not be requested"); };

test("the cross-type fallback only opens for Douban tv works", () => {
  assert.equal(crossTypeFallback({}, "tv"), "movie");
  assert.equal(crossTypeFallback({}, "movie"), null);
});

test("a tv work with zero tv results resolves to its uniquely verified movie, preferring the original title", async () => {
  const searched: Array<[string, string, MediaType]> = [];
  const target = movie({ id: 1618420, title: "森英恵 蝴蝶之外", originalTitle: "森英恵 蝶の向こう側" });
  const raw = { original_title: "森英恵 蝶の向こう側", directors: [{ name: "竹园元" }], actors: [{ name: "常盘贵子" }] };
  const match = await resolveCrossType(doubanTv({ title: "森英恵 蝴蝶之外" }), raw, [[]], {
    search: async (title, year, type) => { searched.push([title, year, type]); return title === "森英恵 蝶の向こう側" ? [target] : []; },
    detail: async (type, id) => { assert.equal(type, "movie"); assert.equal(id, "1618420"); return { detail: detail(target, ["竹园元"], ["常盘贵子"]) }; },
  });
  assert.equal(match?.id, 1618420);
  assert.equal(match?.mediaType, "movie");
  assert.equal(match?.releaseDate, "2026-03-21");
  assert.equal(match?.year, "2026");
  assert.deepEqual(searched, [["森英恵 蝶の向こう側", "2026", "movie"], ["森英恵 蝴蝶之外", "2026", "movie"]]);
});

test("a Chinese title that differs from the TMDB title is found through the original title alone", async () => {
  const target = movie({ id: 1618890, title: "某小说家的日记", originalTitle: "ある小説家の日記" });
  const match = await resolveCrossType(doubanTv({ title: "某小说家的日记" }), { original_title: "ある小説家の日記", actors: [{ name: "夏帆" }, { name: "仲野太賀" }] }, [[]], {
    search: async title => title === "ある小説家の日記" ? [target] : [],
    detail: async () => ({ detail: detail(target, [], ["夏帆", "仲野太賀"]) }),
  });
  assert.equal(match?.id, 1618890);
});

test("several equally credible movies stay unmatched instead of choosing the first hit", async () => {
  const first = movie({ id: 1, title: "礼物", originalTitle: "ギフト" }), second = movie({ id: 2, title: "礼物", originalTitle: "ギフト" });
  const raw = { original_title: "ギフト", actors: [{ name: "演员甲" }, { name: "演员乙" }] };
  const credible = async (_type: string, id: string) => ({ detail: detail(id === "1" ? first : second, [], ["演员甲", "演员乙"]) });
  let details = 0;
  const ambiguous = await resolveCrossType(doubanTv({ title: "礼物" }), raw, [[]], {
    search: async () => [first, second],
    detail: async (type, id) => { details++; return credible(type, id); },
  });
  assert.equal(ambiguous, null, "two equally credible movies are not a unique best answer");
  assert.equal(details, 2, "every candidate is inspected before the branch gives up");
  const alone = await resolveCrossType(doubanTv({ title: "礼物" }), raw, [[]], {
    search: async () => [second],
    detail: async (type, id) => credible(type, id),
  });
  assert.equal(alone?.id, 2, "the same movie is accepted once it is the only credible candidate");
});

test("a non-empty own-medium pool is never widened to the other medium", async () => {
  const tvResult = media({ id: 99 });
  const match = await resolveCrossType(doubanTv({ title: "问心2" }), { original_title: "问心 2" }, [[tvResult]], { search: neverSearch, detail: noDetail });
  assert.equal(match, null);
});

test("movie sources, season queries and empty search traces never trigger the cross-type branch", async () => {
  const raw = { original_title: "Contratiempo" };
  assert.equal(await resolveCrossType(media({ mediaType: "movie" }), raw, [[]], { search: neverSearch, detail: noDetail }), null);
  assert.equal(await resolveCrossType(doubanTv(), raw, [], { search: neverSearch, detail: noDetail }), null);
  assert.equal(await resolveCrossType(doubanTv(), raw, [[], [movie({ id: 5 })], []], { search: neverSearch, detail: noDetail }), null);
  assert.equal(await resolveCrossType(doubanTv({ year: "2026x" }), raw, [[]], { search: neverSearch, detail: noDetail }), null);
  assert.equal(await resolveCrossType(doubanTv({ title: "" }), {}, [[]], { search: neverSearch, detail: noDetail }), null);
});

test("cross-medium identity never tolerates an adjacent year or a different title", async () => {
  const adjacent = movie({ id: 7, releaseDate: "2025-03-21", year: "2025" });
  const raw = { original_title: "ギフト", directors: [{ name: "堤真一" }] };
  assert.equal(await resolveCrossType(doubanTv(), raw, [[]], { search: async () => [adjacent], detail: async () => ({ detail: detail(adjacent, ["堤真一"]) }) }), null);
  const renamed = movie({ id: 8, title: "另一部电影", originalTitle: "Another Movie" });
  assert.equal(await resolveCrossType(doubanTv(), raw, [[]], { search: async () => [renamed], detail: noDetail }), null);
  // A same-name work with a different original title is decided by credits alone, never by the title collision.
  const sameNameWork = movie({ id: 9, title: "示例剧集", originalTitle: "Other Original" });
  assert.equal(await resolveCrossType(doubanTv(), raw, [[]], { search: async () => [sameNameWork], detail: async () => ({ detail: detail(sameNameWork, [], ["无关演员"]) }) }), null);
  assert.equal((await resolveCrossType(doubanTv(), raw, [[]], { search: async () => [sameNameWork], detail: async () => ({ detail: detail(sameNameWork, ["堤真一"]) }) }))?.id, 9);
});

test("credits, detail identity and release dates still gate the cross-type match", async () => {
  const target = movie({ id: 11, title: "示例剧集", originalTitle: "Original Name" });
  const raw = { original_title: "Original Name", directors: [{ name: "导演甲" }], actors: [{ name: "演员甲" }] };
  const build = (produce: () => Promise<{ detail: MediaDetail }>) => resolveCrossType(doubanTv(), raw, [[]], { search: async () => [target], detail: produce });
  assert.equal(await build(async () => ({ detail: detail(target, ["别的导演"], ["别的演员"]) })), null);
  assert.equal((await build(async () => ({ detail: detail(target, ["导演甲"], []) })))?.id, 11);
  assert.equal(await build(async () => ({ detail: { ...detail(target, ["导演甲"]), id: 999 } })), null);
  assert.equal(await build(async () => ({ detail: { ...detail(target, ["导演甲"]), mediaType: "tv" as const } })), null);
  assert.equal(await build(async () => ({ detail: { ...detail(target, ["导演甲"]), releaseDate: "2026-02-30" } })), null);
  assert.equal(await build(async () => ({ detail: { ...detail(target, ["导演甲"]), releaseDate: "" } })), null);
});

test("duplicate search hits are one identity and only the single credible candidate is accepted", async () => {
  const target = movie({ id: 21, title: "示例剧集", originalTitle: "Original Name" });
  const decoy = movie({ id: 22, title: "示例剧集", originalTitle: "Original Name" });
  const raw = { original_title: "Original Name", actors: [{ name: "演员甲" }, { name: "演员乙" }] };
  const hits = [decoy, target, target];
  let details = 0;
  const match = await resolveCrossType(doubanTv(), raw, [[]], {
    search: async () => hits,
    detail: async (_type, id) => { details++; const item = hits.find(hit => String(hit.id) === id)!; return { detail: detail(item, [], id === "21" ? ["演员甲", "演员乙"] : ["无关演员"]) }; },
  });
  assert.equal(match?.id, 21);
  assert.equal(details, 2, "duplicate ids collapse into one identity, so only two distinct candidates are inspected");
  const bothCredible = await resolveCrossType(doubanTv(), raw, [[]], {
    search: async () => [decoy, target],
    detail: async (_type, id) => { const item = hits.find(hit => String(hit.id) === id)!; return { detail: detail(item, [], ["演员甲", "演员乙"]) }; },
  });
  assert.equal(bothCredible, null, "two credible movies stay unmatched");
});

test("cross-type detail lookups stay bounded and reject every candidate that fails credits", async () => {
  const target = movie({ id: 21, title: "示例剧集", originalTitle: "Original Name" });
  const pool = Array.from({ length: 12 }, (_, index) => movie({ id: index + 30, title: "示例剧集", originalTitle: "Original Name" }));
  const raw = { original_title: "Original Name", actors: [{ name: "演员甲" }, { name: "演员乙" }] };
  let details = 0;
  const capped = await resolveCrossType(doubanTv(), raw, [[]], {
    search: async () => pool,
    detail: async () => { details++; return { detail: detail(pool[0], [], ["别的演员"]) }; },
  });
  assert.equal(capped, null);
  // The cross-type pool is capped at 4 identities: each candidate costs one detail request, so this fallback stays
  // tighter than the ordinary matcher budget of 8 even though it runs on items that already failed once.
  assert.equal(details, 4, "the cross-type candidate pool is capped at four inspected identities");
  details = 0;
  const stop = await resolveCrossType(doubanTv(), raw, [[]], {
    search: async () => [target, ...pool],
    detail: async (_type, id) => { details++; return { detail: detail(id === "21" ? target : pool[0], [], id === "21" ? ["演员甲", "演员乙"] : ["别的演员"]) }; },
  });
  assert.equal(stop?.id, 21);
  assert.equal(details, 4, "the credible candidate wins and every non-credible one is inspected");
  const single = await resolveCrossType(doubanTv(), raw, [[]], {
    search: async () => [target],
    detail: async () => ({ detail: detail(target, [], ["演员甲", "演员乙"]) }),
  });
  assert.equal(single?.id, 21);
});

test("an equal original title plus the very same release day confirms a cross-type movie whose credits cannot be compared", async () => {
  // Real shape: TMDB movie 1618890 carries no director and credits 夏帆 under a name Douban stores too, so only one
  // actor overlaps and creditsMatch can never fire. The authorised evidence is the exactly equal original title
  // together with the identical release day, and it is trusted only while the filtered pool holds one candidate.
  const target = movie({ id: 1618890, title: "某位小说家的日记", originalTitle: "ある小説家の日記", releaseDate: "2026-03-08" });
  const raw = { original_title: "ある小説家の日記", pubdate: ["2026-03-08(日本)"], directors: [{ name: "平竣輔" }], actors: [{ name: "夏帆" }] };
  const match = await resolveCrossType(doubanTv({ title: "某小说家的日记" }), raw, [[]], {
    search: async title => title === "ある小説家の日記" ? [target] : [],
    detail: async () => ({ detail: detail(target, [], ["夏帆"]) }),
  });
  assert.equal(match?.id, 1618890);
  assert.equal(match?.mediaType, "movie");
  assert.equal(match?.releaseDate, "2026-03-08");
});

test("the release-day evidence needs the exact day, a non-empty original title and a single candidate", async () => {
  const target = movie({ id: 1618890, title: "某位小说家的日记", originalTitle: "ある小説家の日記", releaseDate: "2026-03-08" });
  const base = { original_title: "ある小説家の日記", pubdate: ["2026-03-08(日本)"], actors: [{ name: "夏帆" }] };
  const run = (raw: Record<string, unknown>, hits: Media[] = [target]) => resolveCrossType(doubanTv({ title: "某小说家的日记" }), raw, [[]], {
    search: async () => hits, detail: async (_type, id) => ({ detail: detail(hits.find(hit => String(hit.id) === id)!, [], ["夏帆"]) }),
  });
  // A day apart is a different release, never "close enough".
  assert.equal(await run({ ...base, pubdate: ["2026-03-09(日本)"] }), null);
  assert.equal(await run({ ...base, pubdate: ["2026-03"] }), null);
  assert.equal(await run({ ...base, pubdate: undefined }), null);
  // Without an original title there is no exactly-equal name to rely on.
  assert.equal(await run({ pubdate: ["2026-03-08(日本)"], actors: [{ name: "夏帆" }] }), null);
  // Two equally dated candidates must never be resolved by the weaker evidence.
  const twin = movie({ id: 1618891, title: "某位小说家的日记", originalTitle: "ある小説家の日記", releaseDate: "2026-03-08" });
  assert.equal(await run(base, [target, twin]), null);
  // A same-name work of another year is not even a candidate.
  let inspected = 0;
  const otherYear = movie({ id: 1618892, title: "某位小说家的日记", originalTitle: "ある小説家の日記", releaseDate: "2025-03-08", year: "2025" });
  assert.equal(await resolveCrossType(doubanTv({ title: "某小说家的日记" }), base, [[]], { search: async () => [otherYear], detail: async () => { inspected++; return { detail: detail(otherYear, [], ["夏帆"]) }; } }), null);
  assert.equal(inspected, 0);
  // The same candidate with matching credits keeps working, so the weaker evidence is not the only route.
  assert.equal((await resolveCrossType(doubanTv({ title: "某小说家的日记" }), { ...base, actors: [{ name: "演员甲" }, { name: "演员乙" }] }, [[]], {
    search: async () => [target], detail: async () => ({ detail: detail(target, [], ["演员甲", "演员乙"]) }),
  }))?.id, 1618890);
});

test("the release-day evidence is confined to the cross-type branch and never rescues a wrong medium or a missing original name", async () => {
  const target = movie({ id: 5, title: "示例剧集", originalTitle: "Original Name", releaseDate: "2026-03-21" });
  const raw = { original_title: "Original Name", pubdate: ["2026-03-21(日本)"] };
  // A movie source never opens the branch at all, so its in-medium rules stay untouched.
  assert.equal(await resolveCrossType(media({ mediaType: "movie" }), raw, [[]], { search: neverSearch, detail: noDetail }), null);
  // An explicit fallback of the item's own medium is refused as well.
  assert.equal(await resolveCrossType(doubanTv(), raw, [[]], { search: neverSearch, detail: noDetail }, "tv"), null);
  // A detail that answers with another medium is not the candidate it was asked for.
  assert.equal(await resolveCrossType(doubanTv(), raw, [[]], { search: async () => [target], detail: async () => ({ detail: { ...detail(target), mediaType: "tv" as const } }) }), null);
  // An original title that differs from the candidate's is not the authorised evidence.
  assert.equal(await resolveCrossType(doubanTv(), raw, [[]], { search: async () => [target], detail: async () => ({ detail: detail({ ...target, originalTitle: "Different Original" }) }) }), null);
});

test("an item reports whether the cross-type path already ran, so a caller never replays it", async () => {
  const target = movie({ id: 1618420, title: "记录探针剧集", originalTitle: "Record Probe" });
  const item = doubanTv({ title: "记录探针剧集" });
  assert.equal(crossTypeAttempted(item), false, "an untouched item has not been attempted");
  await resolveCrossType(item, { original_title: "Record Probe" }, [[]], {
    search: async () => [target], detail: async () => ({ detail: detail(target, [], ["演员甲", "演员乙"]) }),
  });
  assert.equal(crossTypeAttempted(item), true, "the attempt is recorded as soon as the path runs");
  // The record is per item: another work is still untried, and a different year is a different identity.
  assert.equal(crossTypeAttempted(doubanTv({ title: "别的剧集" })), false);
  assert.equal(crossTypeAttempted(doubanTv({ title: "记录探针剧集", year: "2025" })), false);
  assert.equal(crossTypeAttempted(media({ mediaType: "movie", title: "记录探针剧集" })), false);
});

test("a cross-type attempt that a guard refuses is still recorded, so the caller does not repeat the guard", async () => {
  const item = doubanTv({ title: "记录探针二" });
  assert.equal(crossTypeAttempted(item), false);
  // A non-empty own-medium pool stops the branch before any request; the attempt still counts as made.
  let searched = 0;
  const match = await resolveCrossType(item, { original_title: "킬링 하우스" }, [[media({ id: 7 })]], {
    search: async () => { searched++; return []; }, detail: noDetail,
  });
  assert.equal(match, null);
  assert.equal(searched, 0, "a non-empty own-medium pool costs no cross-type request");
  assert.equal(crossTypeAttempted(item), true);
  // A work whose medium cannot be swapped is refused before the branch is entered, so it stays untried.
  const movieItem = media({ mediaType: "movie", title: "记录探针二" });
  assert.equal(await resolveCrossType(movieItem, {}, [[]], { search: neverSearch, detail: noDetail }), null);
  assert.equal(crossTypeAttempted(movieItem), false);
});

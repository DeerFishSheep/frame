import assert from "node:assert/strict";
import test from "node:test";
import { createDoubanMatcher } from "../lib/douban/matcher";
import { normalizeDoubanItem } from "../lib/douban/normalize";
import { innerSeasonNumber, seasonMarkerNumber } from "../lib/media-match";
import { normalizeMedia } from "../lib/tmdb/normalize";
import type { TvSeasonEvidence } from "../lib/tmdb/season-match";

// A season number written inside a name is only an attempt; the season record must confirm it.
test("an inner season number is read from the name but never from an ordinary number in it", () => {
  for (const [title, expected] of [["晚酌的流派5：夏篇", 5], ["只是朋友2：梦想天开", 2], ["IT狗2.0", 2], ["某剧 第三季", null], ["问心2", null]] as const) {
    assert.equal(innerSeasonNumber(title), expected, title);
  }
  for (const title of ["1923", "24小时", "3年A班", "东京爱情故事2020", "CANON 2", "Se7en"]) {
    assert.equal(innerSeasonNumber(title), null, title);
  }
});

test("a season marker is read wherever a season record states it", () => {
  assert.equal(seasonMarkerNumber("第 5 季 夏篇"), 5);
  assert.equal(seasonMarkerNumber("第 1 季"), 1);
  assert.equal(seasonMarkerNumber("Season 3"), 3);
  assert.equal(seasonMarkerNumber("시즌3"), 3);
  for (const name of ["特别篇", "神木隆之介", "第零季", "S100", ""]) assert.equal(seasonMarkerNumber(name), null, name);
});

const source = normalizeDoubanItem({ id: "700005", type: "tv", title: "测试剧5：夏篇", year: "2026" }, "tv")!;
const raw = { id: source.doubanId, title: source.title, year: "2026", pubdate: ["2026-07-03"] };
const series = normalizeMedia({ id: 42, name: "测试剧", original_name: "Test Show", first_air_date: "2022-07-02" }, "tv");
const located: TvSeasonEvidence = { seriesId: 42, seasonNumber: 6, airDate: "2026-07-03", posterPath: "/s6.jpg", overview: "", imdbId: null, directors: [], cast: [] };
const listed = [{ seasonNumber: 6, name: "第 5 季 夏篇", airDate: "2026-07-03" }];
const matcher = (overrides: Partial<Parameters<typeof createDoubanMatcher>[0]> = {}) => createDoubanMatcher({
  search: async () => [], subject: async () => ({ data: raw }), detail: async () => { throw new Error("unexpected whole-series evidence"); },
  seasonCandidates: async () => [series], seasonEvidence: async (_id, number) => number === 6 ? located : null,
  seriesEvidence: async () => null, seriesSeasons: async () => listed, ...overrides,
});

test("a season the provider numbers differently is located by its own name and premiere date", async () => {
  const result = await matcher()(source);
  assert.equal(result?.id, 42);
  assert.equal(result?.seasonNumber, 6, "the provider season number is the one that loads");
  assert.equal(result?.releaseDate, "2026-07-03");
});

test("a differently numbered season needs both its name and its premiere date to agree", async () => {
  for (const seasons of [
    [{ seasonNumber: 6, name: "第 5 季 夏篇", airDate: "2026-07-04" }],
    [{ seasonNumber: 6, name: "第 4 季 夏篇", airDate: "2026-07-03" }],
    [{ seasonNumber: 6, name: "夏篇", airDate: "2026-07-03" }],
    [{ seasonNumber: 6, name: "第 5 季 夏篇", airDate: "2026-13-03" }],
  ]) {
    assert.equal(await matcher({ seriesSeasons: async () => seasons })(source), null, JSON.stringify(seasons));
  }
  assert.equal(await matcher({ seriesSeasons: undefined })(source), null, "without the season list the number alone decides");
});
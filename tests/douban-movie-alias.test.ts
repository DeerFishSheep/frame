import assert from "node:assert/strict";
import test from "node:test";
import { createDoubanMatcher } from "../lib/douban/matcher";
import { normalizeDoubanItem } from "../lib/douban/normalize";
import { normalizeDetail } from "../lib/tmdb/normalize";
import type { Media, MediaDetail } from "../lib/types";

// A source title often carries a descriptor the provider does not use ("坂本日常 真人版" against "SAKAMOTO DAYS").
// The alias both sides share is then the only name that identifies the work, and it is an identity name for every
// medium, not only for television.
const source = normalizeDoubanItem({ id: "37233625", title: "坂本日常 真人版", original_title: "サカモトデイズ 実写", year: "2026", type: "movie" }, "movie")!;
const raw = {
  id: source.doubanId, title: "坂本日常 真人版", original_title: "サカモトデイズ 実写", year: "2026",
  aka: ["坂本日常(真人电影)", "Sakamoto Days"], pubdate: ["2026-04-29(日本)"],
  directors: [{ name: "福田雄一" }], actors: [{ name: "目黑莲" }, { name: "高桥文哉" }],
};
const work = (): Media => ({ ...source, id: 1548708, year: "2026", mediaType: "movie", source: "tmdb", title: "坂本日常", originalTitle: "SAKAMOTO DAYS", releaseDate: "2026-04-29" });
const detail = (item: Media): MediaDetail => ({
  ...normalizeDetail({ id: item.id, title: item.title, original_title: item.originalTitle, release_date: "2026-04-29" }, "movie"),
  ...item, id: Number(item.id), releaseDate: "2026-04-29", directors: ["福田雄一"], cast: [{ id: 1, name: "目黑莲", character: "", profilePath: null }],
});

test("a movie whose title carries a descriptor the provider omits is identified through its official alias", async () => {
  const match = createDoubanMatcher({
    search: async () => [work()], subject: async () => ({ data: raw }), detail: async () => ({ detail: detail(work()) }),
  });
  const result = await match(source);
  assert.equal(result?.id, 1548708);
  assert.equal(result?.releaseDate, "2026-04-29");
});

test("an alias only identifies a movie when the credits confirm the work", async () => {
  const unrelated: MediaDetail = { ...detail(work()), directors: ["别的导演"], cast: [{ id: 9, name: "别的演员", character: "", profilePath: null }] };
  const match = createDoubanMatcher({
    search: async () => [work()], subject: async () => ({ data: raw }), detail: async () => ({ detail: unrelated }),
  });
  assert.equal(await match(source), null);
});

test("an alias cannot identify a movie the year rules out", async () => {
  const match = createDoubanMatcher({
    search: async () => [{ ...work(), year: "1998" }], subject: async () => ({ data: raw }), detail: async () => ({ detail: detail(work()) }),
  });
  assert.equal(await match(source), null);
});

test("a movie whose name already matches still answers without reading any alias", async () => {
  let searches = 0;
  const exact = { ...work(), title: "坂本日常 真人版", originalTitle: "サカモトデイズ 実写" };
  const match = createDoubanMatcher({
    search: async () => { searches++; return [exact]; }, subject: async () => { throw new Error("unnecessary subject"); }, detail: async () => { throw new Error("unnecessary detail"); },
  });
  assert.equal((await match(source))?.id, 1548708);
  assert.equal(searches, 1);
});
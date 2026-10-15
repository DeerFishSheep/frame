import assert from "node:assert/strict";
import test from "node:test";
import { readDoubanIdentity } from "../lib/douban/identity";
import { createDoubanDetailService } from "../lib/douban/detail";
import { parseFavorites, sameFavorite } from "../lib/favorites";
import { normalizeDetail } from "../lib/tmdb/normalize";
import { mediaHref, mediaKey, type DisplayDetail } from "../lib/types";

const base = normalizeDetail({ id: 325022, name: "测试剧", first_air_date: "2026-10-01" }, "tv");
const item = (title: string) => ({ ...base, title, originalTitle: "", source: "douban" as const, doubanId: "900002" });

test("numbers in titles remain intact unless an independent name supplies an explicit matching season", () => {
  for (const title of ["请回答1988", "24", "购物中心2"]) {
    const identity = readDoubanIdentity(item(title), {});
    assert.deepEqual(identity.names, [title]);
    assert.equal(identity.seasonNumber, undefined);
  }
  const identity = readDoubanIdentity(item("购物中心2"), { aka: ["Shopping Center Season 2", "请回答1988", "24"] });
  assert.equal(identity.seasonNumber, 2);
  for (const title of ["购物中心", "购物中心2", "Shopping Center", "请回答1988", "24"]) assert.ok(identity.names.includes(title));
  assert.ok(!identity.names.includes("请回答"));
});

test("the shared name set includes source title, original title and AKA names with duplicates removed", () => {
  const identity = readDoubanIdentity(item("源片名"), { title: "详情片名", original_title: "Original Title", aka: ["谎言之屋", "Original Title", " 谎言之屋 ", "", 123] });
  assert.deepEqual(new Set(identity.names), new Set(["源片名", "详情片名", "Original Title", "谎言之屋"]));
  assert.equal(identity.ambiguousSeason, false);
});

test("contradictory explicit season hints are not guessed and movie aliases do not create TV season identity", () => {
  const conflict = readDoubanIdentity(item("测试剧 第二季"), { aka: ["Test Show Season 3"] });
  assert.equal(conflict.ambiguousSeason, true);
  assert.equal(conflict.seasonNumber, undefined);
  const film = readDoubanIdentity({ ...item("电影2"), mediaType: "movie" }, { aka: ["Movie Season 2"] });
  assert.equal(film.seasonNumber, undefined);
  assert.equal(film.ambiguousSeason, false);
});

test("native Douban fallback preserves original content without requiring TMDB when matching is absent or fails", async () => {
  const poster = "https://img1.doubanio.com/view/photo/l/public/native-fixture.jpg";
  const raw = { id: "900002", type: "tv", title: "原始作品 第二季", original_title: "Native Work Season 2", year: "2026", intro: "豆瓣原始简介", pic: { large: poster }, rating: { value: 8.2, count: 20 }, pubdate: ["2026-10-01"], episodes_count: 8 };
  for (const outcome of ["missing", "error", "wrong-source-season"] as const) {
    let tmdbCalls = 0;
    const service = createDoubanDetailService({
      subject: async () => ({ data: raw, retrievedAt: "2026-10-16T00:00:00Z", stale: false }),
      match: async () => {
        if (outcome === "error") throw new Error("synthetic TMDB outage");
        return outcome === "wrong-source-season" ? { ...base, seasonNumber: 1, sourceSeasonNumber: 3 } : null;
      },
      detail: async () => { tmdbCalls++; throw new Error("unmatched source must not depend on TMDB detail"); },
    });
    const { detail } = await service("tv", "900002");
    assert.deepEqual([detail.id, detail.title, detail.overview, detail.posterPath, detail.voteAverage, detail.voteCount], ["douban:900002", raw.title, raw.intro, poster, 8.2, 20]);
    assert.equal(detail.sourceSeasonNumber, 2);
    assert.equal(detail.seasonNumber, undefined);
    assert.equal(mediaHref(detail), "/douban/tv/900002");
    assert.equal(tmdbCalls, 0);
  }
});

test("a source season two mapped to standalone TMDB season one keeps both identities through links and favorites", () => {
  const mapped: DisplayDetail = { ...base, id: 325022, title: "麻辣教师 第二季", source: "douban", doubanId: "900002", seasonNumber: 1, sourceSeasonNumber: 2 };
  const native: DisplayDetail = { ...mapped, id: "douban:900002", seasonNumber: undefined };
  const target = { ...base, seasonNumber: 1 };
  assert.equal(mediaKey(mapped), mediaKey(native));
  assert.equal(sameFavorite(mapped, native), true);
  assert.equal(sameFavorite(mapped, { ...native, title: "购物中心2", sourceSeasonNumber: undefined }), true);
  assert.equal(sameFavorite(mapped, target), true);
  assert.equal(sameFavorite(mapped, { ...base, seasonNumber: 2 }), false);
  assert.equal(sameFavorite(mapped, base), false);
  const saved = parseFavorites(JSON.stringify([mapped, target, native]));
  assert.equal(saved.length, 1);
  assert.deepEqual([saved[0].seasonNumber, saved[0].sourceSeasonNumber], [1, 2]);
  assert.equal(mediaHref(saved[0]), "/douban/tv/900002");
});

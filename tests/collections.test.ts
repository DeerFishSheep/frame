import test from "node:test";
import assert from "node:assert/strict";
import { COLLECTION_FAVORITES_KEY, PRESET_COLLECTIONS, collectionDirectory, collectionFallback, collectionHref, collectionId, parseSavedCollections, toggleSavedCollection, writeSavedCollections } from "../lib/collections";
import { catalogSourceHref } from "../lib/catalog-sources";
import { createCollectionService } from "../lib/douban/collections";
import { normalizeDoubanItem } from "../lib/douban/normalize";

const reference = PRESET_COLLECTIONS.find(list => list.id === "doulist:1654175")!;
const preview = normalizeDoubanItem({ id: "1438652", title: "钢铁侠", type: "movie" }, "movie")!;
const summary = { ...collectionFallback(reference), creator: "Bear👑", count: 140, preview: [preview] };

test("all eight module presets have independent list routes, including safe official-collection slugs", () => {
  assert.equal(PRESET_COLLECTIONS.length, 8);
  for (const ref of PRESET_COLLECTIONS) {
    const href = collectionHref(ref);
    assert.equal(collectionId("douban", href.split("/").at(-1)!), ref.id);
  }
  assert.equal(collectionId("douban", "collection-movie_top250"), "collection:movie_top250");
  for (const slug of ["doulist-1/../../api", "doulist-0", "https://example.com", "collection-../../private"]) assert.throws(() => collectionId("douban", slug));
  assert.throws(() => collectionId("unknown", "doulist-1"));
});

test("whole-list bookmarks round-trip separately from individual film favorites", () => {
  const saved = toggleSavedCollection([], summary);
  assert.deepEqual(parseSavedCollections(JSON.stringify(saved)), [summary]);
  const writes: [string, string][] = [];
  writeSavedCollections({ setItem: (key, value) => { writes.push([key, value]); } }, saved);
  assert.equal(writes.length, 1); assert.equal(writes[0][0], COLLECTION_FAVORITES_KEY);
  assert.deepEqual(toggleSavedCollection(saved, { ...summary, title: "Updated source title" }), []);
});

test("damaged collection records cannot change source URLs or poison other saved lists", () => {
  assert.deepEqual(parseSavedCollections("broken"), []);
  const invalid = [{ ...summary, source: "evil" }, { ...summary, id: "https://evil.test" }, { ...summary, count: -1 }, { ...summary, creator: [] }, { ...summary, kind: "invented" }];
  assert.deepEqual(parseSavedCollections(JSON.stringify([...invalid, summary, summary])), [summary]);
});

test("imported saved lists join the directory and repeated presets do not create duplicate cards", () => {
  const imported = { ...summary, id: "doulist:123", title: "Custom" };
  const directory = collectionDirectory([summary, imported]);
  assert.equal(directory.length, 9); assert.equal(directory.filter(item => item.id === summary.id).length, 1);
  assert.equal(directory.at(-1)?.id, imported.id);
});

test("metadata exposes the real creator and count, and uses exactly three real poster entries", async () => {
  const service = createCollectionService({ collection: async () => ({ data: { id: "1654175", title: "IMDb 科幻片单", category: "movie", owner: { name: "Bear👑" }, items_count: 1 }, retrievedAt: "2026-10-14T00:00:00Z", stale: false }),
    page: async () => ({ items: Array.from({ length: 20 }, (_, i) => ({ ...preview, id: `douban:${i + 1}`, doubanId: String(i + 1) })), total: 140, totalExact: true, hasMore: true, omitted: 0, retrievedAt: "2026-10-14T00:01:00Z", stale: false }) });
  const result = await service.summary(reference.id);
  assert.deepEqual([result.title, result.creator, result.count, result.unit, result.kind], ["IMDB 科幻片单", "Bear👑", 140, "部", "user"]);
  assert.deepEqual(result.preview.map(item => item.doubanId), ["1", "2", "3"]);
  assert.equal(result.retrievedAt, "2026-10-14T00:00:00Z");
});

test("platform charts are distinguished from user lists and private metadata stops before reading items", async () => {
  let pages = 0, privateList = false;
  const service = createCollectionService({ collection: async () => ({ data: { id: "movie_top250", title: "豆瓣电影 Top250", type: "chart", subject_type: "movie", is_private: privateList }, retrievedAt: "2026-10-14T00:00:00Z", stale: false }),
    page: async () => { pages++; return { items: [], total: 250, totalExact: true, hasMore: false, omitted: 0, retrievedAt: "2026-10-14T00:00:00Z", stale: false }; } });
  assert.equal((await service.summary("collection:movie_top250")).kind, "official");
  privateList = true; await assert.rejects(service.summary("collection:movie_top250"), /无法公开访问/); assert.equal(pages, 1);
});

test("switching ranking platforms ignores an old saved list tab instead of unexpectedly leaving the rankings", () => {
  const href = catalogSourceHref("douban", new URLSearchParams("source=imdb&media=movie&chart=top"), () => "/?source=douban&media=movie&chart=lists&list=doulist%3A1654175");
  const params = new URL(href, "https://frame.local").searchParams;
  assert.equal(params.get("chart"), "recommend"); assert.equal(params.get("category"), "热门");
});

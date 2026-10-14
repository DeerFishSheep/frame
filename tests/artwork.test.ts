import test from "node:test";
import assert from "node:assert/strict";
import { artworkSources, doubanImageUrl } from "../lib/media-artwork";
import { createDoubanImageLoader } from "../lib/douban/images";
import { createDoubanMatcher } from "../lib/douban/matcher";
import { creditsMatch, exactMediaMatch, searchTitle } from "../lib/media-match";
import { normalizeDoubanItem } from "../lib/douban/normalize";
import { normalizeDetail } from "../lib/tmdb/normalize";
import type { Media } from "../lib/types";

const poster = "https://img9.doubanio.com/view/photo/s_ratio_poster/public/p2933569626.jpg";
const source = normalizeDoubanItem({ id: "36808876", title: "奥德赛", year: "2026", type: "movie", pic: { normal: poster } }, "movie")!;
const nolan: Media = { ...source, id: 1368337, source: "tmdb", originalTitle: "The Odyssey", posterPath: "/nolan.jpg" };
const walz: Media = { ...nolan, id: 1698863, posterPath: "/walz.jpg" };
const detail = (id: number, directors: string[]) => ({ ...normalizeDetail({ id }, "movie"), directors, imdbId: `tt${id}` });

test("posters retain distinct backups and route only trusted Douban photos through the local image endpoint", () => {
  const urls = artworkSources({ posterPath: "/nolan.jpg", backdropPath: null, posterFallbacks: [poster, poster, "javascript:bad"] });
  assert.deepEqual(urls, ["https://image.tmdb.org/t/p/w500/nolan.jpg", `/api/images/douban?url=${encodeURIComponent(poster)}`]);
  assert.equal(artworkSources({ posterPath: poster, backdropPath: null })[0], `/api/images/douban?url=${encodeURIComponent(poster)}`);
  assert.equal(doubanImageUrl("https://img9.doubanio.com.evil.test/view/photo/p.jpg"), null);
  assert.equal(doubanImageUrl("https://img9.doubanio.com/private"), null);
  assert.equal(doubanImageUrl("http://127.0.0.1/view/photo/p.jpg"), null);
});

test("normalization keeps large and small Douban posters even before TMDB matches", () => {
  const large = poster.replace("s_ratio_poster", "m_ratio_poster");
  const item = normalizeDoubanItem({ id: "1", title: "Film", type: "movie", pic: { normal: poster, large } }, "movie")!;
  assert.equal(item.posterPath, large); assert.deepEqual(item.posterFallbacks, [large, poster]);
});

test("a hidden direction mark cannot prevent a valid movie name from matching", () => {
  const title = "神探之痕迹‎";
  assert.equal(searchTitle(title, "movie"), "神探之痕迹");
  assert.equal(exactMediaMatch([{ ...nolan, title: "神探之痕迹" }], title, "2026", "movie")?.id, 1368337);
});

test("the two 2026 Odyssey films are resolved by the actual director, independent of search order", async () => {
  let lookups = 0;
  const matcher = createDoubanMatcher({
    search: async () => [walz, nolan],
    subject: async () => ({ data: { original_title: "The Odyssey", directors: [{ name: "克里斯托弗·诺兰" }], actors: [{ name: "马特·达蒙" }] } }),
    detail: async (_media, id) => { lookups++; return { detail: detail(Number(id), [id === "1368337" ? "克里斯托弗·诺兰" : "Marcel Walz"]) }; },
  });
  const [a, b] = await Promise.all([matcher(source), matcher(source)]);
  assert.equal(a?.id, 1368337); assert.equal(b?.id, 1368337); assert.equal(lookups, 2);
  await matcher(source); assert.equal(lookups, 2);
});

test("unknown or still-ambiguous credits leave the original subject available instead of selecting a random remake", async () => {
  for (const director of ["Unknown", "Same director"]) {
    const matcher = createDoubanMatcher({ search: async () => [nolan, walz], subject: async () => ({ data: { original_title: "The Odyssey", directors: [{ name: director }] } }), detail: async (_m, id) => ({ detail: detail(Number(id), ["Same director"]) }) });
    assert.equal(await matcher(source), null);
  }
  assert.equal(creditsMatch({ directors: [], cast: [{ id: 1, name: "A", character: "", profilePath: null }] }, { directors: [], actors: ["A"] }), false);
  assert.equal(creditsMatch({ directors: [], cast: [{ id: 1, name: "A", character: "", profilePath: null }, { id: 2, name: "B", character: "", profilePath: null }] }, { directors: [], actors: ["A", "B"] }), true);
});

test("original-language title lookup is attempted only when the first search could not identify the subject", async () => {
  const queries: string[] = [];
  const matcher = createDoubanMatcher({ search: async title => { queries.push(title); return title === "The Odyssey" ? [nolan] : []; }, subject: async () => ({ data: { original_title: "The Odyssey" } }), detail: async () => { throw new Error("No credit lookup needed"); } });
  assert.equal((await matcher(source))?.id, 1368337); assert.deepEqual(queries, ["奥德赛", "The Odyssey"]);
});

test("the image loader coalesces requests and returns only image bytes with the required public origin header", async () => {
  let calls = 0;
  const load = createDoubanImageLoader({ fetchImpl: (async (url, options) => {
    calls++; assert.equal(url, poster); assert.equal(options?.redirect, "error");
    assert.equal(new Headers(options?.headers).get("referer"), "https://m.douban.com/");
    return new Response(new Uint8Array([1, 2, 3]), { headers: { "content-type": "image/jpeg" } });
  }) as typeof fetch });
  const [a, b] = await Promise.all([load(poster), load(poster)]);
  assert.equal(a.type, "image/jpeg"); assert.deepEqual([...a.bytes], [1, 2, 3]); assert.deepEqual(a.bytes, b.bytes);
  await load(poster); assert.equal(calls, 1);
});

test("image validation rejects arbitrary hosts before fetching, and rejects HTML, redirects and oversized payloads", async () => {
  let calls = 0;
  const invalid = createDoubanImageLoader({ fetchImpl: (async () => { calls++; return new Response(); }) as typeof fetch });
  await assert.rejects(invalid("https://example.com/image.jpg")); assert.equal(calls, 0);
  for (const response of [new Response("<html>blocked</html>", { headers: { "content-type": "text/html" } }), new Response(null, { status: 302 }), new Response("x", { headers: { "content-type": "image/jpeg", "content-length": String(7 * 1024 * 1024) } })]) {
    const load = createDoubanImageLoader({ fetchImpl: (async () => response) as typeof fetch });
    await assert.rejects(load(poster));
  }
});

test("failed image requests are not cached and a later retry can succeed", async () => {
  let calls = 0;
  const load = createDoubanImageLoader({ fetchImpl: (async () => ++calls === 1 ? new Response("blocked", { status: 403 }) : new Response("image", { headers: { "content-type": "image/jpeg" } })) as typeof fetch });
  await assert.rejects(load(poster)); assert.equal((await load(poster)).type, "image/jpeg"); assert.equal(calls, 2);
});

test("transient photo failures retry once within the shared request, but sustained failures stop", async () => {
  let calls = 0;
  const load = createDoubanImageLoader({ fetchImpl: (async () => ++calls === 1 ? new Response(null, { status: 503 }) : new Response("image", { headers: { "content-type": "image/jpeg" } })) as typeof fetch });
  const result = await Promise.all([load(poster), load(poster)]);
  assert.equal(calls, 2); assert.equal(result[0].type, "image/jpeg"); assert.equal(result[0], result[1]);
  let failures = 0;
  const unavailable = createDoubanImageLoader({ fetchImpl: (async () => { failures++; throw new TypeError("offline"); }) as typeof fetch });
  await assert.rejects(unavailable(poster)); assert.equal(failures, 2);
});

import assert from "node:assert/strict";
import test from "node:test";
import { CatalogPager } from "../lib/catalog-pager";
import { DEMO_MEDIA } from "../lib/demo";
import { mediaKey, type CatalogResponse, type Media } from "../lib/types";

const movie: Media = { ...DEMO_MEDIA[0], source: "tmdb", rank: 1 };
const another: Media = { ...DEMO_MEDIA[1], source: "tmdb", rank: 22 };
const first: CatalogResponse = { results: [movie], page: 1, totalPages: 3, totalResults: 60, retrievedAt: null, source: "tmdb", stale: false };
const page = (number: number, results: Media[]): CatalogResponse => ({ ...first, page: number, results });

test("simultaneous auto/manual requests fetch one page and preserve distinct identities and ranks", async () => {
  const pager = new CatalogPager();
  let finish!: (value: CatalogResponse) => void;
  let calls = 0;
  const fetchPage = async (number: number) => { calls++; assert.equal(number, 2); return new Promise<CatalogResponse>(resolve => { finish = resolve; }); };
  const pending = pager.loadNext(first, fetchPage);
  assert.equal(pager.busy, true);
  assert.equal(await pager.loadNext(first, fetchPage), null);
  const television: Media = { ...movie, mediaType: "tv", rank: 23 };
  finish(page(2, [movie, another, another, television]));
  const result = await pending;
  assert.equal(calls, 1);
  assert.deepEqual(result?.results.map(mediaKey), [mediaKey(movie), mediaKey(another), mediaKey(television)]);
  assert.deepEqual(result?.results.map(item => item.rank), [1, 22, 23]);
  assert.deepEqual(first.results, [movie]);
  assert.equal(pager.busy, false);
});

test("cancelled stale results cannot append or release a newer in-flight request", async () => {
  const pager = new CatalogPager();
  let oldSignal!: AbortSignal;
  let finishOld!: (value: CatalogResponse) => void;
  let finishNew!: (value: CatalogResponse) => void;
  const old = pager.loadNext(first, (_number, signal) => { oldSignal = signal; return new Promise(resolve => { finishOld = resolve; }); });
  pager.cancel();
  assert.equal(oldSignal.aborted, true);
  const current = pager.loadNext(first, () => new Promise(resolve => { finishNew = resolve; }));
  finishOld(page(2, [another]));
  assert.equal(await old, null);
  assert.equal(pager.busy, true);
  finishNew(page(2, []));
  assert.deepEqual((await current)?.results, [movie]);
  assert.equal(pager.busy, false);
});

test("a failure releases the request lock and a manual retry requests the same page", async () => {
  const pager = new CatalogPager();
  const requested: number[] = [];
  await assert.rejects(pager.loadNext(first, async number => { requested.push(number); throw new Error("offline"); }), /offline/);
  assert.equal(pager.busy, false);
  const result = await pager.loadNext(first, async number => { requested.push(number); return page(number, [another]); });
  assert.deepEqual(requested, [2, 2]);
  assert.equal(result?.page, 2);
  assert.deepEqual(first.results, [movie]);
});

test("no request is made after the final page", async () => {
  const pager = new CatalogPager();
  let calls = 0;
  assert.equal(await pager.loadNext({ ...first, page: 3 }, async () => { calls++; return page(4, []); }), null);
  assert.equal(calls, 0);
  assert.equal(pager.busy, false);
});

test("an unexpected page is rejected without silently dropping or repeating a page", async () => {
  const pager = new CatalogPager();
  await assert.rejects(pager.loadNext(first, async () => page(1, [another])), /页码/);
  assert.equal(pager.busy, false);
  assert.equal((await pager.loadNext(first, async number => page(number, [another])))?.page, 2);
});

test("empty pages preserve earlier results and expose progress so automatic chaining can pause", async () => {
  const pager = new CatalogPager();
  const result = await pager.loadNext(first, async number => page(number, []));
  assert.equal(result?.page, 2);
  assert.equal(result?.totalPages, 3);
  assert.deepEqual(result?.results, [movie]);
});

test("late observer callbacks cannot reload completed pages; resetting allows a new query", async () => {
  const pager = new CatalogPager();
  const requests: number[] = [];
  const fetchPage = async (number: number) => { requests.push(number); return page(number, [another]); };
  const second = await pager.loadNext(first, fetchPage);
  assert.equal(await pager.loadNext(first, fetchPage), null);
  assert.equal((await pager.loadNext(second!, fetchPage))?.page, 3);
  assert.equal(await pager.loadNext(second!, fetchPage), null);
  assert.deepEqual(requests, [2, 3]);
  pager.cancel();
  assert.equal(pager.canLoadNext(first), true);
  assert.equal((await pager.loadNext(first, fetchPage))?.page, 2);
});

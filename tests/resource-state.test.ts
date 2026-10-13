import assert from "node:assert/strict";
import test from "node:test";
import { AsyncResource, ResourceCache } from "../lib/resource-state";
import { refreshMediaPages } from "../lib/catalog-pager";
import { featuredIndex } from "../lib/media-presentation";
import { DEMO_MEDIA } from "../lib/demo";
import { mediaKey, type MediaPage } from "../lib/types";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

test("every resource retains the last complete view throughout a new request and swaps data with its identity", async () => {
  for (const group of ["catalog", "discover", "search", "detail", "featured", "recommendations"]) {
    const cache = new ResourceCache(), resource = new AsyncResource<{ title: string }>(cache, group, "old");
    const first = { title: "old result" };
    await resource.load("old", async () => first);
    const delayed = deferred<{ title: string }>();
    const loading = resource.load("new", () => delayed.promise);
    assert.equal(resource.snapshot().data, first, group);
    assert.equal(resource.snapshot().dataKey, "old");
    assert.equal(resource.snapshot().requestKey, "new");
    assert.equal(resource.snapshot().pending, true);
    delayed.resolve({ title: "new result" }); await loading;
    assert.deepEqual(resource.snapshot(), { data: { title: "new result" }, dataKey: "new", requestKey: "new", pending: false, error: "" });
  }
});

test("failed updates preserve old results and retrieval time; retry replaces them only on success", async () => {
  const old = { source: "IMDB", retrievedAt: "2026-10-14T00:00:00Z" };
  const resource = new AsyncResource<typeof old>(new ResourceCache(), "catalog", "old");
  await resource.load("old", async () => old);
  await resource.load("new", async () => { throw new Error("upstream unavailable"); });
  assert.equal(resource.snapshot().data, old);
  assert.equal(resource.snapshot().dataKey, "old");
  assert.equal(resource.snapshot().pending, false);
  assert.equal(resource.snapshot().error, "upstream unavailable");
  const delayed = deferred<typeof old>();
  const retry = resource.load("new", () => delayed.promise, true);
  assert.equal(resource.snapshot().data, old);
  delayed.resolve({ source: "TMDB", retrievedAt: "2026-10-14T00:01:00Z" }); await retry;
  assert.equal(resource.snapshot().data?.source, "TMDB");
  assert.equal(resource.snapshot().error, "");
});

test("late success and late failure from superseded requests cannot replace the active view", async () => {
  for (const rejectOld of [false, true]) {
    const cache = new ResourceCache(), resource = new AsyncResource<string>(cache, "catalog", "a");
    const old = deferred<string>(); let oldSignal!: AbortSignal;
    const first = resource.load("a", signal => { oldSignal = signal; return old.promise; });
    await resource.load("b", async () => "latest");
    assert.equal(oldSignal.aborted, true);
    if (rejectOld) old.reject(new Error("old error")); else old.resolve("old value");
    await first;
    assert.equal(resource.snapshot().data, "latest"); assert.equal(resource.snapshot().error, "");
    assert.equal(cache.get("a"), undefined);
  }
});

test("unmounted requests are cancelled and cannot publish or poison the browser cache", async () => {
  const cache = new ResourceCache(), resource = new AsyncResource<string>(cache, "detail", "a"), delayed = deferred<string>();
  let signal!: AbortSignal;
  const loading = resource.load("a", input => { signal = input; return delayed.promise; });
  resource.cancel(); delayed.resolve("late"); await loading;
  assert.equal(signal.aborted, true); assert.equal(cache.get("a"), undefined); assert.equal(resource.snapshot().data, null);
});

const page = (number: number): MediaPage => ({ page: number, totalPages: 4, totalResults: 4, results: [DEMO_MEDIA[number - 1]] });

test("returning to a resource restores its loaded pages synchronously rather than the first-page skeleton", async () => {
  const cache = new ResourceCache(), first = new AsyncResource<MediaPage>(cache, "catalog", "movie");
  await first.load("movie", async () => page(1));
  const loaded = { ...page(3), results: DEMO_MEDIA.slice(0, 3) };
  assert.equal(first.update("movie", loaded), true);
  first.cancel();
  const returned = new AsyncResource<MediaPage>(cache, "catalog", "movie");
  assert.equal(returned.snapshot().data, loaded); assert.equal(returned.snapshot().pending, false);
  let calls = 0;
  await returned.load("movie", async () => { calls++; return page(1); });
  assert.equal(calls, 0); assert.equal(returned.snapshot().data?.page, 3);
});

test("resource groups share the previous catalogue view without leaking it into unrelated details", async () => {
  const cache = new ResourceCache(), first = new AsyncResource<string>(cache, "catalog", "tmdb");
  await first.load("tmdb", async () => "TMDB content");
  assert.equal(new AsyncResource(cache, "catalog", "imdb").snapshot().data, "TMDB content");
  assert.equal(new AsyncResource(cache, "detail", "278").snapshot().data, null);
  assert.equal(new AsyncResource(cache, "catalog", "new", undefined, false).snapshot().data, null);
  first.setGroup("discover"); await first.load("search", async () => "search result");
  assert.equal(cache.latest<string>("discover")?.data, "search result");
  assert.equal(cache.latest<string>("catalog")?.data, "TMDB content");
});

test("refreshing a cached resource reloads its previously loaded range atomically", async () => {
  let now = 0;
  const cache = new ResourceCache(16, () => now), resource = new AsyncResource<MediaPage>(cache, "catalog", "a");
  const old = { ...page(3), results: DEMO_MEDIA.slice(0, 3) };
  await resource.load("a", async () => old);
  now = 61_000;
  const delayed = deferred<MediaPage>(); const calls: number[] = [];
  const work = resource.load("a", (signal, previous) => refreshMediaPages(1, previous, async number => {
    calls.push(number); return number === 2 ? delayed.promise : page(number);
  }, signal));
  await Promise.resolve(); await Promise.resolve();
  assert.equal(resource.snapshot().data, old);
  delayed.resolve(page(2)); await work;
  assert.deepEqual(calls, [1, 2, 3]);
  assert.equal(resource.snapshot().data?.page, 3); assert.equal(resource.snapshot().data?.results.length, 3);
});

test("a failed later page during refresh cannot erase already loaded results", async () => {
  const resource = new AsyncResource<MediaPage>(new ResourceCache(), "catalog", "a");
  const old = { ...page(3), results: DEMO_MEDIA.slice(0, 3) };
  await resource.load("a", async () => old);
  await resource.load("a", (signal, previous) => refreshMediaPages(1, previous, async number => {
    if (number === 2) throw new Error("second page failed"); return page(number);
  }, signal), true);
  assert.equal(resource.snapshot().data, old); assert.match(resource.snapshot().error, /second page/);
});

test("range refresh respects a shorter new total and rejects wrong page numbers", async () => {
  const previous = { ...page(3), results: DEMO_MEDIA.slice(0, 3) }, signal = new AbortController().signal;
  const calls: number[] = [];
  const next = await refreshMediaPages(1, previous, async number => { calls.push(number); return { ...page(number), totalPages: 2 }; }, signal);
  assert.deepEqual(calls, [1, 2]); assert.equal(next.page, 2);
  await assert.rejects(refreshMediaPages(1, previous, async () => page(2), signal), /页码/);
});

test("a bounded cache evicts old views and initial failures still have an explicit error", async () => {
  const cache = new ResourceCache(2);
  for (const key of ["a", "b", "c"]) cache.put(key, "catalog", key);
  assert.equal(cache.get("a"), undefined);
  const resource = new AsyncResource<string>(cache, "detail", "new");
  await resource.load("new", async () => { throw new Error("load failed"); });
  assert.equal(resource.snapshot().data, null); assert.equal(resource.snapshot().pending, false); assert.equal(resource.snapshot().error, "load failed");
});

test("switching providers retains the currently viewed cached catalogue, not the last fetched one", async () => {
  const cache = new ResourceCache(), resource = new AsyncResource<string>(cache, "catalog", "a");
  await resource.load("a", async () => "A");
  await resource.load("b", async () => "B");
  await resource.load("a", async () => "unexpected");
  assert.equal(new AsyncResource<string>(cache, "catalog", "c").snapshot().data, "A");
});

test("carousel keeps its active film when results reorder and its position when the film leaves", () => {
  const items = DEMO_MEDIA.slice(0, 5), selection = { key: mediaKey(items[3]), index: 3 };
  assert.equal(featuredIndex(selection, [...items].reverse()), 1);
  assert.equal(featuredIndex({ key: "movie:missing", index: 3 }, items), 3);
  assert.equal(featuredIndex({ key: "movie:missing", index: 4 }, items.slice(0, 2)), 1);
});

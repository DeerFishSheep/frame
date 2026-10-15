import assert from "node:assert/strict";
import test from "node:test";
import { createPansouClient, PansouError, readBoundedJson, validateResourceSearch } from "../lib/pansou/client";
import { RESOURCE_CHANNELS } from "../lib/pansou/channels";
import type { ResourceSearchQuery } from "../lib/pansou/types";

const json = (value: unknown, status = 200, headers?: HeadersInit) => new Response(JSON.stringify(value), { status, headers });
const query: ResourceSearchQuery = { keyword: "公共测试资料", channels: ["115", "quark"] };
const errorCode = (code: string, status: number) => (error: unknown) => error instanceof PansouError && error.code === code && error.status === status;
const entry = (url: string, overrides: Record<string, unknown> = {}) => ({ url, note: "公共测试资料", source: "plugin:public-fixture", datetime: "2026-10-15T10:00:00+08:00", password: "", ...overrides });
const client = (payload: unknown) => createPansouClient({ baseUrl: "http://search.example.test:23456", fetchImpl: async () => json(payload) });

test("search validation accepts all thirteen supported channels and normalizes duplicates without mutating input", () => {
  const all = RESOURCE_CHANNELS.map(channel => channel.id);
  assert.equal(new Set(all).size, 13);
  assert.deepEqual(new Set(all), new Set(["baidu", "aliyun", "quark", "tianyi", "uc", "mobile", "115", "pikpak", "xunlei", "123", "magnet", "ed2k", "others"]));
  const input = { keyword: "  公共资料  ", channels: [...all].reverse().concat("115", "quark") };
  const before = structuredClone(input);
  assert.deepEqual(validateResourceSearch(input), { keyword: "公共资料", channels: all });
  assert.deepEqual(input, before);
  assert.equal(validateResourceSearch({ keyword: "🎬".repeat(100), channels: ["115"] }).keyword.length, 200);
});

test("invalid keywords, malformed channels, and unsupported types are rejected before making a request", async () => {
  let calls = 0;
  const api = createPansouClient({ baseUrl: "https://search.example.test", fetchImpl: async () => { calls++; return json({ merged_by_type: {} }); } });
  for (const input of [null, [], {}, { keyword: 123, channels: ["115"] }, { keyword: "", channels: ["115"] }, { keyword: "   ", channels: ["115"] }, { keyword: "a\nb", channels: ["115"] }, { keyword: "a\u0000b", channels: ["115"] }, { keyword: "🎬".repeat(101), channels: ["115"] }, { keyword: "资料", channels: [] }, { keyword: "资料", channels: "115" }, { keyword: "资料", channels: [115] }, { keyword: "资料", channels: ["unsupported"] }, { keyword: "资料", channels: ["115", "https://private.example"] }, { keyword: "资料", channels: Array(101).fill("115") }]) {
    assert.throws(() => validateResourceSearch(input), errorCode("INVALID_QUERY", 400));
    await assert.rejects(api.search(input as ResourceSearchQuery), errorCode("INVALID_QUERY", 400));
  }
  assert.equal(calls, 0);
});

test("upstream address comes only from server configuration and request values cannot alter it or force refresh", async () => {
  let calls = 0;
  const api = createPansouClient({ baseUrl: "http://search.example.test:23456", fetchImpl: async (input, init) => {
    calls++;
    const url = new URL(String(input));
    assert.equal(url.origin, "http://search.example.test:23456");
    assert.equal(url.pathname, "/api/search");
    assert.equal(url.searchParams.get("kw"), "公共资料 & 2026");
    assert.equal(url.searchParams.get("cloud_types"), "quark,115");
    assert.equal(url.searchParams.get("conc"), "4");
    assert.equal(url.searchParams.get("res"), "merge");
    assert.equal(url.searchParams.has("refresh"), false);
    assert.equal(url.searchParams.has("baseUrl"), false);
    assert.equal(init?.redirect, "error");
    assert.equal(init?.cache, "no-store");
    assert.equal(new Headers(init?.headers).get("Authorization"), null);
    assert.equal(init?.method ?? "GET", "GET");
    return json({ code: 0, data: { merged_by_type: {} } });
  } });
  const result = await api.search({ keyword: "  公共资料 & 2026  ", channels: ["115", "quark"], baseUrl: "http://private.example", refresh: true } as ResourceSearchQuery);
  assert.equal(calls, 1);
  assert.deepEqual(Object.keys(result).sort(), ["channels", "items", "keyword", "retrievedAt", "total"]);
  assert.equal(JSON.stringify(result).includes("search.example.test"), false);
});

test("missing or invalid server configuration fails without leaking credentials or making a request", async () => {
  let calls = 0;
  for (const baseUrl of ["", "not-a-url", "file:///etc/passwd", "ftp://search.example.test", "https://user:private-secret@search.example.test", "https://search.example.test?token=private-secret", "https://search.example.test#private-secret"]) {
    const api = createPansouClient({ baseUrl, fetchImpl: async () => { calls++; return json({ merged_by_type: {} }); } });
    await assert.rejects(api.search(query), (error: unknown) => errorCode("NOT_CONFIGURED", 503)(error) && !String(error).includes("private-secret"));
  }
  assert.equal(calls, 0);
});

test("both native and wrapped merged responses normalize fields and keep only the selected channels", async () => {
  const merged = { "115": [entry("https://115.example.test/s/public", { password: "test-code", note: "  公共资料  " })], quark: [entry("https://quark.example.test/s/public")], aliyun: [entry("https://aliyun.example.test/s/public")], unknown: [entry("https://unknown.example.test/s/public")] };
  for (const payload of [{ merged_by_type: merged }, { code: 0, message: "success", data: { total: 999, merged_by_type: merged } }, { code: 200, data: { merged_by_type: merged } }]) {
    const result = await client(payload).search({ keyword: query.keyword, channels: ["115"] });
    assert.equal(result.total, 1);
    assert.equal(result.items.length, 1);
    assert.deepEqual(result.channels, ["115"]);
    assert.deepEqual({ ...result.items[0], id: undefined }, { id: undefined, channel: "115", title: "公共资料", url: "https://115.example.test/s/public", source: "plugin:public-fixture", publishedAt: "2026-10-15T02:00:00.000Z", extractionCode: "test-code" });
    assert.ok(result.items[0].id);
    assert.ok(Number.isFinite(Date.parse(result.retrievedAt)));
  }
});

test("a successful empty merge stays an honest empty result", async () => {
  for (const payload of [{ merged_by_type: {} }, { code: 0, data: { total: 0, merged_by_type: { "115": [], quark: [] } } }]) {
    const result = await client(payload).search(query);
    assert.deepEqual(result.items, []);
    assert.equal(result.total, 0);
    assert.equal(result.keyword, query.keyword);
  }
});

test("HTTP, business, and malformed responses cannot be mistaken for empty search results", async () => {
  for (const status of [401, 403, 404, 429, 500]) {
    const api = createPansouClient({ baseUrl: "https://search.example.test", fetchImpl: async () => json({ error: "private upstream detail" }, status) });
    await assert.rejects(api.search(query), (error: unknown) => errorCode("UPSTREAM_HTTP_ERROR", status === 429 ? 429 : 502)(error) && !String(error).includes("private upstream detail"));
  }
  for (const payload of [{ code: 500, data: { merged_by_type: {} } }, { error: "private-secret", merged_by_type: {} }]) {
    await assert.rejects(client(payload).search(query), (error: unknown) => errorCode("UPSTREAM_ERROR", 502)(error) && !String(error).includes("private-secret"));
  }
  for (const payload of [null, [], {}, { data: null }, { merged_by_type: [] }, { data: { merged_by_type: { "115": {} } } }]) {
    await assert.rejects(client(payload).search(query), errorCode("INVALID_RESPONSE", 502));
  }
  const invalidJson = createPansouClient({ baseUrl: "https://search.example.test", fetchImpl: async () => new Response("<html>private details</html>") });
  await assert.rejects(invalidJson.search(query), errorCode("INVALID_RESPONSE", 502));
});

test("malformed items are safely skipped and missing optional metadata is not invented", async () => {
  const result = await client({ merged_by_type: { "115": [null, 123, {}, { url: 42 }, entry("https://115.example.test/s/no-metadata", { note: "  ", source: 42, datetime: "unknown", password: null })] } }).search(query);
  assert.equal(result.total, 1);
  assert.equal(result.items[0].title, "未命名资源");
  assert.equal(result.items[0].source, "");
  assert.equal(result.items[0].publishedAt, null);
  assert.equal(result.items[0].extractionCode, "");
});

test("an upstream batch containing only broken items fails instead of claiming there are no resources", async () => {
  for (const rows of [[null, {}], [entry("javascript:alert(1)")], [entry("not-a-url")]]) {
    await assert.rejects(client({ merged_by_type: { "115": rows } }).search(query), errorCode("INVALID_RESPONSE", 502));
  }
  // Records outside the requested channel are intentionally irrelevant to its empty result.
  const unselected = await client({ merged_by_type: { aliyun: [null] } }).search(query);
  assert.equal(unselected.total, 0);
});

test("only http, https and the appropriate download schemes are accepted", async () => {
  const magnet = `magnet:?xt=urn:btih:${"a".repeat(40)}&dn=public-fixture`;
  const ed2k = `ed2k://|file|public-fixture.txt|12|${"b".repeat(32)}|/`;
  const denied = ["javascript:alert(1)", "data:text/html,test", "file:///tmp/test", "ftp://test.example/public", "//test.example/public", "https://user:secret@test.example/public", "https://test.example/a b", "https://test.example/a\nb"];
  const result = await client({ merged_by_type: {
    "115": [entry("http://test.example/public"), entry("https://test.example/public"), ...denied.map(url => entry(url)), entry(magnet), entry(ed2k)],
    magnet: [entry(magnet), entry("magnet:?dn=missing-hash"), entry(ed2k)],
    ed2k: [entry(ed2k), entry("ed2k://|file|incomplete"), entry(magnet)],
  } }).search({ keyword: query.keyword, channels: ["115", "magnet", "ed2k"] });
  assert.deepEqual(result.items.map(item => [item.channel, item.url]), [["115", "http://test.example/public"], ["115", "https://test.example/public"], ["magnet", magnet], ["ed2k", ed2k]]);
});

test("duplicate URLs collapse within a channel while different resources and cross-channel identities remain distinct", async () => {
  const first = entry("https://files.example.test/s/one");
  const result = await client({ merged_by_type: {
    "115": [first, { ...first }, entry("https://files.example.test/s/two")],
    quark: [first],
  } }).search(query);
  assert.equal(result.total, 3);
  assert.equal(new Set(result.items.map(item => item.id)).size, 3);
  assert.equal(result.items.filter(item => item.title === first.note).length, 3);
  const repeated = await client({ merged_by_type: { "115": [first] } }).search(query);
  assert.equal(result.items.find(item => item.channel === "115" && item.url === first.url)?.id, repeated.items[0].id);
});

test("duplicate resources can supplement absent title, source and extraction code without overwriting known metadata", async () => {
  const url = "https://files.example.test/s/one";
  const result = await client({ merged_by_type: { "115": [
    entry(url, { note: "", source: "", password: "" }),
    entry(url, { note: "完整公共资料", source: "plugin:fixture", password: "test-code" }),
    entry(url, { note: "另一标题", source: "plugin:another", password: "different-code" }),
  ] } }).search(query);
  assert.equal(result.total, 1);
  assert.equal(result.items[0].title, "完整公共资料");
  assert.equal(result.items[0].source, "plugin:fixture");
  assert.equal(result.items[0].extractionCode, "test-code");
});

test("resources sort newest first, preserve ties and put missing dates at the end", async () => {
  const rows = [
    entry("https://test.example/unknown", { datetime: null }),
    entry("https://test.example/old", { datetime: "2024-01-01T00:00:00Z" }),
    entry("https://test.example/new-a", { datetime: "2026-10-15T10:00:00+08:00" }),
    entry("https://test.example/new-b", { datetime: "2026-10-15T02:00:00Z" }),
    entry("https://test.example/invalid", { datetime: "not a date" }),
  ];
  const result = await client({ merged_by_type: { "115": rows } }).search(query);
  assert.deepEqual(result.items.map(item => item.url.split("/").at(-1)), ["new-a", "new-b", "old", "unknown", "invalid"]);
  assert.deepEqual(result.items.slice(-2).map(item => item.publishedAt), [null, null]);
});

test("response byte limits reject oversized streams and headers instead of silently truncating results", async () => {
  assert.deepEqual(await readBoundedJson(json({ ok: true }), 11), { ok: true });
  await assert.rejects(readBoundedJson(json({ ok: true }), 10), errorCode("RESPONSE_TOO_LARGE", 502));
  let cancelled = false;
  const largeBody = new ReadableStream<Uint8Array>({
    start(controller) { controller.enqueue(new TextEncoder().encode("123456")); controller.enqueue(new TextEncoder().encode("789012")); },
    cancel() { cancelled = true; },
  });
  await assert.rejects(readBoundedJson(new Response(largeBody), 10), errorCode("RESPONSE_TOO_LARGE", 502));
  assert.equal(cancelled, true);
  const api = createPansouClient({ baseUrl: "https://search.example.test", fetchImpl: async () => json({ merged_by_type: {} }, 200, { "Content-Length": String(4 * 1024 * 1024 + 1) }) });
  await assert.rejects(api.search(query), errorCode("RESPONSE_TOO_LARGE", 502));
});

test("timeouts abort the upstream request and return a distinct timeout failure", async () => {
  let signal: AbortSignal | undefined, calls = 0;
  const api = createPansouClient({ baseUrl: "https://search.example.test", timeoutMs: 5, fetchImpl: async (_url, init) => new Promise<Response>((_resolve, reject) => {
    calls++;
    signal = init?.signal ?? undefined;
    signal?.addEventListener("abort", () => reject(signal!.reason), { once: true });
  }) });
  await assert.rejects(api.search(query), errorCode("TIMEOUT", 504));
  assert.equal(signal?.aborted, true);
  assert.equal(calls, 1);
});

test("caller cancellation aborts work, preserves its reason, and never turns into an empty or timeout result", async () => {
  const controller = new AbortController(), reason = new DOMException("superseded", "AbortError");
  let upstream: AbortSignal | undefined, attempts = 0;
  const api = createPansouClient({ baseUrl: "https://search.example.test", fetchImpl: async (_url, init) => new Promise<Response>((_resolve, reject) => {
    attempts++;
    upstream = init?.signal ?? undefined;
    upstream?.addEventListener("abort", () => reject(upstream!.reason), { once: true });
  }) });
  const work = api.search(query, controller.signal);
  controller.abort(reason);
  await assert.rejects(work, error => error === reason);
  assert.equal(upstream?.aborted, true);
  assert.equal(attempts, 1);
  let calls = 0;
  const preaborted = createPansouClient({ baseUrl: "https://search.example.test", fetchImpl: async () => { calls++; return json({ merged_by_type: {} }); } });
  await assert.rejects(preaborted.search(query, controller.signal), error => error === reason);
  assert.equal(calls, 0);
});

test("one transient network failure is retried once and can recover within the same search", async () => {
  let calls = 0;
  const api = createPansouClient({ baseUrl: "https://search.example.test", fetchImpl: async () => {
    if (++calls === 1) throw new Error("private-token from https://private.example");
    return json({ merged_by_type: { "115": [entry("https://test.example/public")] } });
  } });
  assert.equal((await api.search(query)).total, 1);
  assert.equal(calls, 2);
});

test("persistent network failures stop after two attempts, remain sanitized, and do not poison a later search", async () => {
  let calls = 0, failed = true;
  const api = createPansouClient({ baseUrl: "https://search.example.test", fetchImpl: async () => {
    calls++;
    if (failed) throw new Error("private-token from https://private.example");
    return json({ merged_by_type: { "115": [entry("https://test.example/public")] } });
  } });
  await assert.rejects(api.search(query), (error: unknown) => errorCode("NETWORK_ERROR", 502)(error) && !String(error).includes("private-token") && !String(error).includes("private.example"));
  assert.equal(calls, 2);
  failed = false;
  assert.equal((await api.search(query)).total, 1);
  assert.equal(calls, 3);
});

test("HTTP, business, malformed JSON and oversized responses are never retried as transport failures", async () => {
  for (const response of [
    () => json({}, 429),
    () => json({}, 500),
    () => json({ code: 500, data: { merged_by_type: {} } }),
    () => new Response("invalid json"),
    () => json({ merged_by_type: {} }, 200, { "Content-Length": String(4 * 1024 * 1024 + 1) }),
  ]) {
    let calls = 0;
    const api = createPansouClient({ baseUrl: "https://search.example.test", fetchImpl: async () => { calls++; return response(); } });
    await assert.rejects(api.search(query), PansouError);
    assert.equal(calls, 1);
  }
});

test("a retry shares the original timeout deadline instead of receiving a fresh time budget", async context => {
  context.mock.timers.enable({ apis: ["setTimeout"] });
  let calls = 0, settled = false;
  const signals: AbortSignal[] = [];
  const api = createPansouClient({ baseUrl: "https://search.example.test", timeoutMs: 50, fetchImpl: async (_url, init) => new Promise<Response>((_resolve, reject) => {
    calls++;
    const signal = init!.signal!;
    signals.push(signal);
    signal.addEventListener("abort", () => reject(signal.reason), { once: true });
    if (calls === 1) setTimeout(() => reject(new Error("temporary transport failure")), 40);
  }) });
  const outcome = api.search(query).then(() => { settled = true; return null; }, error => { settled = true; return error; });
  context.mock.timers.tick(40);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(calls, 2);
  context.mock.timers.tick(9);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(settled, false);
  context.mock.timers.tick(1);
  await new Promise(resolve => setImmediate(resolve));
  const stoppedAtOriginalDeadline = settled;
  context.mock.timers.tick(100);
  const failure = await outcome;
  assert.equal(stoppedAtOriginalDeadline, true);
  assert.ok(errorCode("TIMEOUT", 504)(failure));
  assert.equal(calls, 2);
  assert.ok(signals.every(signal => signal.aborted));
});

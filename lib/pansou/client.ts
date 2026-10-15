import { createHash } from "node:crypto";
import { RESOURCE_CHANNELS } from "./channels";
import type { ResourceChannel, ResourceItem, ResourceSearchQuery, ResourceSearchResult } from "./types";

export class PansouError extends Error {
  constructor(message: string, public readonly status: number, public readonly code: string) { super(message); this.name = "PansouError"; }
}
const record = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);
const invalid = () => new PansouError("请输入 1–100 字的关键词，并选择至少一个支持的渠道。", 400, "INVALID_QUERY");
export function validateResourceSearch(input: unknown): ResourceSearchQuery {
  if (!record(input) || typeof input.keyword !== "string" || !Array.isArray(input.channels)) throw invalid();
  const keyword = input.keyword.trim(), channels = input.channels;
  const known = new Set<string>(RESOURCE_CHANNELS.map(channel => channel.id));
  if (!keyword || Array.from(keyword).length > 100 || /[\u0000-\u001f\u007f]/.test(keyword) || channels.length === 0 || channels.length > 100 || channels.some(channel => typeof channel !== "string" || !known.has(channel))) throw invalid();
  return { keyword, channels: RESOURCE_CHANNELS.filter(channel => channels.includes(channel.id)).map(channel => channel.id) };
}
const MAX_RESPONSE_BYTES = 4 * 1024 * 1024;
export async function readBoundedJson(response: Response, limit = MAX_RESPONSE_BYTES): Promise<unknown> {
  if (Number(response.headers.get("content-length")) > limit) { await response.body?.cancel(); throw new PansouError("搜索响应过大，请减少渠道后重试。", 502, "RESPONSE_TOO_LARGE"); }
  if (!response.body) throw new PansouError("搜索服务返回了无效数据。", 502, "INVALID_RESPONSE");
  const reader = response.body.getReader(), chunks: Uint8Array[] = [];
  let length = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > limit) { await reader.cancel(); throw new PansouError("搜索响应过大，请减少渠道后重试。", 502, "RESPONSE_TOO_LARGE"); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  try { return JSON.parse(Buffer.concat(chunks).toString("utf8")); }
  catch { throw new PansouError("搜索服务返回了无效数据。", 502, "INVALID_RESPONSE"); }
}
function safeUrl(value: unknown, channel: ResourceChannel): string | null {
  if (typeof value !== "string" || value.length > 16384 || /[\u0000-\u0020\u007f]/.test(value)) return null;
  if (channel === "ed2k" && /^ed2k:\/\/\|file\|[^|]+\|\d+\|[a-f0-9]{32}\|\/$/i.test(value)) return value;
  try {
    const url = new URL(value);
    if (url.username || url.password) return null;
    if (channel === "magnet" && url.protocol === "magnet:" && /^magnet:\?/i.test(value) && url.searchParams.getAll("xt").some(xt => /^urn:(btih|btmh):[a-z0-9:]+$/i.test(xt))) return value;
    if ((url.protocol === "http:" || url.protocol === "https:") && url.hostname) return value;
  } catch { /* Drop unsafe or malformed resource links. */ }
  return null;
}
function normalize(payload: unknown, query: ResourceSearchQuery): ResourceItem[] {
  if (!record(payload)) throw new PansouError("搜索服务返回了无效数据。", 502, "INVALID_RESPONSE");
  if ((payload.code !== undefined && payload.code !== 0 && payload.code !== 200) || payload.error) throw new PansouError("搜索服务未能完成请求，请稍后重试。", 502, "UPSTREAM_ERROR");
  const data = record(payload.data) ? payload.data : payload;
  if ((data.code !== undefined && data.code !== 0 && data.code !== 200) || data.error) throw new PansouError("搜索服务未能完成请求，请稍后重试。", 502, "UPSTREAM_ERROR");
  // Pansou omits the merge map for a successful zero-result search.
  if (data.total === 0 && data.merged_by_type == null
    && (data.results == null || Array.isArray(data.results) && data.results.length === 0)) return [];
  if (!record(data.merged_by_type)) throw new PansouError("搜索服务返回了无效数据。", 502, "INVALID_RESPONSE");
  const items: ResourceItem[] = [], seen = new Map<string, ResourceItem>();
  let suppliedItems = 0;
  for (const channel of query.channels) {
    const values = data.merged_by_type[channel];
    if (values === undefined) continue;
    if (!Array.isArray(values)) throw new PansouError("搜索服务返回了无效数据。", 502, "INVALID_RESPONSE");
    suppliedItems += values.length;
    for (const raw of values) {
      if (!record(raw)) continue;
      const url = safeUrl(raw.url, channel);
      if (!url) continue;
      const key = `${channel}\n${url}`;
      const previous = seen.get(key);
      if (previous) {
        if (!previous.extractionCode && typeof raw.password === "string") previous.extractionCode = raw.password;
        if (!previous.source && typeof raw.source === "string") previous.source = raw.source;
        if (previous.title === "未命名资源" && typeof raw.note === "string" && raw.note.trim()) previous.title = raw.note.trim();
        continue;
      }
      const date = typeof raw.datetime === "string" ? Date.parse(raw.datetime) : NaN;
      const item: ResourceItem = { id: createHash("sha256").update(key).digest("hex"), channel, url,
        title: typeof raw.note === "string" && raw.note.trim() ? raw.note.trim() : "未命名资源",
        source: typeof raw.source === "string" ? raw.source : "",
        publishedAt: Number.isFinite(date) ? new Date(date).toISOString() : null,
        extractionCode: typeof raw.password === "string" ? raw.password : "" };
      items.push(item);
      seen.set(key, item);
    }
  }
  if (suppliedItems > 0 && items.length === 0) throw new PansouError("搜索服务返回的资源链接无法使用，请重试。", 502, "INVALID_RESPONSE");
  return items.sort((a, b) => (b.publishedAt ? Date.parse(b.publishedAt) : 0) - (a.publishedAt ? Date.parse(a.publishedAt) : 0));
}
export function createPansouClient(options: { baseUrl: string; fetchImpl?: typeof fetch; timeoutMs?: number }) {
  return { async search(input: ResourceSearchQuery, signal?: AbortSignal): Promise<ResourceSearchResult> {
    const query = validateResourceSearch(input);
    let url: URL;
    try {
      const base = new URL(options.baseUrl);
      if (!["http:", "https:"].includes(base.protocol) || base.username || base.password || base.search || base.hash) throw new Error();
      url = new URL("/api/search", base);
    } catch { throw new PansouError("资源搜索服务尚未配置。", 503, "NOT_CONFIGURED"); }
    signal?.throwIfAborted();
    url.search = new URLSearchParams({ kw: query.keyword, cloud_types: query.channels.join(","), conc: "4", res: "merge" }).toString();
    const controller = new AbortController();
    let timedOut = false;
    const abort = () => controller.abort(signal?.reason);
    signal?.addEventListener("abort", abort, { once: true });
    const timeout = Number.isFinite(options.timeoutMs) ? Math.max(1, Math.min(options.timeoutMs!, 25000)) : 25000;
    const timer = setTimeout(() => { timedOut = true; controller.abort(); }, timeout);
    try {
      // A transient transport failure may succeed on a fresh request.
      // Retry transport failures only; both attempts share this request's original deadline.
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          controller.signal.throwIfAborted();
          const response = await (options.fetchImpl ?? fetch)(url, { signal: controller.signal, redirect: "error", cache: "no-store", headers: { Accept: "application/json" } });
          if (!response.ok) {
            await response.body?.cancel().catch(() => undefined);
            throw new PansouError(response.status === 429 ? "搜索请求较多，请稍后重试。" : "资源搜索服务暂不可用，请稍后重试。", response.status === 429 ? 429 : 502, "UPSTREAM_HTTP_ERROR");
          }
          const items = normalize(await readBoundedJson(response), query);
          controller.signal.throwIfAborted();
          return { ...query, items, total: items.length, retrievedAt: new Date().toISOString() };
        } catch (error) {
          if (controller.signal.aborted || error instanceof PansouError || attempt === 1) throw error;
        }
      }
      throw new Error("Transport attempts exhausted");
    } catch (error) {
      if (signal?.aborted) throw signal.reason ?? new DOMException("Aborted", "AbortError");
      if (timedOut) throw new PansouError("搜索超时，请稍后重试或减少渠道。", 504, "TIMEOUT");
      if (error instanceof PansouError) throw error;
      throw new PansouError("无法连接资源搜索服务，请稍后重试。", 502, "NETWORK_ERROR");
    } finally { clearTimeout(timer); signal?.removeEventListener("abort", abort); }
  } };
}

import { buildDoubanRequest, DOUBAN_PAGE_SIZE, type DoubanFilters } from "./query";
import { normalizeDoubanItem } from "./normalize";
import type { Media } from "../types";

export class DoubanError extends Error {
  constructor(message: string, readonly code: string, readonly status: number) { super(message); this.name = "DoubanError"; }
}
export interface DoubanPage {
  items: Media[]; total: number; totalExact: boolean; hasMore: boolean; omitted: number;
  retrievedAt: string; stale: boolean;
}
export function parseDoubanPage(data: unknown, filters: DoubanFilters): Omit<DoubanPage, "retrievedAt" | "stale"> {
  const raw = data && typeof data === "object" && !Array.isArray(data) ? data as Record<string, unknown> : {};
  const entries = raw.subject_collection_items ?? raw.items ?? raw.subjects;
  if (!Array.isArray(entries) || (raw.start !== undefined && raw.start !== (filters.page - 1) * DOUBAN_PAGE_SIZE)) throw new DoubanError("豆瓣返回的分页格式无效，请重试。", "DOUBAN_INVALID_RESPONSE", 502);
  const ids = new Set<string>();
  const items = entries.flatMap(entry => {
    const item = normalizeDoubanItem(entry, filters.media);
    if (!item || ids.has(item.doubanId!)) return [];
    ids.add(item.doubanId!); return [item];
  });
  const end = (filters.page - 1) * DOUBAN_PAGE_SIZE + entries.length;
  const totalExact = Number.isSafeInteger(raw.total) && Number(raw.total) >= 0;
  const total = totalExact ? Number(raw.total) : end;
  return { items, total, totalExact, hasMore: entries.length > 0 && (totalExact ? end < total : entries.length >= DOUBAN_PAGE_SIZE), omitted: entries.length - items.length };
}

export function createDoubanClient(options: { fetchImpl?: typeof fetch; now?: () => number; timeoutMs?: number } = {}) {
  const fetchImpl = options.fetchImpl ?? fetch, now = options.now ?? Date.now;
  const cache = new Map<string, { result: DoubanPage; at: number }>(), inflight = new Map<string, Promise<DoubanPage>>();
  async function load(filters: DoubanFilters): Promise<DoubanPage> {
    const request = buildDoubanRequest(filters), controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? 12000);
    try {
      const response = await fetchImpl(request.url, { redirect: "error", cache: "no-store", signal: controller.signal,
        headers: { Accept: "application/json", Referer: request.referer, "User-Agent": "Mozilla/5.0" } });
      if (!response.ok) throw new DoubanError(response.status === 404 ? "片单不存在或无法公开访问。" : response.status === 403 || response.status === 429 ? "豆瓣暂时限制访问，请稍后重试。" : "豆瓣暂时无法提供数据，请重试。", "DOUBAN_UPSTREAM_FAILED", response.status === 404 ? 404 : response.status === 429 ? 429 : 502);
      let data: unknown;
      try { data = await response.json(); } catch { throw new DoubanError("豆瓣返回的内容无法读取，请稍后重试。", "DOUBAN_INVALID_RESPONSE", 502); }
      return { ...parseDoubanPage(data, filters), retrievedAt: new Date(now()).toISOString(), stale: false };
    } catch (error) {
      if (error instanceof DoubanError) throw error;
      throw new DoubanError(controller.signal.aborted ? "连接豆瓣超时，请重试。" : "无法连接豆瓣，请稍后重试。", "DOUBAN_UNAVAILABLE", controller.signal.aborted ? 504 : 502);
    } finally { clearTimeout(timer); }
  }
  function page(filters: DoubanFilters): Promise<DoubanPage> {
    const key = `${filters.media}:${buildDoubanRequest(filters).url}`, previous = cache.get(key);
    if (previous && now() - previous.at < 10 * 60_000) return Promise.resolve(previous.result);
    const pending = inflight.get(key); if (pending) return pending;
    const promise = load(filters).then(result => {
      cache.delete(key); cache.set(key, { result, at: now() });
      while (cache.size > 120) cache.delete(cache.keys().next().value!);
      return result;
    }).catch(error => {
      if (previous && now() - previous.at < 24 * 60 * 60_000) return { ...previous.result, stale: true };
      throw error;
    }).finally(() => inflight.delete(key));
    inflight.set(key, promise); return promise;
  }
  return { page };
}

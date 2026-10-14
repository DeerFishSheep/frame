import { buildDoubanRequest, DOUBAN_PAGE_SIZE, doubanListUrl, type DoubanFilters } from "./query";
import { normalizeDoubanItem } from "./normalize";
import type { Media, MediaType } from "../types";

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
  if (raw.error || Number(raw.code) >= 400) throw new DoubanError("豆瓣暂时无法提供榜单数据，请重试。", "DOUBAN_INVALID_RESPONSE", 502);
  const collection = raw.subject_collection;
  const emptyCollection = "subject_collection" in raw && (!collection || typeof collection !== "object" || !Object.keys(collection).length);
  if (filters.page === 1 && entries.length === 0 && (filters.chart === "top" || emptyCollection)) throw new DoubanError("豆瓣榜单暂时返回异常空数据，请重试。", "DOUBAN_INVALID_RESPONSE", 502);
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
  async function requestJson(url: string, referer: string, kind: "榜单" | "片单" | "作品" = "榜单"): Promise<unknown> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? 12000);
    try {
      const response = await fetchImpl(url, { redirect: "error", cache: "no-store", signal: controller.signal,
        headers: { Accept: "application/json", Referer: referer, "User-Agent": "Mozilla/5.0" } });
      if (!response.ok) throw new DoubanError(response.status === 404 ? kind === "片单" ? "片单不存在或无法公开访问。" : `豆瓣${kind}暂时无法读取，请重试。` : response.status === 403 || response.status === 429 ? "豆瓣暂时限制访问，请稍后重试。" : "豆瓣暂时无法提供数据，请重试。", "DOUBAN_UPSTREAM_FAILED", response.status === 404 ? 404 : response.status === 429 ? 429 : 502);
      let data: unknown;
      try { data = await response.json(); } catch { throw new DoubanError("豆瓣返回的内容无法读取，请稍后重试。", "DOUBAN_INVALID_RESPONSE", 502); }
      return data;
    } catch (error) {
      if (error instanceof DoubanError) throw error;
      throw new DoubanError(controller.signal.aborted ? "连接豆瓣超时，请重试。" : "无法连接豆瓣，请稍后重试。", "DOUBAN_UNAVAILABLE", controller.signal.aborted ? 504 : 502);
    } finally { clearTimeout(timer); }
  }
  async function load(filters: DoubanFilters): Promise<DoubanPage> {
    const request = buildDoubanRequest(filters);
    return { ...parseDoubanPage(await requestJson(request.url, request.referer, filters.chart === "lists" ? "片单" : "榜单"), filters), retrievedAt: new Date(now()).toISOString(), stale: false };
  }
  const metadata = new Map<string, { data: unknown; retrievedAt: string; at: number }>();
  const pendingMetadata = new Map<string, Promise<{ data: unknown; retrievedAt: string; stale: boolean }>>();
  function lookup(path: string, expectedId: string, referer: string, ttl = 60 * 60_000, kind: "作品" | "片单" = "作品") {
    const previous = metadata.get(path);
    if (previous && now() - previous.at < ttl) return Promise.resolve({ ...previous, stale: false });
    const pending = pendingMetadata.get(path); if (pending) return pending;
    const promise = requestJson(`https://m.douban.com/rexxar/api/v2/${path}?for_mobile=1`, referer, kind).then(data => {
      if (!data || typeof data !== "object" || String((data as Record<string, unknown>).id) !== expectedId) throw new DoubanError("豆瓣资料编号不匹配，请重试。", "DOUBAN_INVALID_RESPONSE", 502);
      const result = { data, retrievedAt: new Date(now()).toISOString(), at: now() };
      metadata.delete(path); metadata.set(path, result);
      while (metadata.size > 150) metadata.delete(metadata.keys().next().value!);
      return { ...result, stale: false };
    }).catch(error => {
      if (previous && now() - previous.at < 24 * 60 * 60_000) return { ...previous, stale: true };
      throw error;
    }).finally(() => pendingMetadata.delete(path));
    pendingMetadata.set(path, promise); return promise;
  }
  function subject(media: MediaType, id: string) {
    if (!["movie", "tv"].includes(media) || !/^[1-9]\d{0,11}$/.test(id)) throw new DoubanError("作品编号无效。", "INVALID_SUBJECT", 400);
    return lookup(`${media}/${id}`, id, `https://m.douban.com/${media}/${id}/`);
  }
  function collection(id: string) {
    const url = doubanListUrl(id), [kind, identifier] = id.split(":");
    return lookup(`${kind === "doulist" ? "doulist" : "subject_collection"}/${identifier}`, identifier, url, 10 * 60_000, "片单");
  }
  function page(filters: DoubanFilters): Promise<DoubanPage> {
    const request = buildDoubanRequest(filters);
    const key = `${filters.media}:${request.url}:${request.referer}`, previous = cache.get(key);
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
  return { page, subject, collection };
}

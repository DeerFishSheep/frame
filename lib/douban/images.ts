import { doubanImageUrl } from "../media-artwork";

export class ImageError extends Error {
  constructor(readonly status: number, readonly retryable = false) { super(status === 400 ? "图片地址无效。" : "图片暂时无法加载。"); }
}
interface ImageData { bytes: Uint8Array; type: string }
const MAX_IMAGE = 6 * 1024 * 1024, MAX_CACHE = 32 * 1024 * 1024;

/** Fixed public photo hosts only; no cookies, redirects, HTML or unbounded downloads. */
export function createDoubanImageLoader(options: { fetchImpl?: typeof fetch; now?: () => number; timeoutMs?: number } = {}) {
  const fetchImpl = options.fetchImpl ?? fetch, now = options.now ?? Date.now;
  const cache = new Map<string, ImageData & { at: number }>(), inflight = new Map<string, Promise<ImageData>>();
  let cacheBytes = 0;
  async function fetchImage(url: string): Promise<ImageData> {
    const controller = new AbortController(), timer = setTimeout(() => controller.abort(), options.timeoutMs ?? 10000);
    try {
      const response = await fetchImpl(url, { redirect: "error", cache: "no-store", signal: controller.signal,
        headers: { Referer: "https://m.douban.com/", "User-Agent": "Mozilla/5.0", Accept: "image/avif,image/webp,image/*" } });
      const type = response.headers.get("content-type")?.split(";")[0].toLowerCase() || "";
      if (response.status >= 500) { await response.body?.cancel(); throw new ImageError(502, true); }
      if (!response.ok || !/^image\/(?:jpeg|png|webp|gif|avif)$/.test(type) || Number(response.headers.get("content-length")) > MAX_IMAGE || !response.body) throw new ImageError(502);
      const reader = response.body.getReader(), parts: Uint8Array[] = []; let length = 0;
      while (true) {
        const { value, done } = await reader.read(); if (done) break;
        length += value.byteLength;
        if (length > MAX_IMAGE) { await reader.cancel(); throw new ImageError(502); }
        parts.push(value);
      }
      if (!length) throw new ImageError(502);
      const bytes = new Uint8Array(length); let offset = 0;
      for (const part of parts) { bytes.set(part, offset); offset += part.byteLength; }
      return { bytes, type };
    } catch (error) { throw error instanceof ImageError ? error : new ImageError(controller.signal.aborted ? 504 : 502, true); }
    finally { clearTimeout(timer); }
  }
  return (value: string): Promise<ImageData> => {
    const url = doubanImageUrl(value); if (!url) return Promise.reject(new ImageError(400));
    const previous = cache.get(url);
    if (previous && now() - previous.at < 60 * 60_000) { cache.delete(url); cache.set(url, previous); return Promise.resolve(previous); }
    const pending = inflight.get(url); if (pending) return pending;
    const promise = fetchImage(url).catch(error => {
      if (error instanceof ImageError && error.retryable) return fetchImage(url);
      throw error;
    }).then(data => {
      const existing = cache.get(url);
      if (existing) { cache.delete(url); cacheBytes -= existing.bytes.byteLength; }
      while (cache.size && cacheBytes + data.bytes.byteLength > MAX_CACHE) {
        const key = cache.keys().next().value!; cacheBytes -= cache.get(key)!.bytes.byteLength; cache.delete(key);
      }
      cache.set(url, { ...data, at: now() }); cacheBytes += data.bytes.byteLength;
      return data;
    }).finally(() => inflight.delete(url));
    inflight.set(url, promise); return promise;
  };
}

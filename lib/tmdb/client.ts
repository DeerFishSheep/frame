// This transport accepts its credentials from the server wrapper. It never reads public environment variables.
export class TmdbError extends Error {
  constructor(message: string, readonly code: string, readonly status: number) {
    super(message);
    this.name = "TmdbError";
  }
}

export interface TmdbResult<T> { data: T; retrievedAt: string; stale: boolean }
interface Entry { data: unknown; retrievedAt: string; cachedAt: number }
interface ClientOptions {
  token: string;
  cacheSeconds?: number;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
}

const allowedPath = /^\/(?:trending\/(?:movie|tv|all)\/(?:day|week)|(?:movie|tv)\/(?:popular|top_rated|now_playing|upcoming|on_the_air|airing_today|[1-9]\d*)|(?:discover|search)\/(?:movie|tv|multi)|search\/keyword)$/;

function validateData(data: unknown, path: string) {
  if (!data || typeof data !== "object" || Array.isArray(data)) throw new TmdbError("TMDB 返回的数据格式无效。", "TMDB_INVALID_RESPONSE", 502);
  const raw = data as Record<string, unknown>;
  const detailId = /^\/(?:movie|tv)\/([1-9]\d*)$/.exec(path)?.[1];
  if (detailId ? raw.id !== Number(detailId) : !Array.isArray(raw.results)) {
    throw new TmdbError("TMDB 返回的数据格式无效。", "TMDB_INVALID_RESPONSE", 502);
  }
}

export function createTmdbClient(options: ClientOptions) {
  const cache = new Map<string, Entry>();
  const inflight = new Map<string, Promise<TmdbResult<unknown>>>();
  const fetchImpl = options.fetchImpl ?? fetch;
  const now = options.now ?? Date.now;
  const sleep = options.sleep ?? ((ms) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  const ttl = Math.max(1, Math.min(options.cacheSeconds ?? 1800, 86400)) * 1000;
  const timeout = options.timeoutMs ?? 8000;
  const maxStaleAge = 24 * 60 * 60 * 1000;
  const maxCacheEntries = 500;

  async function fetchData(url: string): Promise<unknown> {
    for (let attempt = 0; attempt < 2; attempt++) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeout);
      try {
        const response = await fetchImpl(url, {
          headers: { Authorization: `Bearer ${options.token.trim()}`, Accept: "application/json" },
          signal: controller.signal, cache: "no-store",
        });
        if (response.status === 429 && attempt === 0) {
          const retry = Number(response.headers.get("retry-after"));
          await sleep(Math.min(2000, Math.max(100, Number.isFinite(retry) ? retry * 1000 : 500)));
          continue;
        }
        if (!response.ok) {
          if (response.status === 401 || response.status === 403) throw new TmdbError("服务器的 TMDB 凭证无效。", "TMDB_AUTH_FAILED", 502);
          if (response.status === 404) throw new TmdbError("未找到这部作品。", "TMDB_NOT_FOUND", 404);
          if (response.status === 429) throw new TmdbError("TMDB 请求频繁，请稍后重试。", "TMDB_RATE_LIMITED", 429);
          throw new TmdbError("TMDB 暂时无法提供数据，请稍后重试。", "TMDB_UPSTREAM_FAILED", 502);
        }
        try { return await response.json(); }
        catch { throw new TmdbError("TMDB 返回的数据无法读取。", "TMDB_INVALID_RESPONSE", 502); }
      } catch (error) {
        if (error instanceof TmdbError) throw error;
        if (controller.signal.aborted) {
          if (attempt === 0) continue;
          throw new TmdbError("连接 TMDB 超时，请重试。", "TMDB_TIMEOUT", 504);
        }
        throw new TmdbError("无法连接 TMDB，请稍后重试。", "TMDB_UNAVAILABLE", 502);
      } finally { clearTimeout(timer); }
    }
    throw new TmdbError("TMDB 请求失败。", "TMDB_UPSTREAM_FAILED", 502);
  }

  async function request<T>(path: string, params = new URLSearchParams()): Promise<TmdbResult<T>> {
    if (!allowedPath.test(path)) throw new TmdbError("不支持的数据接口。", "INVALID_TMDB_PATH", 400);
    if (!options.token.trim()) throw new TmdbError("请在服务器配置 TMDB_API_READ_ACCESS_TOKEN。", "TMDB_NOT_CONFIGURED", 503);
    const sorted = new URLSearchParams(params);
    sorted.sort();
    const key = `${path}?${sorted.toString()}`;
    const previous = cache.get(key);
    if (previous && now() - previous.cachedAt < ttl) return { data: previous.data as T, retrievedAt: previous.retrievedAt, stale: false };
    const active = inflight.get(key);
    if (active) return active as Promise<TmdbResult<T>>;
    const promise = (async (): Promise<TmdbResult<unknown>> => {
      try {
        const data = await fetchData(`https://api.themoviedb.org/3${key}`);
        validateData(data, path);
        const cachedAt = now();
        const retrievedAt = new Date(cachedAt).toISOString();
        cache.delete(key);
        cache.set(key, { data, retrievedAt, cachedAt });
        if (cache.size > maxCacheEntries) cache.delete(cache.keys().next().value!);
        return { data, retrievedAt, stale: false };
      } catch (error) {
        // Never serve stale content for invalid credentials or a confirmed missing item.
        if (previous && now() - previous.cachedAt < maxStaleAge && error instanceof TmdbError &&
          ["TMDB_TIMEOUT", "TMDB_UNAVAILABLE", "TMDB_UPSTREAM_FAILED", "TMDB_RATE_LIMITED", "TMDB_INVALID_RESPONSE"].includes(error.code)) {
          return { data: previous.data, retrievedAt: previous.retrievedAt, stale: true };
        }
        throw error;
      } finally { inflight.delete(key); }
    })();
    inflight.set(key, promise);
    return promise as Promise<TmdbResult<T>>;
  }
  return { request };
}

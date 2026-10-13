/** Shared async state machine. A request never clears the last successful view. */
export interface ResourceSnapshot<T> {
  data: T | null;
  dataKey: string;
  requestKey: string;
  pending: boolean;
  error: string;
}
interface CacheEntry { key: string; group: string; data: unknown; at: number }
export class ResourceCache {
  private entries = new Map<string, CacheEntry>();
  constructor(private limit = 16, private now = Date.now) {}
  get<T>(key: string) { return this.entries.get(key) as (CacheEntry & { data: T }) | undefined; }
  latest<T>(group: string) { return [...this.entries.values()].reverse().find(entry => entry.group === group) as (CacheEntry & { data: T }) | undefined; }
  touch(key: string) { const entry = this.entries.get(key); if (entry) { this.entries.delete(key); this.entries.set(key, entry); } }
  put<T>(key: string, group: string, data: T) {
    this.entries.delete(key); this.entries.set(key, { key, group, data, at: this.now() });
    while (this.entries.size > this.limit) this.entries.delete(this.entries.keys().next().value!);
  }
  fresh(key: string) { const entry = this.entries.get(key); return Boolean(entry && this.now() - entry.at < 60_000); }
}
// One browser-owned cache also survives route chunk changes and development hot updates.
const resourceMemory = globalThis as typeof globalThis & { __frameResourcesV1?: ResourceCache };
export const browserResources = typeof window === "undefined" ? new ResourceCache()
  : resourceMemory.__frameResourcesV1 ?? (resourceMemory.__frameResourcesV1 = new ResourceCache());
if (typeof window !== "undefined") Object.setPrototypeOf(browserResources, ResourceCache.prototype);

export class AsyncResource<T> {
  private state: ResourceSnapshot<T>;
  private version = 0;
  private controller: AbortController | null = null;
  private listeners = new Set<() => void>();
  constructor(private cache: ResourceCache, private group: string, key: string, initial?: T, keepPrevious = true) {
    const current = cache.get<T>(key), entry = current || (keepPrevious ? cache.latest<T>(group) : undefined);
    this.state = { data: entry?.data ?? initial ?? null, dataKey: entry?.key ?? (initial ? key : ""), requestKey: key, pending: !current && !initial, error: "" };
    if (!entry && initial) cache.put(key, group, initial);
  }
  snapshot = () => this.state;
  setGroup(group: string) { this.group = group; }
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  private publish(next: ResourceSnapshot<T>) { this.state = next; for (const listener of this.listeners) listener(); }
  cancel() { this.version++; this.controller?.abort(); this.controller = null; }
  update(key: string, data: T) {
    if (this.state.requestKey !== key || this.controller) return false;
    this.cache.put(key, this.group, data);
    this.publish({ data, dataKey: key, requestKey: key, pending: false, error: "" });
    return true;
  }
  async load(key: string, fetcher: (signal: AbortSignal, previous: T | null) => Promise<T>, force = false) {
    this.cancel();
    const version = this.version, cached = this.cache.get<T>(key);
    if (cached) this.cache.touch(key);
    if (cached && !force && this.cache.fresh(key)) {
      this.publish({ data: cached.data, dataKey: key, requestKey: key, pending: false, error: "" }); return;
    }
    const previous = cached?.data ?? (this.state.dataKey === key ? this.state.data : null);
    const controller = new AbortController(); this.controller = controller;
    this.publish({ ...this.state, ...(cached ? { data: cached.data, dataKey: key } : {}), requestKey: key, pending: true, error: "" });
    try {
      const data = await fetcher(controller.signal, previous);
      if (version !== this.version || controller.signal.aborted) return;
      this.cache.put(key, this.group, data);
      this.publish({ data, dataKey: key, requestKey: key, pending: false, error: "" });
    } catch (error) {
      if (version !== this.version || controller.signal.aborted) return;
      this.publish({ ...this.state, pending: false, error: error instanceof Error ? error.message : "更新失败，请重试。" });
    } finally { if (this.controller === controller) this.controller = null; }
  }
}

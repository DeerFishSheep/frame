"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { CatalogPager, refreshMediaPages } from "./catalog-pager";
import type { MediaPage } from "./types";
import { useAsyncResource } from "./use-async-resource";

interface Options<T extends MediaPage> {
  key: string; group: string; page?: number; initial?: T; enabled?: boolean; keepPrevious?: boolean;
  loadPage: (page: number, signal: AbortSignal) => Promise<T>;
}
export function usePagedResource<T extends MediaPage>(options: Options<T>) {
  const resource = useAsyncResource<T>({ ...options, load: (signal, previous) => refreshMediaPages(options.page ?? 1, previous, options.loadPage, signal) });
  const [pager] = useState(() => new CatalogPager<T>()), generation = useRef(0);
  const [more, setMore] = useState({ busy: false, error: "", paused: false });
  useEffect(() => {
    generation.current++; pager.cancel(); setMore({ busy: false, error: "", paused: false });
    return () => { generation.current++; pager.cancel(); };
  }, [options.key, pager]);
  useEffect(() => {
    if (resource.pending) { generation.current++; pager.cancel(); setMore({ busy: false, error: "", paused: false }); }
  }, [resource.pending, pager]);
  const feed = resource.data;
  const hasMore = Boolean(resource.current && feed && feed.page < feed.totalPages);
  const loadMore = useCallback(async () => {
    if (!hasMore || !feed || resource.pending || resource.error || !pager.canLoadNext(feed)) return false;
    const version = generation.current;
    setMore({ busy: true, error: "", paused: false });
    try {
      const next = await pager.loadNext(feed, options.loadPage);
      if (!next || generation.current !== version || !resource.update(next)) return false;
      setMore({ busy: false, error: "", paused: next.results.length <= feed.results.length });
      return true;
    } catch (error) {
      if (generation.current === version) setMore({ busy: false, error: error instanceof Error ? error.message : "加载失败，请重试。", paused: true });
      return false;
    } finally {
      if (generation.current === version && !pager.busy) setMore(current => ({ ...current, busy: false }));
    }
  }, [hasMore, feed, resource.pending, resource.error, resource.update, options.loadPage, pager]);
  return { ...resource, hasMore, loadMore, loadingMore: more.busy && !resource.pending, moreError: more.error, autoPaused: more.paused };
}

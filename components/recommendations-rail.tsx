"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, LoaderCircle, RefreshCw } from "lucide-react";
import { mergeMediaPages } from "@/lib/media-presentation";
import { mediaKey, type CatalogResponse, type MediaPage, type MediaType } from "@/lib/types";
import { usePagedResource } from "@/lib/use-paged-resource";
import { useScrollMemory } from "@/lib/view-state";
import { ResourceFeedback, resourceLoadingProps } from "./resource-feedback";
import { MediaCard } from "./media-card";

export function RecommendationsRail({ initial, mediaType, id, source = "tmdb", pending = false }: { pending?: boolean; initial: MediaPage; mediaType: MediaType; id: number; source?: string }) {
  const key = `recommendations:${source}:${mediaType}:${id}`;
  const resource = usePagedResource<MediaPage & { stale?: boolean }>({
    key, group: key, initial: { ...initial, results: mergeMediaPages([], initial.results) }, keepPrevious: false,
    loadPage: async (page, signal) => {
      if (source === "demo") return initial;
      const response = await fetch(`/api/recommendations/${mediaType}/${id}?page=${page}`, { signal });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "推荐作品加载失败");
      return data as CatalogResponse;
    },
  });
  const feed = resource.data || initial, busy = resource.pending || resource.loadingMore;
  const error = resource.error || resource.moreError, stale = resource.data?.stale;
  const hasMore = resource.hasMore;
  const [edges, setEdges] = useState({ start: true, end: false });
  const rail = useRef<HTMLDivElement>(null), tail = useRef<HTMLDivElement>(null);
  const rememberRail = useScrollMemory(`${key}:scroll`, rail);
  const advanceAfterLoad = useRef(false), lastInitial = useRef(initial);
  useEffect(() => {
    if (lastInitial.current === initial) return;
    lastInitial.current = initial;
    resource.update({ ...feed, ...initial, page: Math.max(feed.page, initial.page), results: mergeMediaPages(initial.results, feed.results) });
  }, [initial, resource.update]);

  const measure = useCallback(() => {
    const node = rail.current;
    if (!node) return;
    const start = node.scrollLeft <= 2;
    const end = node.scrollLeft + node.clientWidth >= node.scrollWidth - 2;
    setEdges(current => current.start === start && current.end === end ? current : { start, end });
  }, [key]);

  const loadMore = useCallback(async () => {
    if (resource.error) { resource.refresh(); return; }
    const loaded = await resource.loadMore();
    if (!loaded) advanceAfterLoad.current = false;
  }, [resource.error, resource.refresh, resource.loadMore]);
  useEffect(() => {
    const node = rail.current;
    if (!node) return;
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    measure();
    return () => observer.disconnect();
  }, [measure]);
  useEffect(() => {
    measure();
    if (advanceAfterLoad.current) {
      advanceAfterLoad.current = false;
      const node = rail.current;
      node?.scrollBy({ left: node.clientWidth * .85, behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth" });
    }
  }, [feed, measure]);
  useEffect(() => {
    if (!hasMore || busy || error || resource.autoPaused || !tail.current) return;
    let active = true;
    const observer = new IntersectionObserver(entries => {
      if (active && entries.some(entry => entry.isIntersecting)) void loadMore();
    }, { root: rail.current, threshold: .1 });
    observer.observe(tail.current);
    return () => { active = false; observer.disconnect(); };
  }, [hasMore, busy, error, resource.autoPaused, loadMore]);

  function move(direction: -1 | 1) {
    const node = rail.current;
    if (!node) return;
    if (direction === 1 && edges.end && hasMore) {
      advanceAfterLoad.current = true;
      void loadMore();
    } else {
      node.scrollBy({ left: direction * node.clientWidth * .85, behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth" });
    }
  }

  return <section className="detail-section recommendations-section resource-region" aria-labelledby="recommendations-heading">
    <ResourceFeedback pending={pending || resource.pending} error={resource.error} retained={Boolean(resource.data)} onRetry={resource.refresh}/>
    <div className="subsection-head" data-scroll-anchor="recommendations-heading">
      <div className="recommendations-heading"><h2 id="recommendations-heading">猜你喜欢</h2>{feed.totalResults > 0 && <span>{feed.totalResults} 部</span>}</div>
      <div className="rail-controls">
        <button aria-label="向左浏览猜你喜欢" disabled={edges.start} onClick={() => move(-1)}><ChevronLeft size={18}/></button>
        <button aria-label="向右浏览猜你喜欢" disabled={(edges.end && !hasMore) || busy && edges.end} onClick={() => move(1)}><ChevronRight size={18}/></button>
      </div>
    </div>
    <div className="recommendations-rail" {...resourceLoadingProps(pending || resource.pending)} ref={rememberRail} onScroll={measure} tabIndex={0} role="region" aria-label="猜你喜欢，左右滑动查看更多"
      onKeyDown={event => { if (event.target === event.currentTarget && (event.key === "ArrowLeft" || event.key === "ArrowRight")) { event.preventDefault(); move(event.key === "ArrowLeft" ? -1 : 1); } }}>
      {feed.results.map((item, index) => <MediaCard key={mediaKey(item)} item={item} showRank={false} resultIndex={index + 1}/>)}
      {hasMore && <div className="recommendations-tail" ref={tail}>
        {busy ? <span><LoaderCircle size={20} className="spinning"/>加载中</span>
          : <button className="text-link" onClick={() => void loadMore()}>{error ? <><RefreshCw size={17}/>重试</> : <>继续浏览<ChevronRight size={17}/></>}</button>}
      </div>}
    </div>
    <p className="rail-status" role="status">{error || (busy ? "正在加载更多推荐…" : !feed.results.length && !hasMore ? "这部作品暂无推荐。" : stale ? "正在显示上次获取的推荐。" : hasMore ? "左右滑动，继续发现" : `已展示全部 ${feed.results.length} 部推荐`)}</p>
  </section>;
}

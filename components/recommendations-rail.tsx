"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, LoaderCircle, RefreshCw } from "lucide-react";
import { mergeMediaPages } from "@/lib/media-presentation";
import { mediaKey, type CatalogResponse, type MediaPage, type MediaType } from "@/lib/types";
import { MediaCard } from "./media-card";

export function RecommendationsRail({ initial, mediaType, id }: { initial: MediaPage; mediaType: MediaType; id: number }) {
  const [feed, setFeed] = useState(() => ({ ...initial, results: mergeMediaPages([], initial.results) }));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [stale, setStale] = useState(false);
  const [edges, setEdges] = useState({ start: true, end: false });
  const rail = useRef<HTMLDivElement>(null);
  const tail = useRef<HTMLDivElement>(null);
  const request = useRef<AbortController | null>(null);
  const advanceAfterLoad = useRef(false);
  const hasMore = feed.page < feed.totalPages;

  const measure = useCallback(() => {
    const node = rail.current;
    if (!node) return;
    const start = node.scrollLeft <= 2;
    const end = node.scrollLeft + node.clientWidth >= node.scrollWidth - 2;
    setEdges(current => current.start === start && current.end === end ? current : { start, end });
  }, []);

  const loadMore = useCallback(async () => {
    if (request.current || feed.page >= feed.totalPages) return;
    const controller = new AbortController();
    request.current = controller;
    setBusy(true);
    setError("");
    try {
      const response = await fetch(`/api/recommendations/${mediaType}/${id}?page=${feed.page + 1}`, { signal: controller.signal });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "推荐作品加载失败");
      if (controller.signal.aborted) return;
      const next: CatalogResponse = data;
      setFeed(current => ({ ...next, results: mergeMediaPages(current.results, next.results) }));
      setStale(next.stale);
    } catch (err) {
      if (!controller.signal.aborted) setError(err instanceof Error ? err.message : "连接中断，请重试");
    } finally {
      if (request.current === controller) request.current = null;
      if (!controller.signal.aborted) setBusy(false);
    }
  }, [feed.page, feed.totalPages, mediaType, id]);

  useEffect(() => () => { request.current?.abort(); request.current = null; }, []);
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
    if (!hasMore || error || !tail.current) return;
    const observer = new IntersectionObserver(entries => {
      if (entries.some(entry => entry.isIntersecting)) void loadMore();
    }, { root: rail.current, threshold: .1 });
    observer.observe(tail.current);
    return () => observer.disconnect();
  }, [hasMore, error, loadMore]);

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

  return <section className="detail-section recommendations-section" aria-labelledby="recommendations-heading">
    <div className="subsection-head">
      <div className="recommendations-heading"><h2 id="recommendations-heading">猜你喜欢</h2>{feed.totalResults > 0 && <span>{feed.totalResults} 部</span>}</div>
      <div className="rail-controls">
        <button aria-label="向左浏览猜你喜欢" disabled={edges.start} onClick={() => move(-1)}><ChevronLeft size={18}/></button>
        <button aria-label="向右浏览猜你喜欢" disabled={(edges.end && !hasMore) || busy && edges.end} onClick={() => move(1)}><ChevronRight size={18}/></button>
      </div>
    </div>
    <div className="recommendations-rail" ref={rail} onScroll={measure} tabIndex={0} role="region" aria-label="猜你喜欢，左右滑动查看更多"
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

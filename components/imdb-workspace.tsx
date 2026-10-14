"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef } from "react";
import { ArrowUpRight, ChevronDown, Grid2X2, List, LoaderCircle, RefreshCw } from "lucide-react";
import { useViewState } from "@/lib/view-state";
import { usePagedResource } from "@/lib/use-paged-resource";
import type { CatalogView } from "@/lib/catalog-view";
import { ResourceRegion, resourceLoadingProps } from "./resource-feedback";
import { mediaKey, type CatalogResponse } from "@/lib/types";
import { IMDB_PAGE_SIZE, IMDB_SORTS, imdbChart, imdbParams, parseImdbFilters, type ImdbFilters } from "@/lib/imdb/query";
import { formatCount, formatTime } from "@/lib/ui";
import { MediaCard, MediaSkeletons } from "./media-card";
import { formatFeaturedLabel } from "@/lib/media-presentation";
import { FeaturedFilm } from "./featured-film";
import { CatalogSection } from "./catalog-section";

export function ImdbWorkspace() {
  const params = useSearchParams(), router = useRouter(), parameterString = params.toString();
  const parsed = useMemo(() => {
    try { return { filters: parseImdbFilters(new URLSearchParams(parameterString)), error: "" }; }
    catch (error) { return { filters: { media: "movie", chart: "top", sort: "rank", page: 1 } as ImdbFilters, error: error instanceof Error ? error.message : "榜单链接无效。" }; }
  }, [parameterString]);
  const filters = parsed.filters, key = imdbParams(filters).toString(), chart = imdbChart(filters);
  const [layout, setLayout] = useViewState<"grid" | "list">("catalog-layout", "grid");
  const moreAnchor = useRef<HTMLDivElement>(null);
  const change = (values: Partial<ImdbFilters>) => router.replace(`/?${imdbParams({ ...filters, ...values, page: 1 })}`, { scroll: false });
  const resource = usePagedResource<CatalogView>({
    key: `catalog:imdb:${key}`, group: "catalog", page: filters.page, enabled: !parsed.error,
    loadPage: async (page, signal) => ({ ...await fetchPage({ ...filters, page }, signal), context: {
      title: `IMDB · ${chart.label}`, featuredLabel: formatFeaturedLabel("imdb", chart.label), ranked: filters.sort === "rank", startPage: filters.page, feature: true,
    } }),
  });
  const current = resource.data, items = current?.results || [];
  const loading = resource.pending, error = parsed.error || resource.error;
  const { loadMore, hasMore, loadingMore, moreError, autoPaused } = resource;
  useEffect(() => {
    try { setLayout(localStorage.getItem("frame_layout_v2") === "list" ? "list" : "grid"); } catch { /* Grid is available without storage. */ }
  }, []);

  useEffect(() => {
    const target = moreAnchor.current;
    if (!target || !hasMore || loading || loadingMore || error || moreError || autoPaused || typeof IntersectionObserver === "undefined") return;
    let active = true;
    const observer = new IntersectionObserver(entries => {
      if (active && entries.some(entry => entry.isIntersecting)) void loadMore();
    }, { rootMargin: `0px 0px ${Math.round(Math.min(1000, Math.max(400, window.innerHeight * .8)))}px 0px` });
    observer.observe(target); return () => { active = false; observer.disconnect(); };
  }, [hasMore, loading, loadingMore, error, moreError, autoPaused, loadMore]);

  function toggleLayout() {
    const next = layout === "grid" ? "list" : "grid"; setLayout(next);
    try { localStorage.setItem("frame_layout_v2", next); } catch { /* This visit still changes layout. */ }
  }

  return <div className="workspace workspace--featured imdb-workspace">
    {items.length > 0 && <FeaturedFilm items={items} label={current?.context.featuredLabel || formatFeaturedLabel("imdb", chart.label)} pending={loading}/>}
    {loading && !current && <div className="skeleton featured-loading" aria-label="正在加载 IMDB 焦点影片"/>}
    <CatalogSection id="imdb-heading" title={current?.context.title || `IMDB · ${chart.label}`}
      actions={<button className="icon-button view-toggle" onClick={toggleLayout} aria-label={layout === "grid" ? "切换列表视图" : "切换海报视图"}>{layout === "grid" ? <List size={18}/> : <Grid2X2 size={18}/>}</button>}
      charts={(["top", "popular"] as const).map(value => ({ id: value, label: imdbChart({ ...filters, chart: value }).label, selected: filters.chart === value, onSelect: () => change({ chart: value }) }))}
      chartLabel="IMDB 榜单分类"
      chartAction={<a className="catalog-more" href={chart.url} target="_blank" rel="noopener noreferrer">查看原榜<ArrowUpRight size={14}/></a>}
      sortLabel="IMDB 排序方式"
      sort={IMDB_SORTS.map(option => <button key={option.value} className={`filter-chip ${filters.sort === option.value ? "active" : ""}`} aria-pressed={filters.sort === option.value} onClick={() => change({ sort: option.value })}>{option.label}</button>)}>
      <div className="catalog-status" {...resourceLoadingProps(loading)}><span data-skeleton="line">{loading ? "正在加载 IMDB…" : error ? current ? "更新失败，已保留上次内容" : "加载失败" : `${current?.stale ? "缓存数据 · " : ""}${current?.source === "tmdb" ? "TMDB" : "IMDB"} · ${formatTime(current?.retrievedAt || null)} 更新`}</span>{current && <span data-skeleton="line">{formatCount(current.totalResults)} 部 · {current.context.ranked ? "原榜顺序" : "当前排序结果"}</span>}</div>
      {current?.notice && <p className="imdb-notice" role="status">{current.notice}</p>}
      <ResourceRegion pending={loading} error={error} retained={Boolean(current)} onRetry={() => parsed.error ? change({ media: "movie", chart: "top", sort: "rank" }) : resource.refresh()}>
      {loading && !current ? <MediaSkeletons/> : error && !current ? <div className="empty-state" data-skeleton="block" role="alert"><RefreshCw size={28}/><h3>{parsed.error ? "榜单条件无效" : "暂时无法加载 IMDB"}</h3><p>{error}</p><button className="primary-button" onClick={() => parsed.error ? change({ media: "movie", chart: "top", sort: "rank" }) : resource.refresh()}>{parsed.error ? "重置条件" : "重试"}</button></div>
        : items.length ? <div className={`media-grid ${layout === "list" ? "list-layout" : ""}`}>{items.map((item, index) => <MediaCard key={mediaKey(item)} item={item} showRank={current?.context.ranked} resultIndex={((current?.context.startPage ?? filters.page) - 1) * IMDB_PAGE_SIZE + index + 1}/>)}</div>
        : <div className="empty-state" data-skeleton="block"><h3>这一页没有更多作品</h3><button className="secondary-button" onClick={() => change({})}>返回第一页</button></div>}
      </ResourceRegion>
      {moreError && <p className="load-error" role="alert">{moreError}</p>}
      {!loading && !error && hasMore && <div ref={moreAnchor} className="load-more-row"><button className="load-more" onClick={() => void loadMore()} disabled={loadingMore}>{loadingMore ? <LoaderCircle size={16} className="spinning"/> : moreError ? <RefreshCw size={16}/> : <ChevronDown size={16}/>} {loadingMore ? "正在加载" : moreError ? "重试加载" : "加载更多"}</button></div>}
    </CatalogSection>
  </div>;
}

async function fetchPage(filters: ImdbFilters, signal: AbortSignal): Promise<CatalogResponse> {
  const response = await fetch(`/api/imdb?${imdbParams(filters)}`, { signal });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "暂时无法获取 IMDB 榜单。");
  if (data.source !== "imdb" || !Array.isArray(data.results) || data.page !== filters.page) throw new Error("IMDB 分页数据无效，请重试。");
  return data;
}

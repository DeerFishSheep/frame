"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { ArrowUpRight, ChevronDown, Grid2X2, List, LoaderCircle, RefreshCw } from "lucide-react";
import { useViewState } from "@/lib/view-state";
import { useStableUpdate } from "@/lib/use-stable-update";
import { usePagedResource } from "@/lib/use-paged-resource";
import { formatCatalogTitle, sourceLabel, type CatalogSourceId } from "@/lib/catalog-sources";
import type { CatalogView } from "@/lib/catalog-view";
import { mediaKey, type CatalogResponse } from "@/lib/types";
import { formatCount, formatTime } from "@/lib/ui";
import { ResourceRegion, resourceLoadingProps } from "./resource-feedback";
import { MediaCard, MediaSkeletons } from "./media-card";
import { FeaturedFilm } from "./featured-film";
import { CatalogSection, type CatalogTab } from "./catalog-section";

interface Props {
  source: CatalogSourceId; queryKey: string; page: number; title: string; ranked: boolean; originalUrl: string;
  charts: CatalogTab[]; sort?: ReactNode; controls?: ReactNode; error?: string;
  originalLabel?: string; countLabel?: string;
  featured?: boolean; resourceGroup?: string;
  loadPage: (page: number, signal: AbortSignal) => Promise<CatalogResponse>; onReset: () => void;
}

/** IMDB, Douban and future adapters supply data/controls; loading, pagination and layout stay shared. */
export function ProviderCatalog({ source, queryKey, page, title, ranked, originalUrl, charts, sort, controls, error: queryError, loadPage, onReset, originalLabel = "查看原榜", countLabel = "原榜", featured = true, resourceGroup = "catalog" }: Props) {
  const label = sourceLabel(source), moreAnchor = useRef<HTMLDivElement>(null);
  const prepare = useStableUpdate();
  const [layout, setLayout] = useViewState<"grid" | "list">("catalog-layout", "grid");
  const resource = usePagedResource<CatalogView>({ key: `${resourceGroup}:${source}:${queryKey}`, group: resourceGroup, page, enabled: !queryError,
    loadPage: async (number, signal) => ({ ...await loadPage(number, signal), context: { title, featuredLabel: formatCatalogTitle(source, title), ranked, startPage: page, feature: featured } }),
  });
  const current = resource.data, items = current?.results || [], loading = resource.pending, error = queryError || resource.error;
  const { loadMore, hasMore, loadingMore, moreError, autoPaused } = resource;
  useEffect(() => {
    try { setLayout(localStorage.getItem("frame_layout_v2") === "list" ? "list" : "grid"); } catch { /* Default layout works without storage. */ }
  }, []);
  useEffect(() => {
    const target = moreAnchor.current;
    if (!target || !hasMore || loading || loadingMore || error || moreError || autoPaused) return;
    let active = true;
    const observer = new IntersectionObserver(entries => { if (active && entries.some(entry => entry.isIntersecting)) void loadMore(); },
      { rootMargin: `0px 0px ${Math.round(Math.min(1000, Math.max(400, window.innerHeight * .8)))}px 0px` });
    observer.observe(target); return () => { active = false; observer.disconnect(); };
  }, [hasMore, loading, loadingMore, error, moreError, autoPaused, loadMore]);
  const toggleLayout = () => {
    prepare();
    const next = layout === "grid" ? "list" : "grid"; setLayout(next);
    try { localStorage.setItem("frame_layout_v2", next); } catch { /* Keep this visit's selection. */ }
  };
  const retry = () => queryError ? onReset() : resource.refresh();
  return <div className={`workspace ${featured ? "workspace--featured" : "workspace--collection"}`}>
    {featured && items.length > 0 && <FeaturedFilm items={items} label={current?.context.featuredLabel || formatCatalogTitle(source, title)} pending={loading}/>}
    {featured && loading && !current && <div className="skeleton featured-loading" aria-busy="true" aria-label={`正在加载 ${label} 焦点影片`}/>}
    <CatalogSection id={`${source}-heading`} title={current?.context.title || title} dataSource={current?.source || source}
      actions={<button className="icon-button view-toggle" onClick={toggleLayout} aria-label={layout === "grid" ? "切换列表视图" : "切换海报视图"}>{layout === "grid" ? <List size={18}/> : <Grid2X2 size={18}/>}</button>}
      charts={charts} chartLabel={`${label} 榜单分类`} chartAction={<a className="catalog-more" href={originalUrl} target="_blank" rel="noopener noreferrer">{originalLabel}<ArrowUpRight size={14}/></a>}
      sort={sort} sortLabel={`${label} 排序方式`}>
      {controls}
      <div className="catalog-status" {...resourceLoadingProps(loading)}>
        <span data-skeleton="line">{loading ? "正在加载…" : error ? current ? "更新失败，已保留上次内容" : "加载失败" : `${current?.stale ? "缓存数据 · " : ""}${sourceLabel(current?.source || source)} · ${formatTime(current?.retrievedAt || null)} 更新`}</span>
        {current && <span data-skeleton="line">{current.totalResultsExact === false ? `已加载 ${formatCount(items.length)} 部` : current.source === "douban" ? `${countLabel}共 ${formatCount(current.totalResults)} 项` : `${formatCount(current.totalResults)} 部 · ${current.context.ranked ? "原榜顺序" : "当前排序结果"}`}</span>}
      </div>
      {current?.notice && !loading && <p className="provider-notice" role="status">{current.notice}</p>}
      <ResourceRegion pending={loading} error={error} retained={Boolean(current)} onRetry={retry}>
        {loading && !current ? <MediaSkeletons/> : error && !current ? <div className="empty-state" data-skeleton="block" role="alert"><RefreshCw size={28}/><h3>暂时无法加载 {label}</h3><p>{error}</p><button className="primary-button" onClick={retry}>{queryError ? "重置条件" : "重试"}</button></div>
          : items.length ? <div className={`media-grid ${layout === "list" ? "list-layout" : ""}`}>{items.map((item, index) => <MediaCard key={mediaKey(item)} item={item} showRank={current?.context.ranked} resultIndex={((current?.context.startPage ?? page) - 1) * 20 + index + 1}/>)}</div>
          : <div className="empty-state" data-skeleton="block"><h3>当前条件没有影视作品</h3><button className="secondary-button" onClick={onReset}>重置条件</button></div>}
      </ResourceRegion>
      {moreError && <p className="load-error" role="alert">{moreError}</p>}
      {!loading && !error && hasMore && <div ref={moreAnchor} className="load-more-row"><button className="load-more" onClick={() => void loadMore()} disabled={loadingMore}>{loadingMore ? <LoaderCircle size={16} className="spinning"/> : moreError ? <RefreshCw size={16}/> : <ChevronDown size={16}/>} {loadingMore ? "正在加载" : moreError ? "重试加载" : "加载更多"}</button></div>}
    </CatalogSection>
  </div>;
}

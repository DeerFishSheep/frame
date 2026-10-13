"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowUpRight, ChevronDown, Grid2X2, List, LoaderCircle, RefreshCw } from "lucide-react";
import { CatalogPager } from "@/lib/catalog-pager";
import { mediaKey, type CatalogResponse } from "@/lib/types";
import { IMDB_PAGE_SIZE, IMDB_SORTS, imdbChart, imdbParams, parseImdbFilters, type ImdbFilters } from "@/lib/imdb/query";
import { formatCount, formatTime } from "@/lib/ui";
import { MediaCard, MediaSkeletons } from "./media-card";
import { FeaturedFilm } from "./featured-film";
import { CatalogSection } from "./catalog-section";

export function ImdbWorkspace() {
  const params = useSearchParams(), router = useRouter(), parameterString = params.toString();
  const parsed = useMemo(() => {
    try { return { filters: parseImdbFilters(new URLSearchParams(parameterString)), error: "" }; }
    catch (error) { return { filters: { media: "movie", chart: "top", sort: "rank", page: 1 } as ImdbFilters, error: error instanceof Error ? error.message : "榜单链接无效。" }; }
  }, [parameterString]);
  const filters = parsed.filters, key = imdbParams(filters).toString(), chart = imdbChart(filters);
  const [response, setResponse] = useState<CatalogResponse | null>(null), [responseKey, setResponseKey] = useState("");
  const [loading, setLoading] = useState(true), [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState(""), [moreError, setMoreError] = useState("");
  const [refresh, setRefresh] = useState(0), [layout, setLayout] = useState<"grid" | "list">("grid");
  const [autoPaused, setAutoPaused] = useState(false), [pager] = useState(() => new CatalogPager());
  const generation = useRef(0), moreAnchor = useRef<HTMLDivElement>(null);
  const current = responseKey === key ? response : null;
  const items = current?.results || [], hasMore = Boolean(current && current.page < current.totalPages);

  const change = (values: Partial<ImdbFilters>) => router.replace(`/?${imdbParams({ ...filters, ...values, page: 1 })}`, { scroll: false });
  useEffect(() => {
    try { setLayout(localStorage.getItem("frame_layout_v2") === "list" ? "list" : "grid"); } catch { /* Grid is available without storage. */ }
  }, []);
  useEffect(() => {
    const version = ++generation.current, controller = new AbortController();
    pager.cancel(); setResponse(null); setLoading(!parsed.error); setError(parsed.error); setMoreError(""); setLoadingMore(false); setAutoPaused(false);
    if (!parsed.error) {
      fetchPage(filters, controller.signal).then(data => {
        if (generation.current === version) { setResponse(data); setResponseKey(key); }
      }).catch((err: unknown) => {
        if (!controller.signal.aborted && generation.current === version) setError(err instanceof Error ? err.message : "IMDB 加载失败。");
      }).finally(() => { if (generation.current === version) setLoading(false); });
    }
    return () => { controller.abort(); pager.cancel(); generation.current++; };
  }, [filters, key, parsed.error, pager, refresh]);

  const loadMore = useCallback(async () => {
    if (!current || loading || !pager.canLoadNext(current)) return;
    const version = generation.current;
    setLoadingMore(true); setMoreError("");
    try {
      const next = await pager.loadNext(current, (page, signal) => fetchPage({ ...filters, page }, signal));
      if (next && generation.current === version) {
        setAutoPaused(next.results.length <= current.results.length);
        setResponse(next);
      }
    } catch (err) {
      if (generation.current === version) setMoreError(err instanceof Error ? err.message : "加载失败，请重试。");
    } finally { if (generation.current === version && !pager.busy) setLoadingMore(false); }
  }, [current, loading, pager, filters]);

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
    {items.length > 0 && <FeaturedFilm items={items.slice(0, 5)} label={`IMDB · ${chart.label}`}/>}
    {loading && <div className="skeleton featured-loading" aria-label="正在加载 IMDB 焦点影片"/>}
    <CatalogSection id="imdb-heading" title={`IMDB · ${chart.label}`}
      actions={<button className="icon-button view-toggle" onClick={toggleLayout} aria-label={layout === "grid" ? "切换列表视图" : "切换海报视图"}>{layout === "grid" ? <List size={18}/> : <Grid2X2 size={18}/>}</button>}
      charts={(["top", "popular"] as const).map(value => ({ id: value, label: imdbChart({ ...filters, chart: value }).label, selected: filters.chart === value, onSelect: () => change({ chart: value }) }))}
      chartLabel="IMDB 榜单分类"
      chartAction={<a className="catalog-more" href={chart.url} target="_blank" rel="noopener noreferrer">查看原榜<ArrowUpRight size={14}/></a>}
      sortLabel="IMDB 排序方式"
      sort={IMDB_SORTS.map(option => <button key={option.value} className={`filter-chip ${filters.sort === option.value ? "active" : ""}`} aria-pressed={filters.sort === option.value} onClick={() => change({ sort: option.value })}>{option.label}</button>)}>
      <div className="catalog-status"><span>{loading ? "正在加载 IMDB…" : error ? "加载失败" : `${current?.stale ? "缓存数据 · " : ""}IMDB · ${formatTime(current?.retrievedAt || null)} 更新`}</span>{current && <span>{formatCount(current.totalResults)} 部 · {filters.sort === "rank" ? "原榜顺序" : IMDB_SORTS.find(option => option.value === filters.sort)?.label}</span>}</div>
      {current?.notice && <p className="imdb-notice" role="status">{current.notice}</p>}
      {loading ? <MediaSkeletons/> : error ? <div className="empty-state" role="alert"><RefreshCw size={28}/><h3>{parsed.error ? "榜单条件无效" : "暂时无法加载 IMDB"}</h3><p>{error}</p><button className="primary-button" onClick={() => parsed.error ? change({ media: "movie", chart: "top", sort: "rank" }) : setRefresh(value => value + 1)}>{parsed.error ? "重置条件" : "重试"}</button></div>
        : items.length ? <div className={`media-grid ${layout === "list" ? "list-layout" : ""}`}>{items.map((item, index) => <MediaCard key={mediaKey(item)} item={item} showRank={filters.sort === "rank"} resultIndex={(filters.page - 1) * IMDB_PAGE_SIZE + index + 1}/>)}</div>
        : <div className="empty-state"><h3>这一页没有更多作品</h3><button className="secondary-button" onClick={() => change({})}>返回第一页</button></div>}
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

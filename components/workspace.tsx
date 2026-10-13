"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowRight, Bookmark, ChevronDown, Grid2X2, List, LoaderCircle, RefreshCw, Search } from "lucide-react";
import { DEFAULT_FILTERS, mediaKey, type CatalogFilters, type CatalogResponse, type Chart, type Media } from "@/lib/types";
import { getDemoCatalog } from "@/lib/demo";
import { selectFeaturedMedia } from "@/lib/media-presentation";
import { parseFilters } from "@/lib/query";
import { chartMeta, formatCount, formatTime, GENRES, serializeFilters } from "@/lib/ui";
import { useFrame } from "./providers";
import { matchesDateRange } from "@/lib/date-filters";
import { useTodayDate } from "@/lib/use-today-date";
import { MediaCard, MediaSkeletons } from "./media-card";
import { FilterPanel } from "./filter-panel";
import { AppliedFilters } from "./applied-filters";
import { FeaturedFilm } from "./featured-film";
import { CatalogSection } from "./catalog-section";

function filterFavorites(items: Media[], filters: CatalogFilters) {
  const query = filters.query.trim().toLowerCase();
  const filtered = items.filter(item =>
    (filters.media === "all" || item.mediaType === filters.media)
    && (!query || `${item.title} ${item.originalTitle} ${item.overview}`.toLowerCase().includes(query))
    && (!filters.genres.length || (filters.genreLogic === "and"
      ? filters.genres.every(id => item.genreIds.includes(Number(id)))
      : filters.genres.some(id => item.genreIds.includes(Number(id)))))
    && matchesDateRange(item.releaseDate, filters.dateFrom, filters.dateTo)
    && (!filters.scoreMin || item.voteAverage >= Number(filters.scoreMin))
    && (!filters.scoreMax || item.voteAverage <= Number(filters.scoreMax))
    && (!filters.votesMin || item.voteCount >= Number(filters.votesMin)));
  if (filters.sort === "vote_average.desc") filtered.sort((a, b) => b.voteAverage - a.voteAverage);
  else if (filters.sort === "vote_count.desc") filtered.sort((a, b) => b.voteCount - a.voteCount);
  else if (filters.sort.includes("date")) filtered.sort((a, b) => b.releaseDate.localeCompare(a.releaseDate));
  else filtered.sort((a, b) => b.popularity - a.popularity);
  return filtered;
}

export function Workspace({ initialChart }: { initialChart: Chart }) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { preview, setPreview, favorites, favoritesReady } = useFrame();
  const paramString = searchParams.toString();
  const today = useTodayDate();
  const parsed = useMemo(() => {
    try {
      const params = new URLSearchParams(paramString);
      if (initialChart !== "trending") params.set("chart", initialChart);
      if (!params.has("media") && initialChart === "favorites") params.set("media", "all");
      return { filters: parseFilters(params), error: "" };
    } catch (error) {
      return { filters: { ...DEFAULT_FILTERS, chart: initialChart }, error: error instanceof Error ? error.message : "筛选链接无效" };
    }
  }, [paramString, initialChart, today]);
  const { filters } = parsed;
  const [layout, setLayout] = useState<"grid" | "list">("grid");
  const [response, setResponse] = useState<CatalogResponse | null>(null);
  const [responseKey, setResponseKey] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState("");
  const [moreError, setMoreError] = useState("");
  const [refresh, setRefresh] = useState(0);
  const [favoriteCount, setFavoriteCount] = useState(20);
  const requestGeneration = useRef(0);
  const favoriteMode = filters.chart === "favorites";
  const discoverMode = filters.chart === "discover";
  const searchMode = Boolean(filters.query.trim());
  const strictUpcoming = filters.chart === "upcoming" && filters.media === "movie" && !searchMode;
  const meta = chartMeta(filters.chart, filters.media, filters.period);
  const requestKey = `${preview}:${serializeFilters(filters)}:${filters.dateTo === "today" || strictUpcoming ? today : ""}`;

  const updateFilters = useCallback((next: CatalogFilters) => {
    const destination = next.chart === "discover" ? "/discover" : next.chart === "favorites" ? "/favorites" : "/";
    router.replace(`${destination}?${serializeFilters({ ...next, page: 1 })}`, { scroll: false });
  }, [router]);

  useEffect(() => {
    try { setLayout(localStorage.getItem("frame_layout_v2") === "list" ? "list" : "grid"); } catch { /* The default grid remains available. */ }
  }, []);

  useEffect(() => {
    const generation = ++requestGeneration.current;
    setError(""); setMoreError(""); setLoadingMore(false); setFavoriteCount(20);
    if (parsed.error) { setLoading(false); setError(parsed.error); setResponse(null); return; }
    if (favoriteMode) { setLoading(false); setResponse(null); return; }
    const controller = new AbortController();
    setLoading(true); setResponse(null);
    async function load() {
      try {
        const data = preview ? getDemoCatalog(filters) : await fetch(`/api/catalog?${serializeFilters(filters)}`, { signal: controller.signal }).then(async result => {
          const json = await result.json();
          if (!result.ok) throw new Error(json.error || "暂时无法获取影片");
          return json as CatalogResponse;
        });
        if (generation === requestGeneration.current) { setResponse(data); setResponseKey(requestKey); }
      } catch (error) {
        if (!controller.signal.aborted && generation === requestGeneration.current) setError(error instanceof Error ? error.message : "连接中断，请重试");
      } finally { if (generation === requestGeneration.current) setLoading(false); }
    }
    load();
    return () => controller.abort();
  }, [filters, parsed.error, preview, refresh, favoriteMode, requestKey]);

  const favoriteItems = useMemo(() => filterFavorites(favorites, filters), [favorites, filters]);
  const items = favoriteMode ? favoriteItems.slice(0, favoriteCount) : strictUpcoming && responseKey !== requestKey ? [] : response?.results || [];
  const title = searchMode ? `“${filters.query}” 的搜索结果` : meta.title;
  const showRank = !favoriteMode && !searchMode && !discoverMode;
  const shownTotal = favoriteMode ? favoriteItems.length : filters.media === "all" && response?.source === "tmdb" ? items.length : response?.totalResults || 0;
  const previewSchedule = response?.source === "demo" && (filters.chart === "now" || filters.chart === "upcoming");
  const featuredItems = useMemo(() => responseKey === requestKey ? selectFeaturedMedia(response?.results || []) : [], [response, responseKey, requestKey]);
  const showFeature = initialChart === "trending" && !searchMode && !parsed.error;
  const featuredLabel = filters.chart === "trending" ? filters.period === "day" ? "今日焦点" : "本周焦点" : `${meta.title}精选`;
  const genres = GENRES[filters.media === "tv" ? "tv" : "movie"];
  const changeMedia = (media: CatalogFilters["media"]) => updateFilters({ ...filters, media, genres: [], sort: filters.sort.includes("date") ? media === "tv" ? "first_air_date.desc" : "primary_release_date.desc" : filters.sort });
  const changeChart = (chart: Chart) => updateFilters({ ...DEFAULT_FILTERS, chart, period: filters.period, media: filters.media === "all" && chart !== "trending" ? "movie" : filters.media });
  const clearFilters = () => updateFilters({ ...DEFAULT_FILTERS, chart: filters.chart, media: filters.media, period: filters.period });
  const toggleLayout = () => {
    const next = layout === "grid" ? "list" : "grid";
    setLayout(next);
    try { localStorage.setItem("frame_layout_v2", next); } catch { /* This visit still uses the selected view. */ }
  };

  async function loadMore() {
    if (favoriteMode) { setFavoriteCount(previous => previous + 20); return; }
    if (!response || loadingMore) return;
    const generation = requestGeneration.current;
    setLoadingMore(true); setMoreError("");
    try {
      const nextFilters = { ...filters, page: response.page + 1 };
      const next = preview ? getDemoCatalog(nextFilters) : await fetch(`/api/catalog?${serializeFilters(nextFilters)}`).then(async result => {
        const data = await result.json();
        if (!result.ok) throw new Error(data.error || "更多影片加载失败");
        return data as CatalogResponse;
      });
      if (generation !== requestGeneration.current) return;
      setResponse(previous => previous ? { ...next, results: [...previous.results, ...next.results.filter(item => !previous.results.some(existing => mediaKey(existing) === mediaKey(item)))] } : next);
    } catch (error) {
      if (generation === requestGeneration.current) setMoreError(error instanceof Error ? error.message : "加载失败，请重试");
    } finally { if (generation === requestGeneration.current) setLoadingMore(false); }
  }

  const hasMore = favoriteMode ? favoriteItems.length > favoriteCount : response && response.page < response.totalPages;
  const chartTabs: { key: Chart; label: string }[] = [
    { key: "trending", label: "趋势" }, { key: "popular", label: "热门" }, { key: "top", label: "高分" },
    { key: "now", label: filters.media === "tv" ? "近期在播" : "正在上映" },
    { key: "upcoming", label: filters.media === "tv" ? "今日播出" : "即将上映" },
  ];

  return <div className={`workspace ${showFeature ? "workspace--featured" : ""}`}>
    {showFeature && featuredItems.length > 0 && <FeaturedFilm key={`${filters.chart}:${filters.media}:${filters.period}:${preview}`} items={featuredItems} label={featuredLabel}/>}
    {showFeature && !featuredItems.length && loading && <div className="skeleton featured-loading" aria-label="正在加载焦点影片"/>}
    <CatalogSection id="workspace-title" title={title}
      badge={preview && !favoriteMode && <span className="preview-label">预览影片</span>}
      actions={<>
          {!favoriteMode && !discoverMode && !searchMode && filters.chart === "trending" && <div className="period-tabs" role="group" aria-label="趋势时间">
            {(["day", "week"] as const).map(period => <button key={period} className={filters.period === period ? "selected" : ""} aria-pressed={filters.period === period} onClick={() => updateFilters({ ...filters, period })}>{period === "day" ? "今天" : "本周"}</button>)}
          </div>}
          {(discoverMode || favoriteMode) && <FilterPanel filters={filters} onApply={updateFilters}/>}
          <button className="icon-button view-toggle" onClick={toggleLayout} aria-label={layout === "grid" ? "切换列表视图" : "切换海报视图"}>{layout === "grid" ? <List size={18}/> : <Grid2X2 size={18}/>}</button>
      </>}
      charts={!favoriteMode && !discoverMode && !searchMode ? chartTabs.map(tab => ({ id: tab.key, label: tab.label, selected: filters.chart === tab.key, onSelect: () => changeChart(tab.key) })) : undefined}
      chartAction={<Link href={`/discover?media=${filters.media === "tv" ? "tv" : "movie"}`} className="catalog-more">全部影片<ArrowRight size={14}/></Link>}>
      {(favoriteMode || discoverMode || searchMode) && <div className="catalog-filters">
        <div className="media-tabs" role="group" aria-label="作品类型">
          {(discoverMode ? ["movie", "tv"] as const : ["all", "movie", "tv"] as const).map(media => <button key={media} className={filters.media === media ? "selected" : ""} aria-pressed={filters.media === media} onClick={() => changeMedia(media)}>{media === "all" ? "全部" : media === "movie" ? "电影" : "电视剧"}</button>)}
        </div>
        {discoverMode && !searchMode && <div className="quick-genres" role="group" aria-label={filters.media === "tv" ? "电视剧全部类型" : "电影全部类型"}><button className={`filter-chip ${!filters.genres.length ? "active" : ""}`} aria-pressed={!filters.genres.length} onClick={() => updateFilters({ ...filters, genres: [] })}>全部类型</button>{genres.map(genre => <button key={genre.id} className={`filter-chip ${filters.genres.includes(String(genre.id)) ? "active" : ""}`} aria-pressed={filters.genres.includes(String(genre.id))} onClick={() => updateFilters({ ...filters, genres: filters.genres.includes(String(genre.id)) ? filters.genres.filter(id => id !== String(genre.id)) : [...filters.genres, String(genre.id)] })}>{genre.name}</button>)}</div>}
      </div>}
      <AppliedFilters filters={filters} today={today} onChange={updateFilters} onClear={clearFilters}/>
      <div className="catalog-status">
        <span>{favoriteMode ? "收藏保存在当前浏览器" : loading ? "正在加载…" : error ? "加载失败" : response?.source === "demo" ? "示例片单，非实时榜单" : `${response?.stale ? "缓存数据 · " : ""}TMDB · ${formatTime(response?.retrievedAt || null)} 更新`}</span>
        {!loading && !error && <span>{formatCount(shownTotal)} {filters.media === "all" && response?.source === "tmdb" ? "部已加载" : "部"}</span>}
      </div>
      {loading || (favoriteMode && !favoritesReady) ? <MediaSkeletons/> : error ? <div className="empty-state" role="alert">
        <RefreshCw size={28}/><h3>{parsed.error ? "筛选条件无效" : "暂时无法加载影片"}</h3><p>{error}</p>
        <div className="empty-actions"><button className="primary-button" onClick={() => parsed.error ? clearFilters() : setRefresh(previous => previous + 1)}>{parsed.error ? "重置条件" : "重试"}</button>{!parsed.error && <button className="secondary-button" onClick={() => setPreview(true)}>查看预览影片</button>}</div>
      </div> : !items.length ? <div className="empty-state">
        {favoriteMode ? <Bookmark size={29}/> : <Search size={29}/>}
        <h3>{favoriteMode && !favorites.length ? "还没有收藏" : previewSchedule ? "连接真实数据后查看" : "没有找到影片"}</h3>
        <p>{favoriteMode && !favorites.length ? "遇到想看的电影或剧集，点击书签即可收藏。" : response?.notice || "试试其他片名，或减少筛选条件。"}</p>
        {favoriteMode && !favorites.length ? <Link href="/" className="primary-button">去选片<ArrowRight size={15}/></Link> : previewSchedule ? <button className="secondary-button" onClick={() => window.dispatchEvent(new Event("frame:source"))}>数据说明</button> : <button className="secondary-button" onClick={clearFilters}>清空条件</button>}
      </div> : <div className={`media-grid ${layout === "list" ? "list-layout" : ""}`}>{items.map((item, index) => <MediaCard key={mediaKey(item)} item={item} showRank={showRank} resultIndex={(favoriteMode ? 0 : (filters.page - 1) * 20) + index + 1}/>)}</div>}
      {moreError && <p className="load-error" role="alert">{moreError}</p>}
      {hasMore && !loading && !error && <div className="load-more-row"><button className="load-more" onClick={loadMore} disabled={loadingMore}>{loadingMore ? <LoaderCircle size={16} className="spinning"/> : <ChevronDown size={16}/>} {loadingMore ? "正在加载" : "加载更多"}</button></div>}
    </CatalogSection>
  </div>;
}

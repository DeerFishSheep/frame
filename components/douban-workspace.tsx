"use client";

import { useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { DOUBAN_OPTIONS, defaultDoubanFilters, doubanChart, doubanCharts, doubanParams, parseDoubanFilters, realtimeOptions, weeklyOptions, type DoubanFilters } from "@/lib/douban/query";
import type { CatalogResponse } from "@/lib/types";
import { useStableUpdate } from "@/lib/use-stable-update";
import { ProviderCatalog } from "./provider-catalog";

function Choice({ label, value, options, onChange }: { label: string; value: string; options: readonly { title: string; value: string }[]; onChange: (value: string) => void }) {
  return <label className="douban-choice"><span>{label}</span><select aria-label={label} value={value} onChange={event => onChange(event.target.value)}>{options.map(option => <option key={option.value} value={option.value}>{option.title}</option>)}</select></label>;
}

export function DoubanWorkspace() {
  const params = useSearchParams(), router = useRouter(), parameterString = params.toString();
  const prepare = useStableUpdate();
  const parsed = useMemo(() => {
    try { return { filters: parseDoubanFilters(new URLSearchParams(parameterString)), error: "" }; }
    catch (error) { return { filters: defaultDoubanFilters(params.get("media") === "tv" ? "tv" : "movie"), error: error instanceof Error ? error.message : "豆瓣榜单链接无效。" }; }
  }, [parameterString]);
  const filters = parsed.filters, { media, chart } = filters, meta = doubanChart(filters);
  const change = (values: Partial<DoubanFilters>) => {
    prepare(); router.replace(`/?${doubanParams({ ...filters, ...values, page: 1 })}`, { scroll: false });
  };
  const reset = () => change(defaultDoubanFilters(media, chart));
  const groups = DOUBAN_OPTIONS.genres[media], recommend = DOUBAN_OPTIONS.recommend[media];
  const sorts = chart === "popular" ? DOUBAN_OPTIONS.popular.sort : chart === "recommend" && filters.category === "全部" ? recommend.sort : [];
  const picker = <div className="douban-controls" data-scroll-anchor="douban-controls">
    {chart === "popular" && <Choice label="地区" value={filters.area} options={DOUBAN_OPTIONS.popular.area} onChange={area => change({ area })}/>}
    {chart === "realtime" && <Choice label="热榜分类" value={filters.collection} options={realtimeOptions(media)} onChange={collection => change({ collection })}/>}
    {chart === "weekly" && <Choice label="口碑榜单" value={filters.collection} options={weeklyOptions(media)} onChange={collection => change({ collection })}/>}
    {chart === "genres" && <>
      <Choice label={media === "movie" ? "电影类型" : "剧集分类"} value={filters.group} options={groups} onChange={group => change({ group, collection: groups.find(option => option.value === group)!.boards[0].value })}/>
      <Choice label="具体榜单" value={filters.collection} options={groups.find(group => group.value === filters.group)!.boards} onChange={collection => change({ collection })}/>
    </>}
    {chart === "recommend" && <>
      <Choice label="推荐分类" value={filters.category} options={recommend.category} onChange={category => change({ ...defaultDoubanFilters(media, "recommend"), category })}/>
      {filters.category !== "全部" && media === "movie" && <Choice label="地区" value={filters.area} options={DOUBAN_OPTIONS.recommend.movie.type} onChange={area => change({ area })}/>}
      {filters.category === "全部" && <details className="douban-advanced"><summary>更多筛选</summary><div className="douban-filter-fields">
        <Choice label="类型" value={filters.genre} options={recommend.genre} onChange={genre => change({ genre })}/>
        <Choice label="地区" value={filters.region} options={recommend.region} onChange={region => change({ region })}/>
        <Choice label="年代" value={filters.year} options={recommend.year} onChange={year => change({ year })}/>
        <Choice label="最低评分" value={filters.score} options={recommend.score} onChange={score => change({ score })}/>
        {media === "tv" && <Choice label="播出平台" value={filters.platform} options={DOUBAN_OPTIONS.recommend.tv.platform} onChange={platform => change({ platform })}/>}
        <button className="text-button" onClick={reset}>重置筛选</button>
      </div></details>}
    </>}
  </div>;
  return <ProviderCatalog source="douban" queryKey={doubanParams(filters).toString()} page={filters.page} title={meta.title} ranked={meta.ranked} originalUrl={meta.url}
    error={parsed.error} onReset={reset} loadPage={async (page, signal) => {
      const response = await fetch(`/api/douban?${doubanParams({ ...filters, page })}`, { signal });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "豆瓣暂时无法提供数据。");
      if (data.source !== "douban" || !Array.isArray(data.results) || data.page !== page) throw new Error("豆瓣分页数据无效，请重试。");
      return data as CatalogResponse;
    }}
    charts={doubanCharts(media).filter(option => option.value !== "lists").map(option => ({ id: option.value, label: option.title, selected: option.value === chart, onSelect: () => change(defaultDoubanFilters(media, option.value)) }))}
    sort={sorts.length ? sorts.map(option => <button key={option.value} className={`filter-chip ${filters.sort === option.value ? "active" : ""}`} aria-pressed={filters.sort === option.value} onClick={() => change({ sort: option.value })}>{option.title}</button>) : undefined}
    controls={!["top", "now"].includes(chart) ? picker : undefined}/>;
}

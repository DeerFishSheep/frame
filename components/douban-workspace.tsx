"use client";

import { useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { defaultDoubanFilters, doubanChart, visibleDoubanCharts, doubanParams, parseDoubanFilters, type DoubanFilters } from "@/lib/douban/query";
import { doubanFilterRows, selectDoubanFilter } from "@/lib/douban/filter-options";
import type { CatalogResponse } from "@/lib/types";
import { useStableUpdate } from "@/lib/use-stable-update";
import { ProviderCatalog } from "./provider-catalog";

export function DoubanWorkspace() {
  const params = useSearchParams(), router = useRouter(), parameterString = params.toString();
  const prepare = useStableUpdate();
  const parsed = useMemo(() => {
    try { return { filters: parseDoubanFilters(new URLSearchParams(parameterString)), error: "" }; }
    catch (error) { return { filters: defaultDoubanFilters(params.get("media") === "tv" ? "tv" : "movie"), error: error instanceof Error ? error.message : "豆瓣榜单链接无效。" }; }
  }, [parameterString]);
  const filters = parsed.filters, { media, chart } = filters, meta = doubanChart(filters);
  const change = (next: DoubanFilters) => {
    const query = doubanParams(next).toString();
    if (!parsed.error && query === doubanParams(filters).toString()) return;
    prepare(); router.replace(`/?${query}`, { scroll: false });
  };
  const reset = () => change(defaultDoubanFilters(media, chart));
  const rows = doubanFilterRows(filters);
  const changed = doubanParams(filters).toString() !== doubanParams(defaultDoubanFilters(media, chart)).toString();
  const picker = rows.length ? <div className="catalog-filters douban-controls" data-scroll-anchor="douban-controls">
    {rows.map(row => <div className="discover-filter-row" key={row.key}>
      <span className="discover-filter-label">{row.label}</span>
      <div className="quick-options" role="group" aria-label={`豆瓣${row.label}`}>
        {row.options.map(option => <button type="button" key={option.value}
          className={`filter-chip ${filters[row.key] === option.value ? "active" : ""}`}
          aria-pressed={filters[row.key] === option.value}
          onClick={() => change(selectDoubanFilter(filters, row.key, option.value))}>{option.title}</button>)}
      </div>
    </div>)}
    {changed && <button type="button" className="text-button" aria-label="重置豆瓣筛选" onClick={reset}>重置筛选</button>}
  </div> : undefined;
  return <ProviderCatalog source="douban" queryKey={doubanParams(filters).toString()} page={filters.page} title={meta.title} ranked={meta.ranked} originalUrl={meta.url}
    error={parsed.error} onReset={reset} loadPage={async (page, signal) => {
      const response = await fetch(`/api/douban?${doubanParams({ ...filters, page })}`, { signal });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "豆瓣暂时无法提供数据。");
      if (data.source !== "douban" || !Array.isArray(data.results) || data.page !== page) throw new Error("豆瓣分页数据无效，请重试。");
      return data as CatalogResponse;
    }}
    charts={visibleDoubanCharts(media).map(option => ({ id: option.value, label: option.title, selected: option.value === chart, onSelect: () => change(defaultDoubanFilters(media, option.value)) }))}
    controls={picker}/>;
}

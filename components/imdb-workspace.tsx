"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useMemo } from "react";
import type { CatalogResponse } from "@/lib/types";
import { IMDB_SORTS, imdbChart, imdbParams, parseImdbFilters, type ImdbFilters } from "@/lib/imdb/query";
import { ProviderCatalog } from "./provider-catalog";

export function ImdbWorkspace() {
  const params = useSearchParams(), router = useRouter(), parameterString = params.toString();
  const parsed = useMemo(() => {
    try { return { filters: parseImdbFilters(new URLSearchParams(parameterString)), error: "" }; }
    catch (error) { return { filters: { media: "movie", chart: "top", sort: "rank", page: 1 } as ImdbFilters, error: error instanceof Error ? error.message : "榜单链接无效。" }; }
  }, [parameterString]);
  const filters = parsed.filters, chart = imdbChart(filters);
  const change = (values: Partial<ImdbFilters>) => router.replace(`/?${imdbParams({ ...filters, ...values, page: 1 })}`, { scroll: false });
  return <ProviderCatalog source="imdb" queryKey={imdbParams(filters).toString()} page={filters.page} title={chart.label} ranked={filters.sort === "rank"} originalUrl={chart.url}
    error={parsed.error} onReset={() => change({ media: "movie", chart: "top", sort: "rank" })} loadPage={(page, signal) => fetchPage({ ...filters, page }, signal)}
    charts={(["popular", "top"] as const).map(value => ({ id: value, label: imdbChart({ ...filters, chart: value }).label, selected: filters.chart === value, onSelect: () => change({ chart: value }) }))}
    sort={IMDB_SORTS.map(option => <button key={option.value} className={`filter-chip ${filters.sort === option.value ? "active" : ""}`} aria-pressed={filters.sort === option.value} onClick={() => change({ sort: option.value })}>{option.label}</button>)}/>;
}

async function fetchPage(filters: ImdbFilters, signal: AbortSignal): Promise<CatalogResponse> {
  const response = await fetch(`/api/imdb?${imdbParams(filters)}`, { signal });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "暂时无法获取 IMDB 榜单。");
  if (data.source !== "imdb" || !Array.isArray(data.results) || data.page !== filters.page) throw new Error("IMDB 分页数据无效，请重试。");
  return data;
}

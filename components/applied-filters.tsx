"use client";

import { X } from "lucide-react";
import { DEFAULT_FILTERS, type CatalogFilters } from "@/lib/types";
import { GENRES, getRegionLabel, getSortLabel } from "@/lib/ui";
import { resolveDateTo } from "@/lib/date-filters";

type Filters = CatalogFilters & { keywords?: string };
type Chip = { id: string; label: string; action: string; reset: Partial<Filters> };

export function AppliedFilters({ filters, today, onChange, onClear }: {
  filters: Filters;
  today: string;
  onChange: (next: CatalogFilters) => void;
  onClear: () => void;
}) {
  const media = filters.media === "tv" ? "tv" : "movie";
  const chips: Chip[] = filters.genres.map(id => {
    const label = GENRES[media].find(genre => String(genre.id) === id)?.name || "类型";
    return { id: `genre:${id}`, label, action: `移除类型筛选：${label}`, reset: { genres: filters.genres.filter(other => other !== id) } };
  });
  if (filters.query) chips.push({ id: "query", label: `搜索：${filters.query}`, action: "移除搜索条件", reset: { query: "" } });
  if (filters.dateFrom || (filters.dateTo && filters.dateTo !== "today")) {
    chips.push({ id: "date", label: `${filters.dateFrom || "最早"} — ${resolveDateTo(filters.dateTo, today) || "不限"}`,
      action: "移除日期筛选，恢复默认日期范围", reset: { dateFrom: DEFAULT_FILTERS.dateFrom, dateTo: DEFAULT_FILTERS.dateTo } });
  }
  if (filters.scoreMin || filters.scoreMax) chips.push({ id: "score", label: `评分 ${filters.scoreMin || 0} — ${filters.scoreMax || 10}`,
    action: "移除评分范围筛选", reset: { scoreMin: "", scoreMax: "" } });
  if (filters.votesMin) chips.push({ id: "votes", label: `≥ ${filters.votesMin} 人评分`, action: "移除评分数量筛选", reset: { votesMin: "" } });
  if (filters.region) chips.push({ id: "region", label: getRegionLabel(filters.region), action: `移除地区筛选：${getRegionLabel(filters.region)}`, reset: { region: "" } });
  if (filters.language) chips.push({ id: "language", label: `语言 ${filters.language}`, action: "移除语言筛选", reset: { language: "" } });
  // Keep older saved filter objects compatible without adding a keyword picker.
  if (filters.keywords) chips.push({ id: "keywords", label: "主题筛选", action: "移除主题筛选", reset: { keywords: "" } });
  if (filters.runtimeMin || filters.runtimeMax) chips.push({ id: "runtime", label: `时长 ${filters.runtimeMin || 0} — ${filters.runtimeMax || "不限"} 分钟`,
    action: "移除时长筛选", reset: { runtimeMin: "", runtimeMax: "" } });
  if ((filters.chart === "favorites" || (filters.chart === "discover" && !filters.query)) && filters.sort !== DEFAULT_FILTERS.sort) {
    chips.push({ id: "sort", label: getSortLabel(filters.sort, media), action: "移除排序条件，恢复热度优先", reset: { sort: DEFAULT_FILTERS.sort } });
  }
  if (!chips.length) return null;

  return <div className="applied-filters" role="group" aria-label="已选筛选条件">
    {chips.map(chip => <button key={chip.id} type="button" aria-label={chip.action} title={chip.action}
      onClick={() => onChange({ ...filters, ...chip.reset, page: 1 })}>
      <span className="applied-filter-label">{chip.label}</span><X size={12} aria-hidden="true"/>
    </button>)}
    <button type="button" className="clear-all" onClick={onClear}>清空条件<X size={12} aria-hidden="true"/></button>
  </div>;
}

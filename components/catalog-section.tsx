"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { useScrollMemory } from "@/lib/view-state";
import { formatCatalogTitle } from "@/lib/catalog-sources";
import type { DataSource } from "@/lib/types";
import { SourcePicker, useCatalogSource } from "./source-picker";

export interface CatalogTab { id: string; label: string; selected: boolean; onSelect: () => void }
interface CatalogSectionProps {
  id: string;
  title: string;
  dataSource?: DataSource;
  badge?: ReactNode;
  actions?: ReactNode;
  charts?: CatalogTab[];
  chartLabel?: string;
  chartAction?: ReactNode;
  sort?: ReactNode;
  sortLabel?: string;
  children: ReactNode;
}

/** All providers share: heading → chart navigation → optional sorting → results. */
export function CatalogSection({ id, title, dataSource, badge, actions, charts, chartLabel = "榜单分类", chartAction, sort, sortLabel = "排序方式", children }: CatalogSectionProps) {
  const navigation = useCatalogSource();
  const hasSourcePicker = Boolean(navigation && charts?.length);
  const sentinel = useRef<HTMLDivElement>(null);
  const [stuck, setStuck] = useState(false);
  useEffect(() => {
    if (!hasSourcePicker || !sentinel.current) return;
    const observer = new IntersectionObserver(([entry]) => setStuck(!entry.isIntersecting && entry.boundingClientRect.top < 0));
    observer.observe(sentinel.current);
    return () => observer.disconnect();
  }, [hasSourcePicker]);
  const chartRow = useRef<HTMLDivElement>(null);
  const rememberCharts = useScrollMemory(`chart-tabs:${chartLabel}`, chartRow);
  return <section className="catalog" aria-labelledby={id}>
    {hasSourcePicker && <div ref={sentinel} className="catalog-sticky-sentinel" data-catalog-start aria-hidden="true"/>}
    <div className={`catalog-heading ${hasSourcePicker ? "catalog-heading--sticky" : ""} ${stuck ? "is-stuck" : ""}`} data-scroll-anchor="catalog-heading" data-sticky-heading={hasSourcePicker ? "" : undefined}>
      <div className="catalog-title"><h2 id={id}>{dataSource ? formatCatalogTitle(dataSource, title) : title}</h2>{badge}</div>
      <div className="catalog-actions">{hasSourcePicker && <SourcePicker/>}{actions}</div>
    </div>
    {charts && charts.length > 0 && <div className="chart-tabs" ref={rememberCharts} data-scroll-anchor="catalog-charts" role="group" aria-label={chartLabel}>
      {charts.map(tab => <button key={tab.id} className={tab.selected ? "selected" : ""} aria-pressed={tab.selected} onClick={tab.onSelect}>{tab.label}</button>)}
      {chartAction}
    </div>}
    {sort && <div className="catalog-sort-row" data-scroll-anchor="catalog-sort"><span>排序</span><div className="quick-options" role="group" aria-label={sortLabel}>{sort}</div></div>}
    {children}
  </section>;
}

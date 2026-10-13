import type { ReactNode } from "react";

interface CatalogTab { id: string; label: string; selected: boolean; onSelect: () => void }
interface CatalogSectionProps {
  id: string;
  title: ReactNode;
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
export function CatalogSection({ id, title, badge, actions, charts, chartLabel = "榜单分类", chartAction, sort, sortLabel = "排序方式", children }: CatalogSectionProps) {
  return <section className="catalog" aria-labelledby={id}>
    <div className="catalog-heading">
      <div className="catalog-title"><h2 id={id}>{title}</h2>{badge}</div>
      <div className="catalog-actions">{actions}</div>
    </div>
    {charts && charts.length > 0 && <div className="chart-tabs" role="group" aria-label={chartLabel}>
      {charts.map(tab => <button key={tab.id} className={tab.selected ? "selected" : ""} aria-pressed={tab.selected} onClick={tab.onSelect}>{tab.label}</button>)}
      {chartAction}
    </div>}
    {sort && <div className="catalog-sort-row"><span>排序</span><div className="quick-options" role="group" aria-label={sortLabel}>{sort}</div></div>}
    {children}
  </section>;
}

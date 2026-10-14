import { formatCatalogTitle } from "./catalog-sources";
import { mediaKey, type DataSource, type Media } from "./types";

export function formatFeaturedLabel(source: DataSource, title: string) {
  return formatCatalogTitle(source, title);
}

export const FEATURED_LIMIT = 10;
export const FEATURED_INDICATOR_LIMIT = 5;
export const FEATURED_INTERVAL_MS = 6000;

/** Fixed pages: films 1–5, then 6–10. Never shift the group within a page. */
export function featuredIndicatorPositions(count: number, index: number): number[] {
  const current = Math.max(0, Math.min(index, count - 1));
  const start = Math.floor(current / FEATURED_INDICATOR_LIMIT) * FEATURED_INDICATOR_LIMIT;
  const size = Math.min(FEATURED_INDICATOR_LIMIT, count - start);
  return Array.from({ length: size }, (_, offset) => start + offset);
}

export function featuredIndex(selection: { key: string; index: number }, items: Media[]) {
  const matching = items.findIndex(item => mediaKey(item) === selection.key);
  return matching >= 0 ? matching : Math.max(0, Math.min(selection.index, items.length - 1));
}

export function selectFeaturedMedia(items: Media[]): Media[] {
  const seen = new Set<string>();
  const selected: Media[] = [];
  for (const item of items) {
    const key = mediaKey(item);
    if (seen.has(key)) continue;
    seen.add(key);
    selected.push(item);
    if (selected.length === FEATURED_LIMIT) break;
  }
  return selected;
}

export function formatMediaDate(value: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return "日期待定";
  const parsed = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value ? value : "日期待定";
}

export function cardNumber(item: Media, showRank: boolean, resultIndex?: number) {
  if (showRank && item.source !== "demo" && Number.isInteger(item.rank) && item.rank! > 0) {
    return { kind: "rank" as const, value: item.rank!, text: `#${item.rank}`, label: `官方榜单第 ${item.rank} 名` };
  }
  if (Number.isInteger(resultIndex) && resultIndex! > 0) {
    return { kind: "result" as const, value: resultIndex!, text: `#${resultIndex}`, label: `当前结果序号 ${resultIndex}，非官方榜单名次` };
  }
  return null;
}

/** Append pages in provider order without losing movie/TV identity. */
export function mergeMediaPages(current: Media[], incoming: Media[]): Media[] {
  const seen = new Set<string>();
  return [...current, ...incoming].filter(item => {
    const key = mediaKey(item);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

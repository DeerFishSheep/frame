import { DOUBAN_OPTIONS, doubanListUrl } from "./douban/query";
import { parseFavorites } from "./favorites";
import type { Media } from "./types";

export interface CollectionRef { source: "douban"; id: string; title: string }
export interface CollectionSummary extends CollectionRef {
  kind: "user" | "official" | "theme";
  creator: string;
  count: number | null;
  unit: "部" | "项";
  preview: Media[];
  retrievedAt: string | null;
  stale: boolean;
}
export const COLLECTION_FAVORITES_KEY = "frame_collection_favorites_v1";
export const PRESET_COLLECTIONS: CollectionRef[] = DOUBAN_OPTIONS.lists.map(list => ({ source: "douban", id: list.value, title: list.title }));
export const collectionKey = (item: CollectionRef) => `${item.source}:${item.id}`;
export const collectionKind = (kind: CollectionSummary["kind"]) => kind === "official" ? "平台榜单" : kind === "user" ? "用户片单" : "主题片单";
export function collectionHref(item: Pick<CollectionRef, "source" | "id">) {
  doubanListUrl(item.id);
  return `/lists/${item.source}/${item.id.replace(":", "-")}`;
}
export function collectionId(source: string, slug: string) {
  if (source !== "douban") throw new Error("片单来源无效。");
  const id = slug.replace("-", ":"); doubanListUrl(id); return id;
}
export function collectionFallback(ref: CollectionRef): CollectionSummary {
  return { ...ref, kind: ref.id.startsWith("doulist:") ? "user" : "theme", creator: "", count: null, unit: "部", preview: [], retrievedAt: null, stale: false };
}
export function collectionDirectory(saved: CollectionSummary[]) {
  return [...new Map([...PRESET_COLLECTIONS, ...saved].map(item => [collectionKey(item), item])).values()];
}
export function parseSavedCollections(raw: string | null): CollectionSummary[] {
  if (!raw) return [];
  let values: unknown; try { values = JSON.parse(raw); } catch { return []; }
  if (!Array.isArray(values)) return [];
  const seen = new Set<string>();
  return values.flatMap(value => {
    if (!value || typeof value !== "object" || Array.isArray(value)) return [];
    const item = value as Record<string, unknown>;
    if (item.source !== "douban" || typeof item.id !== "string" || typeof item.title !== "string" || !item.title.trim() || item.title.length > 500) return [];
    try { doubanListUrl(item.id); } catch { return []; }
    if (!["user", "official", "theme"].includes(String(item.kind)) || typeof item.creator !== "string" || item.creator.length > 200 || (item.unit !== "部" && item.unit !== "项")) return [];
    if (item.count !== null && (!Number.isSafeInteger(item.count) || Number(item.count) < 0)) return [];
    const key = `${item.source}:${item.id}`; if (seen.has(key)) return []; seen.add(key);
    return [{ source: "douban" as const, id: item.id, title: item.title, kind: item.kind as CollectionSummary["kind"], creator: item.creator,
      count: item.count as number | null, unit: item.unit, preview: parseFavorites(JSON.stringify(item.preview)).slice(0, 3),
      retrievedAt: typeof item.retrievedAt === "string" ? item.retrievedAt : null, stale: item.stale === true }];
  });
}
export function readSavedCollections(storage: Pick<Storage, "getItem">) {
  try { return parseSavedCollections(storage.getItem(COLLECTION_FAVORITES_KEY)); } catch { return []; }
}
export function writeSavedCollections(storage: Pick<Storage, "setItem">, items: CollectionSummary[]) {
  storage.setItem(COLLECTION_FAVORITES_KEY, JSON.stringify(parseSavedCollections(JSON.stringify(items))));
}
export function toggleSavedCollection(items: CollectionSummary[], item: CollectionSummary) {
  const key = collectionKey(item);
  return items.some(saved => collectionKey(saved) === key) ? items.filter(saved => collectionKey(saved) !== key) : [...items, item];
}

import { CatalogEntry } from "@/components/catalog-entry";
import { redirect } from "next/navigation";
import { collectionHref } from "@/lib/collections";
import { DOUBAN_OPTIONS, defaultDoubanFilters, doubanParams, migrateDoubanPopularHref } from "@/lib/douban/query";

export default async function MoviePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  if (params.source === "douban" && params.chart === "popular") {
    const legacy = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) for (const part of Array.isArray(value) ? value : value === undefined ? [] : [value]) legacy.append(key, part);
    redirect(migrateDoubanPopularHref(`/?${legacy}`));
  }
  if (params.source === "douban" && params.chart === "realtime") redirect(`/?${doubanParams(defaultDoubanFilters(params.media === "tv" ? "tv" : "movie"))}`);
  if (params.source === "douban" && params.chart === "lists") {
    let target = "/lists";
    try { target = collectionHref({ source: "douban", id: typeof params.list === "string" ? params.list : DOUBAN_OPTIONS.lists[0].value }); } catch { /* Invalid legacy links return to the directory. */ }
    redirect(target);
  }
  return <CatalogEntry/>;
}

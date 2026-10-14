"use client";

import { useSearchParams } from "next/navigation";
import { ResourceCache } from "./resource-state";
import { useAsyncResource } from "./use-async-resource";
import { tmdbRating, type DetailRating, type RatingContext } from "./detail-rating";
import type { MediaDetail, MediaType } from "./types";

const cache = new ResourceCache(64);
export function useDetailRating(item: MediaDetail | undefined, media: MediaType, id: number) {
  const params = useSearchParams(), source = params.get("source");
  const context: RatingContext = { source: source === "douban" || source === "imdb" ? source : "tmdb" };
  const doubanId = params.get("doubanId");
  if (context.source === "douban" && doubanId && /^[1-9]\d{0,11}$/.test(doubanId)) context.doubanId = doubanId;
  const query = new URLSearchParams({ source: context.source, ...(context.doubanId ? { doubanId: context.doubanId } : {}) }).toString();
  const key = `rating:${media}:${id}:${query}`, external = context.source !== "tmdb" && item?.source !== "demo";
  const resource = useAsyncResource<DetailRating>({ key, group: key, cache, keepPrevious: false, enabled: !!item && external,
    load: async signal => {
      const response = await fetch(`/api/ratings/${media}/${id}?${query}`, { signal }), data = await response.json();
      if (!response.ok) throw new Error(data.error || "评分暂时无法加载。");
      return data as DetailRating;
    },
  });
  const fallback = tmdbRating(item || { voteAverage: 0, voteCount: 0 });
  const rating = external && resource.current && resource.data ? resource.data : external && resource.error ? { ...fallback, fallback: "unavailable" as const } : fallback;
  return { context, rating, pending: !!item && external && resource.pending, retry: resource.refresh };
}

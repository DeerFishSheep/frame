"use client";

import { RefreshCw } from "lucide-react";
import { getDemoCatalog } from "@/lib/demo";
import { selectFeaturedMedia } from "@/lib/media-presentation";
import { DEFAULT_FILTERS, type CatalogResponse, type Media, type MediaType } from "@/lib/types";
import { serializeFilters } from "@/lib/ui";
import { useAsyncResource } from "@/lib/use-async-resource";
import { FeaturedFilm } from "./featured-film";
import { ResourceRegion } from "./resource-feedback";
import { useFrame } from "./providers";

export function DiscoverFeatured({ media }: { media: MediaType }) {
  const { preview } = useFrame();
  const resource = useAsyncResource<{ items: Media[]; media: MediaType }>({
    key: `featured:${preview}:${media}`, group: "featured:discover",
    load: async signal => {
      const filters = { ...DEFAULT_FILTERS, chart: "discover" as const, media };
      const data: CatalogResponse = preview ? getDemoCatalog(filters) : await fetch(`/api/catalog?${serializeFilters(filters)}`, { signal }).then(async response => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "精选暂时无法加载");
        return data;
      });
      return { items: selectFeaturedMedia(data.results), media };
    },
  });
  return <ResourceRegion pending={resource.pending} error={resource.error} retained={Boolean(resource.data)} onRetry={resource.refresh}>
    {resource.data ? <FeaturedFilm items={resource.data.items} label={resource.data.media === "tv" ? "剧集精选" : "电影精选"} pending={resource.pending} stateKey="featured:discover"/>
      : resource.error ? <div className="featured-message" role="status"><span>{resource.error}</span><button className="text-button" onClick={resource.refresh}><RefreshCw size={14}/>重试</button></div>
      : <div className="skeleton featured-loading" aria-label="正在加载精选影片"/>}
  </ResourceRegion>;
}

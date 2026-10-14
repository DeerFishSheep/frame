"use client";

import { formatRegions } from "./media-regions";
import { ResourceCache } from "./resource-state";
import { useAsyncResource } from "./use-async-resource";
import { type Media } from "./types";

// Small metadata entries must not evict the catalog pages used for history restoration.
const regionMemory = globalThis as typeof globalThis & { __frameRegionsV1?: ResourceCache };
const cache = typeof window === "undefined" ? new ResourceCache(500)
  : regionMemory.__frameRegionsV1 ?? (regionMemory.__frameRegionsV1 = new ResourceCache(500));

export function useMediaRegions(item: Media) {
  const key = `regions:${item.mediaType}:${item.id}`;
  const resource = useAsyncResource<string[]>({
    key, group: key, cache, keepPrevious: false,
    enabled: item.countryCodes === undefined && item.source !== "demo" && typeof item.id === "number",
    load: async signal => {
      const response = await fetch(`/api/regions/${item.mediaType}/${item.id}`, { signal });
      if (!response.ok) throw new Error("地区资料暂不可用");
      const data = await response.json();
      if (!Array.isArray(data.countryCodes)) throw new Error("地区资料格式无效");
      return data.countryCodes;
    },
  });
  // A carousel may move to another title before its metadata request finishes.
  const countryCodes = item.countryCodes ?? (resource.dataKey === key ? resource.data ?? undefined : undefined);
  return { countryCodes, label: formatRegions(countryCodes) };
}

"use client";

import { ResourceCache } from "./resource-state";
import { useAsyncResource } from "./use-async-resource";
import { collectionHref, collectionKey, type CollectionRef, type CollectionSummary } from "./collections";

// Cover metadata must not evict the loaded movie pages used for history restoration.
const cache = new ResourceCache(64);
export function useCollection(ref: CollectionRef) {
  const key = `collection:${collectionKey(ref)}`;
  return useAsyncResource<CollectionSummary>({ key, group: key, cache,
    load: async signal => {
      const response = await fetch(`/api${collectionHref(ref)}`, { signal }), data = await response.json();
      if (!response.ok) throw new Error(data.error || "暂时无法读取片单。");
      if (data.id !== ref.id || data.source !== ref.source || !Array.isArray(data.preview)) throw new Error("片单资料不匹配，请重试。");
      return data;
    },
  });
}

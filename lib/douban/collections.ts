import type { CollectionSummary } from "../collections";
import { defaultDoubanFilters } from "./query";
import type { createDoubanClient } from "./client";
import { DoubanError } from "./client";

const object = (value: unknown): Record<string, unknown> => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
const text = (value: unknown, limit = 500) => typeof value === "string" ? value.trim().slice(0, limit) : "";

export function createCollectionService(client: Pick<ReturnType<typeof createDoubanClient>, "page" | "collection">) {
  async function summary(id: string): Promise<CollectionSummary> {
    const metadata = await client.collection(id);
    const raw = object(metadata.data);
    if (raw.is_private === true || raw.is_sys_private === true) throw new DoubanError("这个片单无法公开访问。", "COLLECTION_PRIVATE", 403);
    const page = await client.page({ ...defaultDoubanFilters("movie", "lists"), list: id });
    const title = text(raw.title || raw.name).replace(/imdb/gi, "IMDB");
    if (!title) throw new DoubanError("片单资料暂时无法读取。", "COLLECTION_INVALID_RESPONSE", 502);
    const creator = text(object(raw.owner || raw.user).name, 200);
    const count = page.totalExact ? page.total : Number.isSafeInteger(raw.items_count) && Number(raw.items_count) >= 0 ? Number(raw.items_count) : null;
    return { id, source: "douban", title, creator: creator || (raw.is_official === true ? "豆瓣" : ""),
      kind: raw.is_official === true || raw.type === "chart" ? "official" : id.startsWith("doulist:") || creator ? "user" : "theme",
      count, unit: ["movie", "tv"].includes(String(raw.category || raw.subject_type)) ? "部" : "项",
      preview: page.items.slice(0, 3), retrievedAt: [metadata.retrievedAt, page.retrievedAt].sort()[0], stale: metadata.stale || page.stale };
  }
  return { summary };
}

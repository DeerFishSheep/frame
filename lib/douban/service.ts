import type { CatalogResponse, Media } from "../types";
import type { createDoubanClient } from "./client";
import type { DoubanFilters } from "./query";
import { DOUBAN_PAGE_SIZE } from "./query";
import { enrichDoubanMedia } from "./normalize";

export function createDoubanService(client: Pick<ReturnType<typeof createDoubanClient>, "page">, find: (item: Media) => Promise<Media | null>) {
  async function catalog(filters: DoubanFilters): Promise<CatalogResponse> {
    const page = await client.page(filters), results: Media[] = new Array(page.items.length);
    let next = 0, unmatched = 0;
    await Promise.all(Array.from({ length: Math.min(4, page.items.length) }, async () => {
      while (next < page.items.length) {
        const index = next++, item = page.items[index];
        let match: Media | null = null;
        try { match = await find(item); } catch { /* Matching never removes the original Douban entry. */ }
        if (!match) unmatched++;
        results[index] = enrichDoubanMedia(item, match);
      }
    }));
    const notices = [page.stale ? "豆瓣暂时无法更新，正在显示上次成功获取的内容。" : "",
      unmatched ? "部分作品暂无本站详情，点击可在豆瓣查看。" : "",
      page.total > 500 * DOUBAN_PAGE_SIZE ? "当前最多浏览原榜或片单的前 10,000 项。" : "",
      page.omitted ? "仅展示原榜或片单中的影视作品，已略过其他条目及重复作品。" : ""].filter(Boolean);
    return { results, page: filters.page, totalPages: page.hasMore ? Math.min(500, page.totalExact ? Math.ceil(page.total / DOUBAN_PAGE_SIZE) : filters.page + 1) : filters.page,
      totalResults: page.total, totalResultsExact: page.totalExact, source: "douban", retrievedAt: page.retrievedAt, stale: page.stale,
      ...(notices.length ? { notice: notices.join(" ") } : {}) };
  }
  return { catalog };
}

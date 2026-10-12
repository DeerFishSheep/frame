import { buildCatalogRequest } from "../query";
import type { CatalogFilters, CatalogResponse, MediaDetail, MediaType } from "../types";
import { TmdbError, type createTmdbClient } from "./client";
import { normalizeDetail, normalizeMedia, object } from "./normalize";

type Client = ReturnType<typeof createTmdbClient>;
function integer(value: unknown, fallback: number) { return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : fallback; }

export function createTmdbService(client: Client) {
  async function catalog(filters: CatalogFilters): Promise<CatalogResponse> {
    const request = buildCatalogRequest(filters);
    const response = await client.request<unknown>(request.path, request.params);
    const raw = object(response.data);
    if (!Array.isArray(raw.results)) throw new TmdbError("TMDB 返回的榜单格式无效。", "TMDB_INVALID_RESPONSE", 502);
    const page = Math.max(1, integer(raw.page, filters.page));
    const results = raw.results.flatMap((value: unknown, index: number) => {
      const item = object(value);
      const mediaType = request.mediaType === "all" ? item.media_type : request.mediaType;
      if ((mediaType !== "movie" && mediaType !== "tv") || !Number.isSafeInteger(item.id) || Number(item.id) < 1) return [];
      // TMDB pages contain 20 positions. Preserve positions occupied by people in mixed trends.
      return [normalizeMedia(item, mediaType, request.ranked ? (page - 1) * 20 + index + 1 : undefined)];
    });
    return {
      results, page, totalPages: Math.min(500, integer(raw.total_pages, 1)),
      totalResults: integer(raw.total_results, results.length), retrievedAt: response.retrievedAt,
      source: "tmdb", stale: response.stale,
      ...(response.stale ? { notice: "TMDB 暂时无法更新，正在显示上次成功获取的数据。" } : {}),
    };
  }

  async function detail(mediaType: string, idText: string): Promise<{ detail: MediaDetail; retrievedAt: string; stale: boolean }> {
    if ((mediaType !== "movie" && mediaType !== "tv") || !/^[1-9]\d*$/.test(idText) || !Number.isSafeInteger(Number(idText))) {
      throw new TmdbError("作品类型或 ID 无效。", "INVALID_MEDIA_ID", 400);
    }
    const params = new URLSearchParams({
      language: "zh-CN", append_to_response: "credits,keywords,external_ids,images,recommendations",
      include_image_language: "zh,en,null",
    });
    const response = await client.request<unknown>(`/${mediaType}/${idText}`, params);
    const raw = object(response.data);
    if (raw.id !== Number(idText)) throw new TmdbError("TMDB 返回的作品格式无效。", "TMDB_INVALID_RESPONSE", 502);
    return { detail: normalizeDetail(raw, mediaType as MediaType), retrievedAt: response.retrievedAt, stale: response.stale };
  }

  async function keywords(query: string) {
    const normalized = query.trim();
    if (!normalized || normalized.length > 100) throw new TmdbError("关键词搜索需要 1 到 100 个字符。", "INVALID_QUERY", 400);
    const response = await client.request<unknown>("/search/keyword", new URLSearchParams({ query: normalized, page: "1" }));
    const raw = object(response.data);
    if (!Array.isArray(raw.results)) throw new TmdbError("TMDB 返回的关键词格式无效。", "TMDB_INVALID_RESPONSE", 502);
    return { results: raw.results.map(object).filter((item) => Number.isSafeInteger(item.id) && Number(item.id) > 0 && typeof item.name === "string")
      .map((item) => ({ id: item.id as number, name: item.name as string })), retrievedAt: response.retrievedAt, stale: response.stale };
  }

  return { catalog, detail, keywords };
}

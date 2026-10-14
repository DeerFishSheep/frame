import { buildCatalogRequest } from "../query";
import type { CatalogFilters, CatalogResponse, MediaDetail, MediaType } from "../types";
import { TmdbError, type createTmdbClient } from "./client";
import { mediaCountryCodes, normalizeDetail, normalizeMedia, normalizeRecommendations, object } from "./normalize";
import { exactMediaMatch, searchTitle } from "../media-match";

type Client = ReturnType<typeof createTmdbClient>;
function integer(value: unknown, fallback: number) { return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : fallback; }

function validateMedia(mediaType: string, idText: string): asserts mediaType is MediaType {
  if ((mediaType !== "movie" && mediaType !== "tv") || !/^[1-9]\d*$/.test(idText) || !Number.isSafeInteger(Number(idText))) {
    throw new TmdbError("作品类型或 ID 无效。", "INVALID_MEDIA_ID", 400);
  }
}

export function createTmdbService(client: Client) {
  // Region enrichment must never delay catalog results or open unbounded upstream requests.
  let regionActive = 0;
  const regionQueue: (() => void)[] = [];
  async function regions(mediaType: string, idText: string) {
    validateMedia(mediaType, idText);
    if (regionActive >= 4) await new Promise<void>(resolve => regionQueue.push(resolve));
    else regionActive++;
    try {
      const response = await client.request<unknown>(`/${mediaType}/${idText}`, new URLSearchParams({ language: "zh-CN" }));
      if (object(response.data).id !== Number(idText)) throw new TmdbError("TMDB 返回的地区资料无效。", "TMDB_INVALID_RESPONSE", 502);
      return { countryCodes: mediaCountryCodes(response.data), retrievedAt: response.retrievedAt, stale: response.stale };
    } finally {
      const next = regionQueue.shift();
      if (next) next(); else regionActive--;
    }
  }

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
    validateMedia(mediaType, idText);
    const params = new URLSearchParams({
      language: "zh-CN", append_to_response: "credits,keywords,external_ids,images,recommendations",
      include_image_language: "zh,en,null",
    });
    const response = await client.request<unknown>(`/${mediaType}/${idText}`, params);
    const raw = object(response.data);
    if (raw.id !== Number(idText)) throw new TmdbError("TMDB 返回的作品格式无效。", "TMDB_INVALID_RESPONSE", 502);
    return { detail: normalizeDetail(raw, mediaType as MediaType), retrievedAt: response.retrievedAt, stale: response.stale };
  }

  async function recommendations(mediaType: string, idText: string, pageText = "1"): Promise<CatalogResponse> {
    validateMedia(mediaType, idText);
    if (!/^[1-9]\d*$/.test(pageText) || Number(pageText) > 500) {
      throw new TmdbError("推荐页码必须为 1 到 500 的整数。", "INVALID_PAGE", 400);
    }
    const response = await client.request<unknown>(`/${mediaType}/${idText}/recommendations`, new URLSearchParams({ language: "zh-CN", page: pageText }));
    const raw = object(response.data);
    if (!Array.isArray(raw.results) || raw.page !== Number(pageText) || integer(raw.total_pages, -1) < 0 || integer(raw.total_results, -1) < 0) {
      throw new TmdbError("TMDB 返回的推荐分页无效。", "TMDB_INVALID_RESPONSE", 502);
    }
    return { ...normalizeRecommendations(raw, mediaType), retrievedAt: response.retrievedAt, source: "tmdb", stale: response.stale };
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

  async function findByImdbId(imdbId: string, mediaType: MediaType) {
    if (!/^tt\d{5,12}$/.test(imdbId) || (mediaType !== "movie" && mediaType !== "tv")) throw new TmdbError("IMDB 编号或作品类型无效。", "INVALID_IMDB_ID", 400);
    const response = await client.request<unknown>(`/find/${imdbId}`, new URLSearchParams({ external_source: "imdb_id", language: "zh-CN" }));
    const raw = object(response.data), candidates = raw[mediaType === "movie" ? "movie_results" : "tv_results"];
    if (!Array.isArray(candidates)) throw new TmdbError("TMDB 返回的编号匹配数据无效。", "TMDB_INVALID_RESPONSE", 502);
    const match = candidates.map(object).find(item => Number.isSafeInteger(item.id) && Number(item.id) > 0);
    return match ? normalizeMedia(match, mediaType) : null;
  }

  async function findByTitle(title: string, year: string, mediaType: MediaType) {
    return exactMediaMatch(await searchCandidates(title, year, mediaType), title, year, mediaType);
  }
  async function searchCandidates(title: string, year: string, mediaType: MediaType) {
    if (!title.trim() || title.length > 200 || !/^\d{4}$/.test(year)) return [];
    const response = await client.request<unknown>(`/search/${mediaType}`, new URLSearchParams({ query: searchTitle(title, mediaType), language: "zh-CN", include_adult: "false", [mediaType === "movie" ? "year" : "first_air_date_year"]: year }));
    const results = object(response.data).results;
    if (!Array.isArray(results)) return [];
    return results.map(raw => normalizeMedia(raw, mediaType)).filter(item => Number.isSafeInteger(item.id) && Number(item.id) > 0);
  }
  return { catalog, detail, recommendations, keywords, findByImdbId, findByTitle, searchCandidates, regions };
}

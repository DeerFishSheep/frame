import { normalizeDoubanItem } from "./douban/normalize";
import { readDoubanIdentity } from "./douban/identity";
import { validSeasonNumber, type Media, type MediaDetail, type DisplayDetail, type MediaType } from "./types";
import type { RatingContext } from "./detail-rating";
import { TmdbError } from "./tmdb/client";

type DetailResult = { detail: DisplayDetail; retrievedAt: string; stale: boolean };

/** Resolve old Douban season URLs as well as explicit season links before loading detail data. */
export function createMediaDetailService(dependencies: {
  detail: (media: string, id: string, seasonNumber?: number) => Promise<{ detail: MediaDetail; retrievedAt: string; stale: boolean }>;
  subject: (media: MediaType, id: string) => Promise<{ data: unknown; retrievedAt: string; stale: boolean }>;
  match: (item: Media) => Promise<Media | null>;
  fallback?: (media: MediaType, id: string) => Promise<DetailResult>;
}) {
  return async (media: string, id: string, context: RatingContext): Promise<DetailResult> => {
    if (!["movie", "tv"].includes(media) || !/^[1-9]\d*$/.test(id) || !Number.isSafeInteger(Number(id))) {
      throw new TmdbError("作品类型或 ID 无效。", "INVALID_MEDIA_ID", 400);
    }
    let seasonNumber = context.seasonNumber;
    if (seasonNumber !== undefined && (media !== "tv" || !validSeasonNumber(seasonNumber))) {
      throw new TmdbError("季数参数无效。", "INVALID_SEASON", 400);
    }
    let verifiedSource: Media | null = null;
    let sourceSeasonNumber: number | undefined;
    let sourceStale = false;
    if (media === "tv" && context.source === "douban" && context.doubanId) {
      const response = await dependencies.subject("tv", context.doubanId);
      const source = normalizeDoubanItem(response.data, "tv");
      if (!source || source.doubanId !== context.doubanId || source.mediaType !== "tv") {
        throw new TmdbError("剧集来源资料不一致，请返回榜单重新打开。", "INVALID_DETAIL_SOURCE", 502);
      }
      const identity = readDoubanIdentity(source, response.data);
      const sourceSeason = identity.seasonNumber;
      if (identity.ambiguousSeason) {
        if (dependencies.fallback) return dependencies.fallback("tv", context.doubanId);
        throw new TmdbError("暂不支持这个季数，请返回原榜查看。", "INVALID_SEASON", 400);
      }
      if (sourceSeason !== undefined || seasonNumber !== undefined) {
        let matched: Media | null;
        try { matched = await dependencies.match(source); }
        catch (error) {
          if (dependencies.fallback) return dependencies.fallback("tv", context.doubanId);
          throw error;
        }
        if (sourceSeason === undefined || matched?.id !== Number(id) || matched.mediaType !== "tv"
          || (matched.sourceSeasonNumber ?? matched.seasonNumber) !== sourceSeason || !validSeasonNumber(matched.seasonNumber)) {
          if (dependencies.fallback) return dependencies.fallback("tv", context.doubanId);
          throw new TmdbError("暂时无法确认这部剧的对应季，请重试。", "SEASON_MATCH_UNAVAILABLE", 502);
        }
        if (seasonNumber !== undefined && seasonNumber !== matched.seasonNumber && seasonNumber !== sourceSeason) {
          throw new TmdbError("链接季数与来源条目不一致。", "SEASON_MISMATCH", 400);
        }
        seasonNumber = matched.seasonNumber;
        sourceSeasonNumber = sourceSeason;
        verifiedSource = source;
        sourceStale = response.stale;
      }
    }
    let result;
    try { result = await dependencies.detail(media, id, seasonNumber); }
    catch (error) {
      if (verifiedSource?.doubanId && dependencies.fallback) return dependencies.fallback(verifiedSource.mediaType, verifiedSource.doubanId);
      throw error;
    }
    if (seasonNumber !== undefined && (result.detail.id !== Number(id) || result.detail.mediaType !== "tv" || result.detail.seasonNumber !== seasonNumber)) {
      throw new TmdbError("返回的剧集季资料不一致。", "INVALID_SEASON_DETAIL", 502);
    }
    if (!verifiedSource) return result;
    if (result.detail.year && verifiedSource.year && result.detail.year !== verifiedSource.year) {
      throw new TmdbError("本季首播年份与来源资料不一致。", "INVALID_SEASON_DETAIL", 502);
    }
    // These source fields belong to the verified season; never borrow the whole-series synopsis/poster.
    return { ...result, stale: result.stale || sourceStale, detail: {
      ...result.detail, title: verifiedSource.title, originalTitle: verifiedSource.originalTitle || result.detail.originalTitle,
      doubanId: verifiedSource.doubanId, ...(sourceSeasonNumber ? { sourceSeasonNumber } : {}),
      overview: result.detail.overview || verifiedSource.overview,
      posterPath: result.detail.posterPath || verifiedSource.posterPath,
      ...(verifiedSource.posterFallbacks?.length ? { posterFallbacks: verifiedSource.posterFallbacks } : {}),
    } };
  };
}

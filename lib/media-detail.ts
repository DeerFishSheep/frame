import { normalizeDoubanItem } from "./douban/normalize";
import { seasonSourceDates, sourceSeasonNumber } from "./douban/matcher";
import { searchTitle, tvSeasonNumber } from "./media-match";
import { validSeasonNumber, type Media, type MediaDetail, type MediaType } from "./types";
import type { RatingContext } from "./detail-rating";
import { TmdbError } from "./tmdb/client";

type DetailResult = { detail: MediaDetail; retrievedAt: string; stale: boolean };

/** Resolve old Douban season URLs as well as explicit season links before loading detail data. */
export function createMediaDetailService(dependencies: {
  detail: (media: string, id: string, seasonNumber?: number) => Promise<DetailResult>;
  subject: (media: MediaType, id: string) => Promise<{ data: unknown; retrievedAt: string; stale: boolean }>;
  match: (item: Media) => Promise<Media | null>;
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
    let sourceStale = false;
    if (media === "tv" && context.source === "douban" && context.doubanId) {
      const response = await dependencies.subject("tv", context.doubanId);
      const source = normalizeDoubanItem(response.data, "tv");
      if (!source || source.doubanId !== context.doubanId || source.mediaType !== "tv") {
        throw new TmdbError("剧集来源资料不一致，请返回榜单重新打开。", "INVALID_DETAIL_SOURCE", 502);
      }
      // The source season may live in the title, the original title or an alias; bare numbers only count when every hint agrees.
      const raw = response.data && typeof response.data === "object" && !Array.isArray(response.data) ? response.data as Record<string, unknown> : {};
      // A title that carries a season marker we cannot accept must never fall through to whole-series data.
      if (tvSeasonNumber(source.title) === null && searchTitle(source.title, "tv") !== source.title.normalize("NFKC").replace(/\p{Cf}/gu, "").trim()) {
        throw new TmdbError("暂不支持这个季数，请返回原榜查看。", "INVALID_SEASON", 400);
      }
      const sourceSeason = sourceSeasonNumber(source, raw);
      if (sourceSeason !== null || seasonNumber !== undefined) {
        const matched = await dependencies.match(source);
        const matchedSeason = matched && matched.mediaType === "tv" && matched.id === Number(id) && validSeasonNumber(matched.seasonNumber) ? matched.seasonNumber : null;
        // A provider may number a standalone sequel as a later season while TMDB keeps it as season 1 of its own series;
        // that is only accepted when the source release date confirms the first season, and TMDB's season number is what loads.
        const standaloneSequel = matchedSeason === 1 && sourceSeason !== null && sourceSeason >= 2
          && !!matched!.releaseDate && seasonSourceDates(raw).has(matched!.releaseDate);
        if (matchedSeason === null || (sourceSeason !== null && matchedSeason !== sourceSeason && !standaloneSequel)) {
          throw new TmdbError("暂时无法确认这部剧的对应季，请重试。", "SEASON_MATCH_UNAVAILABLE", 502);
        }
        if (seasonNumber !== undefined && seasonNumber !== matchedSeason) {
          throw new TmdbError("链接季数与来源条目不一致。", "SEASON_MISMATCH", 400);
        }
        seasonNumber = matchedSeason;
        verifiedSource = source;
        sourceStale = response.stale;
      }
    }
    const result = await dependencies.detail(media, id, seasonNumber);
    if (seasonNumber !== undefined && (result.detail.id !== Number(id) || result.detail.mediaType !== "tv" || result.detail.seasonNumber !== seasonNumber)) {
      throw new TmdbError("返回的剧集季资料不一致。", "INVALID_SEASON_DETAIL", 502);
    }
    if (!verifiedSource) return result;
    if (result.detail.year && verifiedSource.year && result.detail.year !== verifiedSource.year) {
      throw new TmdbError("本季首播年份与来源资料不一致。", "INVALID_SEASON_DETAIL", 502);
    }
    // These source fields belong to the verified season; never borrow the whole-series synopsis/poster.
    return { ...result, stale: result.stale || sourceStale, detail: {
      ...result.detail, title: verifiedSource.title, doubanId: verifiedSource.doubanId,
      overview: result.detail.overview || verifiedSource.overview,
      posterPath: result.detail.posterPath || verifiedSource.posterPath,
      ...(verifiedSource.posterFallbacks?.length ? { posterFallbacks: verifiedSource.posterFallbacks } : {}),
    } };
  };
}

import "server-only";
import { createDoubanClient } from "./client";
import { createDoubanService } from "./service";
import { tmdb, tmdbClient } from "../tmdb/server";
import { createDoubanMatcher } from "./matcher";
import { crossTypeAttempted, resolveCrossType } from "./cross-type";
import { createCollectionService } from "./collections";
import { createTmdbSeasonMatcher } from "../tmdb/season-match";
import { object } from "../tmdb/normalize";
import type { Media } from "../types";

export const doubanClient = createDoubanClient();
const matchWithinMedium = createDoubanMatcher({ search: tmdb.searchCandidates, subject: doubanClient.subject, detail: tmdb.detail, ...createTmdbSeasonMatcher(tmdbClient) });

/**
 * Douban files TV movies, specials and single-episode documentaries as tv while TMDB holds them as movie, so the
 * in-medium matcher can never see them. A tv item that stays unmatched is retried across media, but only when its
 * own-medium search really returned nothing and only when exactly one candidate survives every identity check.
 *
 * The matcher already reaches the same fallback from its own empty-candidate exit, and the season path returns
 * before that exit, so this layer stays as the fallback for every path the matcher cannot cover. When the matcher
 * did run the fallback, crossTypeAttempted reports it and this layer returns the same negative answer without
 * replaying the search, the subject or the candidates.
 */
export const matchDoubanMedia = async (item: Media): Promise<Media | null> => {
  const match = await matchWithinMedium(item);
  if (match || item.mediaType !== "tv" || !item.doubanId || crossTypeAttempted(item)) return match;
  try {
    const [subject, ownMedium] = await Promise.all([
      doubanClient.subject("tv", item.doubanId),
      tmdb.searchCandidates(item.title, item.year, "tv"),
    ]);
    return await resolveCrossType(item, object(subject.data), [ownMedium], { search: tmdb.searchCandidates, detail: tmdb.detail });
  } catch {
    // The item is already unmatched; a failed cross-type retry must not turn it into an error or a guess.
    return null;
  }
};
export const douban = createDoubanService(doubanClient, matchDoubanMedia);
export const doubanCollections = createCollectionService(doubanClient);

import { detailWithSeason } from "@/lib/media-detail-server";
import { imdbClient } from "@/lib/imdb/server";
import { doubanClient, matchDoubanMedia } from "@/lib/douban/server";
import { createDetailRatingService } from "@/lib/detail-rating-service";
import { parseRatingContext } from "@/lib/detail-rating";
import { apiError, dataHeaders } from "@/lib/tmdb/http";

export const runtime = "nodejs";
const rating = createDetailRatingService({ detail: detailWithSeason, imdb: imdbClient.rating, subject: doubanClient.subject, match: matchDoubanMedia });
export async function GET(request: Request, { params }: { params: Promise<{ mediaType: string; id: string }> }) {
  let context;
  try { context = parseRatingContext(new URL(request.url).searchParams); }
  catch { return Response.json({ error: "评分来源参数无效。" }, { status: 400, headers: { "Cache-Control": "no-store" } }); }
  try {
    const { mediaType, id } = await params, result = await rating(mediaType, id, context);
    return Response.json(result, { headers: result.fallback ? { "Cache-Control": "no-store" } : dataHeaders(result.retrievedAt, result.stale) });
  } catch (error) { return apiError(error); }
}

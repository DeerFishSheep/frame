import { apiError, dataHeaders } from "@/lib/tmdb/http";
import { mediaDetail } from "@/lib/media-detail-server";
import { parseRatingContext } from "@/lib/detail-rating";

export const runtime = "nodejs";

export async function GET(request: Request, context: { params: Promise<{ mediaType: string; id: string }> }) {
  let detailContext;
  try { detailContext = parseRatingContext(new URL(request.url).searchParams); }
  catch { return Response.json({ error: "详情来源或季数参数无效。" }, { status: 400, headers: { "Cache-Control": "no-store" } }); }
  try {
    const { mediaType, id } = await context.params;
    const result = await mediaDetail(mediaType, id, detailContext);
    return Response.json(result.detail, { headers: dataHeaders(result.retrievedAt, result.stale) });
  } catch (error) { return apiError(error); }
}

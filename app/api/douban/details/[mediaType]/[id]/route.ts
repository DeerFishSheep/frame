import { doubanDetail } from "@/lib/douban/detail-server";
import { DoubanError } from "@/lib/douban/client";
import { apiError, dataHeaders } from "@/lib/tmdb/http";

export const runtime = "nodejs";
export async function GET(_request: Request, context: { params: Promise<{ mediaType: string; id: string }> }) {
  try {
    const { mediaType, id } = await context.params;
    const result = await doubanDetail(mediaType, id);
    return Response.json(result.detail, { headers: dataHeaders(result.retrievedAt, result.stale) });
  } catch (error) {
    if (error instanceof DoubanError) return Response.json({ error: error.message, code: error.code }, { status: error.status, headers: { "Cache-Control": "no-store" } });
    return apiError(error);
  }
}

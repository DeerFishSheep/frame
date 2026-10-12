import { TmdbError } from "@/lib/tmdb/client";
import { apiError, dataHeaders } from "@/lib/tmdb/http";
import { tmdb } from "@/lib/tmdb/server";

export const runtime = "nodejs";

export async function GET(request: Request, context: { params: Promise<{ mediaType: string; id: string }> }) {
  try {
    const { mediaType, id } = await context.params;
    const params = new URL(request.url).searchParams;
    if ([...params.keys()].some(key => key !== "page") || params.getAll("page").length > 1) {
      throw new TmdbError("推荐分页只接受一个 page 参数。", "INVALID_QUERY", 400);
    }
    const result = await tmdb.recommendations(mediaType, id, params.get("page") ?? "1");
    return Response.json(result, { headers: dataHeaders(result.retrievedAt, result.stale) });
  } catch (error) { return apiError(error); }
}

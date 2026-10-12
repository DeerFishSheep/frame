import { TmdbError } from "@/lib/tmdb/client";
import { apiError, dataHeaders } from "@/lib/tmdb/http";
import { tmdb } from "@/lib/tmdb/server";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const params = new URL(request.url).searchParams;
    if (params.getAll("query").length > 1) throw new TmdbError("搜索参数不能重复。", "INVALID_QUERY", 400);
    const result = await tmdb.keywords(params.get("query") ?? "");
    return Response.json({ results: result.results }, { headers: dataHeaders(result.retrievedAt, result.stale) });
  } catch (error) { return apiError(error); }
}

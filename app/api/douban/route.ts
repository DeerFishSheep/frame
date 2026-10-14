import { parseDoubanFilters } from "@/lib/douban/query";
import { DoubanError } from "@/lib/douban/client";
import { douban } from "@/lib/douban/server";
import { apiError, dataHeaders } from "@/lib/tmdb/http";

export const runtime = "nodejs";
export async function GET(request: Request) {
  try {
    const result = await douban.catalog(parseDoubanFilters(new URL(request.url).searchParams));
    return Response.json(result, { headers: dataHeaders(result.retrievedAt, result.stale) });
  } catch (error) {
    if (error instanceof DoubanError) return Response.json({ error: error.message, code: error.code }, { status: error.status, headers: { "Cache-Control": "no-store" } });
    return apiError(error);
  }
}

import { parseFilters } from "@/lib/query";
import { apiError, dataHeaders } from "@/lib/tmdb/http";
import { tmdb } from "@/lib/tmdb/server";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const result = await tmdb.catalog(parseFilters(new URL(request.url).searchParams));
    return Response.json(result, { headers: dataHeaders(result.retrievedAt, result.stale) });
  } catch (error) { return apiError(error); }
}

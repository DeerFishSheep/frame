import { parseImdbFilters } from "@/lib/imdb/query";
import { ImdbError } from "@/lib/imdb/client";
import { imdb } from "@/lib/imdb/server";
import { apiError, dataHeaders } from "@/lib/tmdb/http";

export const runtime = "nodejs";
export async function GET(request: Request) {
  try {
    const result = await imdb.catalog(parseImdbFilters(new URL(request.url).searchParams));
    return Response.json(result, { headers: dataHeaders(result.retrievedAt, result.stale) });
  } catch (error) {
    if (error instanceof ImdbError) return Response.json({ error: error.message, code: error.code }, { status: error.status, headers: { "Cache-Control": "no-store" } });
    return apiError(error);
  }
}

import { apiError, dataHeaders } from "@/lib/tmdb/http";
import { tmdb } from "@/lib/tmdb/server";

export const runtime = "nodejs";

export async function GET(_request: Request, context: { params: Promise<{ mediaType: string; id: string }> }) {
  try {
    const { mediaType, id } = await context.params;
    const result = await tmdb.detail(mediaType, id);
    return Response.json(result.detail, { headers: dataHeaders(result.retrievedAt, result.stale) });
  } catch (error) { return apiError(error); }
}

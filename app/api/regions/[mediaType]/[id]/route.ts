import { apiError, dataHeaders } from "@/lib/tmdb/http";
import { tmdb } from "@/lib/tmdb/server";

export const runtime = "nodejs";

export async function GET(_request: Request, context: { params: Promise<{ mediaType: string; id: string }> }) {
  try {
    const { mediaType, id } = await context.params;
    const result = await tmdb.regions(mediaType, id);
    return Response.json({ countryCodes: result.countryCodes }, { headers: {
      ...dataHeaders(result.retrievedAt, result.stale),
      "Cache-Control": result.stale ? "private, max-age=60" : "private, max-age=1800",
    } });
  } catch (error) { return apiError(error); }
}

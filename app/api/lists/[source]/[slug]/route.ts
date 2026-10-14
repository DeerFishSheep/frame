import { collectionId } from "@/lib/collections";
import { doubanCollections } from "@/lib/douban/server";
import { DoubanError } from "@/lib/douban/client";
import { apiError, dataHeaders } from "@/lib/tmdb/http";

export const runtime = "nodejs";
export async function GET(_request: Request, { params }: { params: Promise<{ source: string; slug: string }> }) {
  const { source, slug } = await params;
  let id: string;
  try { id = collectionId(source, slug); } catch { return Response.json({ error: "片单链接无效。" }, { status: 400 }); }
  try {
    const summary = await doubanCollections.summary(id);
    return Response.json(summary, { headers: dataHeaders(summary.retrievedAt, summary.stale) });
  } catch (error) {
    if (error instanceof DoubanError) return Response.json({ error: error.message }, { status: error.status, headers: { "Cache-Control": "no-store" } });
    return apiError(error);
  }
}

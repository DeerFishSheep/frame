import { createDoubanImageLoader, ImageError } from "@/lib/douban/images";

export const runtime = "nodejs";
const loadImage = createDoubanImageLoader();
export async function GET(request: Request) {
  try {
    const params = new URL(request.url).searchParams;
    if (params.getAll("url").length !== 1 || [...params.keys()].some(key => key !== "url")) throw new ImageError(400);
    const result = await loadImage(params.get("url")!);
    return new Response(result.bytes as BodyInit, { headers: { "Content-Type": result.type, "Cache-Control": "public, max-age=3600", "X-Content-Type-Options": "nosniff" } });
  } catch (error) {
    return Response.json({ error: "图片暂时无法加载。" }, { status: error instanceof ImageError ? error.status : 502, headers: { "Cache-Control": "no-store" } });
  }
}

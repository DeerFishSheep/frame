import { PansouError, readBoundedJson, validateResourceSearch } from "@/lib/pansou/client";
import { pansou } from "@/lib/pansou/server";
export const runtime = "nodejs";
const headers = { "Cache-Control": "no-store" };
export async function POST(request: Request) {
  try {
    if (!request.headers.get("content-type")?.toLowerCase().includes("application/json")) return Response.json({ error: "请发送 JSON 格式的搜索条件。", code: "INVALID_QUERY" }, { status: 400, headers });
    let body: unknown;
    try { body = await readBoundedJson(new Response(request.body, { headers: request.headers }), 8192); }
    catch (error) {
      if (request.signal.aborted) throw error;
      throw new PansouError("搜索条件格式不正确或内容过长。", 400, "INVALID_QUERY");
    }
    const result = await pansou.search(validateResourceSearch(body), request.signal);
    return Response.json(result, { headers });
  } catch (error) {
    if (request.signal.aborted) return Response.json({ error: "搜索已取消。", code: "CANCELLED" }, { status: 499, headers });
    if (error instanceof PansouError) return Response.json({ error: error.message, code: error.code }, { status: error.status, headers });
    return Response.json({ error: "资源搜索暂不可用，请重试。", code: "INTERNAL_ERROR" }, { status: 500, headers });
  }
}

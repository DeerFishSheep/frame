import { QueryError } from "../query";
import { TmdbError } from "./client";

export function apiError(error: unknown) {
  if (error instanceof QueryError || error instanceof TmdbError) {
    return Response.json({ error: error.message, code: error.code }, { status: error.status, headers: { "Cache-Control": "no-store" } });
  }
  return Response.json({ error: "数据服务暂时不可用，请重试。", code: "INTERNAL_ERROR" }, { status: 500, headers: { "Cache-Control": "no-store" } });
}

export function dataHeaders(retrievedAt: string | null, stale: boolean) {
  return {
    "Cache-Control": "private, no-store",
    ...(retrievedAt ? { "X-Data-Retrieved-At": retrievedAt } : {}),
    "X-Data-Stale": String(stale),
  };
}

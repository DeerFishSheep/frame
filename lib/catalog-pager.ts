import { mergeMediaPages } from "./media-presentation";
import type { CatalogResponse, MediaPage } from "./types";

/** One next-page request at a time; cancellation also rejects late responses. */
export class CatalogPager<T extends MediaPage = CatalogResponse> {
  private active: AbortController | null = null;
  private completedPage = 0;

  get busy() { return this.active !== null; }

  canLoadNext(current: T) {
    return !this.active && current.page < current.totalPages && current.page >= this.completedPage;
  }

  cancel() {
    this.active?.abort();
    this.active = null;
    this.completedPage = 0;
  }

  async loadNext(current: T, fetchPage: (page: number, signal: AbortSignal) => Promise<T>): Promise<T | null> {
    if (!this.canLoadNext(current)) return null;
    const controller = new AbortController();
    this.active = controller;
    try {
      const next = await fetchPage(current.page + 1, controller.signal);
      if (controller.signal.aborted || this.active !== controller) return null;
      if (next.page !== current.page + 1) throw new Error("返回的页码不正确，请重试。");
      this.completedPage = next.page;
      return { ...next, results: mergeMediaPages(current.results, next.results) };
    } catch (error) {
      if (controller.signal.aborted || this.active !== controller) return null;
      throw error;
    } finally {
      if (this.active === controller) this.active = null;
    }
  }
}

/** Revalidate the loaded range atomically instead of replacing it with just its first page. */
export async function refreshMediaPages<T extends MediaPage>(page: number, previous: T | null, fetchPage: (page: number, signal: AbortSignal) => Promise<T>, signal: AbortSignal): Promise<T> {
  let combined = await fetchPage(page, signal);
  if (combined.page !== page) throw new Error("返回的页码不正确，请重试。");
  const last = Math.min(previous?.page ?? page, combined.totalPages);
  for (let number = page + 1; number <= last; number++) {
    const next = await fetchPage(number, signal);
    if (signal.aborted) throw new Error("请求已取消");
    if (next.page !== number) throw new Error("返回的页码不正确，请重试。");
    combined = { ...next, results: mergeMediaPages(combined.results, next.results) };
  }
  return combined;
}

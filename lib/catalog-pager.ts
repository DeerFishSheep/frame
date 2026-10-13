import { mergeMediaPages } from "./media-presentation";
import type { CatalogResponse } from "./types";

/** One next-page request at a time; cancellation also rejects late responses. */
export class CatalogPager {
  private active: AbortController | null = null;
  private completedPage = 0;

  get busy() { return this.active !== null; }

  canLoadNext(current: CatalogResponse) {
    return !this.active && current.page < current.totalPages && current.page >= this.completedPage;
  }

  cancel() {
    this.active?.abort();
    this.active = null;
    this.completedPage = 0;
  }

  async loadNext(current: CatalogResponse, fetchPage: (page: number, signal: AbortSignal) => Promise<CatalogResponse>): Promise<CatalogResponse | null> {
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

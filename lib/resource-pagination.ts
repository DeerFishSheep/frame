/** Five visible rows: two cards per row on desktop, one on mobile. */
export function resourcePageSize(mobile: boolean): 5 | 10 { return mobile ? 5 : 10; }

const positiveInteger = (value: number, fallback = 1) => Number.isFinite(value) ? Math.max(1, Math.floor(value)) : fallback;

/** Keep the previously visible first item inside the new page after a responsive layout change. */
export function resourcePageForSize(page: number, fromSize: number, toSize: number) {
  return Math.floor((positiveInteger(page) - 1) * positiveInteger(fromSize) / positiveInteger(toSize)) + 1;
}

/** Paginate one already-returned snapshot; this never implies an upstream page request. */
export function resourcePagination(total: number, requestedPage: number, requestedSize: number) {
  const count = Number.isFinite(total) ? Math.max(0, Math.floor(total)) : 0;
  const pageSize = positiveInteger(requestedSize, 10);
  const totalPages = Math.max(1, Math.ceil(count / pageSize));
  const page = Math.min(positiveInteger(requestedPage), totalPages);
  const start = (page - 1) * pageSize;
  const first = Math.max(1, Math.min(page - 2, totalPages - 4));
  const pages = Array.from({ length: Math.min(5, totalPages) }, (_, index) => first + index);
  return { page, pageSize, totalPages, start, end: Math.min(count, start + pageSize), pages };
}

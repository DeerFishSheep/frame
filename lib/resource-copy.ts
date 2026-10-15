import type { ResourceItem } from "./pansou/types";

/** Copy the original URL verbatim, including any query, fragment, encoding or embedded extraction code. */
export function resourceCopyText(item: Pick<ResourceItem, "url">) { return item.url; }

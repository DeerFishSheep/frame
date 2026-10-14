"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useLayoutEffect, useRef } from "react";
import { readViewState, saveViewState } from "@/lib/view-state";
import { alignCatalogStart } from "@/lib/catalog-scroll";
import { catalogSource, catalogSourceHref, type CatalogSourceId } from "@/lib/catalog-sources";
import { CatalogSourceContext } from "./source-picker";
import { Workspace } from "./workspace";
import { ImdbWorkspace } from "./imdb-workspace";
import { DoubanWorkspace } from "./douban-workspace";

/** Source navigation stays shared; each adapter only supplies its own chart vocabulary. */
export function CatalogEntry() {
  const params = useSearchParams(), router = useRouter();
  const media = params.get("media") === "tv" ? "tv" : "movie";
  const current = `/?${params}`, source = catalogSource(new URLSearchParams(params));
  const root = useRef<HTMLDivElement>(null), selectedSource = useRef<CatalogSourceId | null>(null);
  useEffect(() => {
    if (!params.get("query")) saveViewState(`catalog-location:${media}:${source}`, current);
  }, [current, media, source, params]);
  useLayoutEffect(() => {
    if (selectedSource.current !== source || !root.current) return;
    selectedSource.current = null;
    const stopAlignment = alignCatalogStart(root.current);
    const frame = requestAnimationFrame(() => root.current?.querySelector<HTMLButtonElement>("[data-source-trigger]")?.focus({ preventScroll: true }));
    return () => { cancelAnimationFrame(frame); stopAlignment(); };
  }, [current, source]);
  function select(next: CatalogSourceId) {
    if (next === source) return;
    selectedSource.current = next;
    window.dispatchEvent(new Event("frame:catalog-source-change"));
    router.push(catalogSourceHref(next, new URLSearchParams(params), key => readViewState<string | undefined>(key, undefined)), { scroll: false });
  }
  return <CatalogSourceContext.Provider value={params.get("query") ? null : { source, onSelect: select }}>
    <div ref={root} className="catalog-entry">{source === "imdb" ? <ImdbWorkspace/> : source === "douban" ? <DoubanWorkspace/> : <Workspace initialChart="trending"/>}</div>
  </CatalogSourceContext.Provider>;
}

"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useLayoutEffect, useRef } from "react";
import { readViewState, saveViewState } from "@/lib/view-state";
import { alignCatalogStart } from "@/lib/catalog-scroll";
import { catalogDataSource, catalogSourceHref, type CatalogSourceId } from "@/lib/catalog-sources";
import { catalogReturnHref, rememberCatalogLocation } from "@/lib/catalog-navigation";
import { clearedNameSearchHref, normalizeNameSearchHref } from "@/lib/navigation";
import { CatalogSourceContext } from "./source-picker";
import { Workspace } from "./workspace";
import { ImdbWorkspace } from "./imdb-workspace";
import { DoubanWorkspace } from "./douban-workspace";

/** Source navigation stays shared; each adapter only supplies its own chart vocabulary. */
export function CatalogEntry() {
  const params = useSearchParams(), router = useRouter();
  const current = `/?${params}`, source = catalogDataSource(new URLSearchParams(params));
  const searching = Boolean(params.get("query")?.trim());
  const normalizedSearch = normalizeNameSearchHref(new URLSearchParams(params));
  const clearedCombinedSearch = !searching && params.get("media") === "all";
  const root = useRef<HTMLDivElement>(null), selectedSource = useRef<CatalogSourceId | null>(null);
  const previousParams = useRef(params.toString()), historyDestination = useRef<string | null>(null);
  const pendingReturn = useRef<{ from: string; to: string } | null>(null);
  const clearedSearch = pendingReturn.current?.from === current ? pendingReturn.current.to : historyDestination.current === current ? null
    : clearedNameSearchHref(new URLSearchParams(previousParams.current), new URLSearchParams(params), key => readViewState<string | undefined>(key, undefined));
  useLayoutEffect(() => {
    const pop = () => { historyDestination.current = `/?${new URLSearchParams(window.location.search)}`; };
    window.addEventListener("popstate", pop, true);
    return () => window.removeEventListener("popstate", pop, true);
  }, []);
  useEffect(() => {
    if (!clearedSearch) rememberCatalogLocation("/", new URLSearchParams(params), saveViewState);
  }, [current, params, clearedSearch]);
  useLayoutEffect(() => {
    const href = normalizedSearch || clearedSearch || (clearedCombinedSearch ? catalogReturnHref("/", new URLSearchParams(params), key => readViewState<string | undefined>(key, undefined)) : null);
    pendingReturn.current = clearedSearch && clearedSearch !== current ? { from: current, to: clearedSearch } : null;
    previousParams.current = params.toString(); historyDestination.current = null;
    if (href && href !== current) router.replace(href, { scroll: false });
  }, [current, normalizedSearch, clearedSearch, clearedCombinedSearch, params, router]);
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
  return <CatalogSourceContext.Provider value={searching || clearedCombinedSearch || clearedSearch ? null : { source, onSelect: select }}>
    <div ref={root} className="catalog-entry">{normalizedSearch || clearedCombinedSearch || clearedSearch ? <div className="workspace" aria-busy="true" aria-label="正在打开影视内容"/> : source === "imdb" ? <ImdbWorkspace/> : source === "douban" ? <DoubanWorkspace/> : <Workspace initialChart="trending"/>}</div>
  </CatalogSourceContext.Provider>;
}

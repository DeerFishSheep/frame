"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useLayoutEffect, useRef } from "react";
import { readViewState, saveViewState } from "@/lib/view-state";
import { useStableUpdate } from "@/lib/use-stable-update";
import { catalogSource, catalogSourceHref, type CatalogSourceId } from "@/lib/catalog-sources";
import { CatalogSourceContext } from "./source-picker";
import { Workspace } from "./workspace";
import { ImdbWorkspace } from "./imdb-workspace";

/** Source navigation stays shared; each adapter only supplies its own chart vocabulary. */
export function CatalogEntry() {
  const params = useSearchParams(), router = useRouter();
  const media = params.get("media") === "tv" ? "tv" : "movie";
  const current = `/?${params}`, source = catalogSource(new URLSearchParams(params));
  const prepareUpdate = useStableUpdate(), restoreFocus = useRef(false);
  useEffect(() => {
    if (!params.get("query")) saveViewState(`catalog-location:${media}:${source}`, current);
  }, [current, media, source, params]);
  useLayoutEffect(() => {
    if (!restoreFocus.current) return;
    restoreFocus.current = false;
    const frame = requestAnimationFrame(() => document.querySelector<HTMLButtonElement>("[data-source-trigger]")?.focus({ preventScroll: true }));
    return () => cancelAnimationFrame(frame);
  }, [source]);
  function select(next: CatalogSourceId) {
    prepareUpdate(); restoreFocus.current = true;
    router.push(catalogSourceHref(next, new URLSearchParams(params), key => readViewState<string | undefined>(key, undefined)), { scroll: false });
  }
  return <CatalogSourceContext.Provider value={params.get("query") ? null : { source, onSelect: select }}>
    <div className="catalog-entry">{source === "imdb" ? <ImdbWorkspace/> : <Workspace initialChart="trending"/>}</div>
  </CatalogSourceContext.Provider>;
}

"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect } from "react";
import { readViewState, saveViewState } from "@/lib/view-state";
import { Workspace } from "./workspace";
import { ImdbWorkspace } from "./imdb-workspace";

/** Keep provider selection outside either provider's independent filter vocabulary. */
export function CatalogEntry() {
  const params = useSearchParams(), imdb = params.get("source") === "imdb";
  const media = params.get("media") === "tv" ? "tv" : "movie";
  const chart = params.get("chart") === "popular" ? "popular" : "top";
  const current = `/?${params}`, source = imdb ? "imdb" : "tmdb";
  useEffect(() => {
    if (!params.get("query")) saveViewState(`catalog-location:${media}:${source}`, current);
  }, [current, media, source, params]);
  const tmdbHref = !imdb ? current : readViewState(`catalog-location:${media}:tmdb`, `/?media=${media}&chart=${chart}`);
  const imdbHref = imdb ? current : readViewState(`catalog-location:${media}:imdb`, `/?source=imdb&media=${media}&chart=${chart}&sort=rank`);
  return <div className="catalog-entry">
    {!params.get("query") && <nav className="catalog-sources" aria-label="榜单来源">
      <span>榜单来源</span>
      <Link scroll={false} href={tmdbHref} className={!imdb ? "selected" : ""} aria-current={!imdb ? "page" : undefined}>TMDB</Link>
      <Link scroll={false} href={imdbHref} className={imdb ? "selected" : ""} aria-current={imdb ? "page" : undefined}>IMDB</Link>
    </nav>}
    {imdb ? <ImdbWorkspace/> : <Workspace initialChart="trending"/>}
  </div>;
}

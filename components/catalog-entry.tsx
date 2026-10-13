"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Workspace } from "./workspace";
import { ImdbWorkspace } from "./imdb-workspace";

/** Keep provider selection outside either provider's independent filter vocabulary. */
export function CatalogEntry() {
  const params = useSearchParams(), imdb = params.get("source") === "imdb";
  const media = params.get("media") === "tv" ? "tv" : "movie";
  const chart = params.get("chart") === "popular" ? "popular" : "top";
  return <div className="catalog-entry">
    {!params.get("query") && <nav className="catalog-sources" aria-label="榜单来源">
      <span>榜单来源</span>
      <Link href={`/?media=${media}${imdb ? `&chart=${chart}` : ""}`} className={!imdb ? "selected" : ""} aria-current={!imdb ? "page" : undefined}>TMDB</Link>
      <Link href={`/?source=imdb&media=${media}&chart=${chart}&sort=rank`} className={imdb ? "selected" : ""} aria-current={imdb ? "page" : undefined}>IMDB</Link>
    </nav>}
    {imdb ? <ImdbWorkspace/> : <Workspace initialChart="trending"/>}
  </div>;
}

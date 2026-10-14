"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useFrame } from "./providers";
import { Workspace } from "./workspace";
import { CollectionDirectory } from "./collection-library";

export function FavoritesWorkspace() {
  const params = useSearchParams(), lists = params.get("section") === "lists";
  const { favorites, collections } = useFrame();
  return <>
    <nav className="saved-section-tabs" aria-label="收藏分类">
      <Link href="/favorites" scroll={false} className={!lists ? "selected" : ""} aria-current={!lists ? "page" : undefined}>影片<span>{favorites.length}</span></Link>
      <Link href="/favorites?section=lists" scroll={false} className={lists ? "selected" : ""} aria-current={lists ? "page" : undefined}>片单<span>{collections.length}</span></Link>
    </nav>
    {lists ? <CollectionDirectory savedOnly/> : <Workspace initialChart="favorites"/>}
  </>;
}

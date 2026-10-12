"use client";

import Link from "next/link";
import { ArrowRight, Bookmark } from "lucide-react";
import type { Media } from "@/lib/types";
import { MediaImage } from "./media-card";
import { useFrame } from "./providers";

export function FeaturedFilm({ item, period }: { item: Media; period: "day" | "week" }) {
  const { isFavorite, toggle } = useFrame();
  const saved = isFavorite(item);
  return <section className="featured-film" aria-labelledby="featured-title">
    <div className="featured-image"><MediaImage item={item} backdrop/></div>
    <div className="featured-shade"/>
    <div className="featured-copy">
      <span className="featured-label">{item.source === "demo" ? "精选预览" : period === "day" ? "今日焦点" : "本周焦点"}</span>
      <h1 id="featured-title">{item.title}</h1>
      <div className="featured-meta"><span>{item.mediaType === "tv" ? "电视剧" : "电影"}</span><span>{item.year || "年份待定"}</span><span>{item.genres.slice(0, 3).join(" / ")}</span></div>
      <p>{item.overview || "点击查看作品资料。"}</p>
      <div className="featured-actions">
        <Link className="primary-button" href={`/${item.mediaType}/${item.id}`}>查看详情<ArrowRight size={16}/></Link>
        <button className="featured-save" onClick={() => toggle(item)} aria-pressed={saved}><Bookmark size={17} fill={saved ? "currentColor" : "none"}/>{saved ? "已收藏" : "收藏"}</button>
      </div>
    </div>
  </section>;
}

"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowUpRight, Bookmark, Film, Star } from "lucide-react";
import { imageUrl, type Media } from "@/lib/types";
import { formatCount } from "@/lib/ui";
import { useFrame } from "./providers";

export function MediaImage({ item, backdrop = false, className = "" }: { item: Media; backdrop?: boolean; className?: string }) {
  const [failedPath, setFailedPath] = useState<string | null>(null);
  const src = imageUrl(backdrop ? item.backdropPath : item.posterPath, backdrop ? "w1280" : "w500");
  return src && src !== failedPath
    ? <img className={className} src={src} alt={backdrop ? "" : `${item.title}海报`} loading={backdrop ? "eager" : "lazy"} decoding="async" onError={() => setFailedPath(src)}/>
    : <div className={`image-placeholder ${className}`}><Film size={32} strokeWidth={.9}/><span>{item.title}</span><small>暂无{backdrop ? "剧照" : "海报"}</small></div>;
}

export function MediaCard({ item, showRank = true }: { item: Media; showRank?: boolean }) {
  const { isFavorite, toggle } = useFrame();
  const saved = isFavorite(item);
  return <article className="media-card">
    <div className="poster-wrap">
      <Link href={`/${item.mediaType}/${item.id}`} className="poster-link" aria-label={`查看${item.title}详情`}>
        <MediaImage item={item}/><span className="poster-shade"/>
        {showRank && item.source === "tmdb" && item.rank !== undefined && <span className={`rank-badge ${item.rank <= 3 ? "rank-top" : ""}`}>#{item.rank}</span>}
        <span className="poster-open"><ArrowUpRight size={20}/><span>查看详情</span></span>
        {item.source === "tmdb" && item.voteAverage > 0 && <span className="score-badge" aria-label={`TMDB 评分 ${item.voteAverage.toFixed(1)}`}><small>TMDB</small><Star size={11} fill="currentColor"/>{item.voteAverage.toFixed(1)}</span>}
      </Link>
    </div>
    <div className="media-card-copy">
      <div className="card-title-line"><Link href={`/${item.mediaType}/${item.id}`} className="card-title" title={item.title}>{item.title}</Link><button className={`card-save ${saved ? "saved" : ""}`} onClick={() => toggle(item)} aria-label={`${saved ? "取消收藏" : "收藏"}${item.title}`} aria-pressed={saved}><Bookmark size={16} fill={saved ? "currentColor" : "none"}/></button></div>
      <p className="card-original" title={item.originalTitle}>{item.originalTitle || "原名未提供"}</p>
      <div className="card-meta"><span>{item.year || "待定"}<i>·</i>{item.genres[0] || "未分类"}</span><span className="media-type">{item.mediaType === "movie" ? "电影" : "剧集"}</span></div>
      {item.source === "tmdb" && item.voteCount > 0 && <p className="card-votes">{formatCount(item.voteCount)} 人评分</p>}
      <div className="list-extra"><p>{item.overview || "暂无剧情简介。"}</p>{item.source === "tmdb" && <span>TMDB · {item.voteAverage > 0 ? `${item.voteAverage.toFixed(1)} 分 · ${formatCount(item.voteCount)} 人评分` : "暂无评分"}</span>}</div>
    </div>
  </article>;
}

export function MediaSkeletons() {
  return <div className="media-grid" aria-label="正在加载作品" aria-busy="true">{Array.from({ length: 12 }, (_, i) => <div className="skeleton-card" key={i}><div className="skeleton skeleton-poster"/><div className="skeleton skeleton-line"/><div className="skeleton skeleton-line short"/></div>)}</div>;
}

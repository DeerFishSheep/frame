"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowUpRight, Bookmark, Film, Star } from "lucide-react";
import { imageUrl, mediaHref, mediaKey, type Media } from "@/lib/types";
import { formatCount } from "@/lib/ui";
import { cardNumber, formatMediaDate } from "@/lib/media-presentation";
import { useFrame } from "./providers";

export function MediaImage({ item, backdrop = false, className = "" }: { item: Media; backdrop?: boolean; className?: string }) {
  const [failedPath, setFailedPath] = useState<string | null>(null);
  const src = imageUrl(backdrop ? item.backdropPath : item.posterPath, backdrop ? "w1280" : "w500");
  return src && src !== failedPath
    ? <img className={className} src={src} alt={backdrop ? "" : `${item.title}海报`} loading={backdrop ? "eager" : "lazy"} decoding="async" onError={() => setFailedPath(src)}/>
    : <div className={`image-placeholder ${className}`}><Film size={32} strokeWidth={.9}/><span>{item.title}</span><small>暂无{backdrop ? "剧照" : "海报"}</small></div>;
}

export function MediaCard({ item, showRank = true, resultIndex }: { item: Media; showRank?: boolean; resultIndex?: number }) {
  const { isFavorite, toggle } = useFrame();
  const saved = isFavorite(item);
  const number = cardNumber(item, showRank, resultIndex);
  const date = formatMediaDate(item.releaseDate);
  const genres = [...new Set(item.genres)];
  const href = mediaHref(item), external = typeof item.id === "string";
  const ratingLabel = item.source === "imdb" ? "IMDB" : "TMDB";
  return <article className="media-card" data-scroll-anchor={`media:${mediaKey(item)}`}>
    <div className="poster-wrap" data-skeleton="block">
      <Link href={href} target={external ? "_blank" : undefined} rel={external ? "noopener noreferrer" : undefined} className="poster-link" aria-label={external ? `在 IMDB 查看${item.title}` : `查看${item.title}详情`}>
        <MediaImage item={item}/><span className="poster-shade"/>
        {number && <span className={`rank-badge ${number.value <= 3 ? "rank-top" : ""}`} title={number.label} aria-label={number.label}>{number.text}</span>}
        <span className="poster-kind">{item.mediaType === "movie" ? "电影" : "剧集"}</span>
        <span className="poster-open"><ArrowUpRight size={20}/><span>查看详情</span></span>
        <div className="poster-info">
          <div className="poster-genres" aria-label="全部类型">{genres.length ? genres.map(genre => <span key={genre}>{genre}</span>) : <span>类型待补充</span>}</div>
          <div className="poster-footer">
            <time className="poster-date" dateTime={date === "日期待定" ? undefined : item.releaseDate} title={`${item.mediaType === "movie" ? "上映" : "首播"}日期：${date}`}>{date}</time>
            {item.source !== "demo" && item.voteAverage > 0 && <span className="score-badge" aria-label={`${ratingLabel} 评分 ${item.voteAverage.toFixed(1)}`}><small>{ratingLabel}</small><Star size={11} fill="currentColor"/>{item.voteAverage.toFixed(1)}</span>}
          </div>
        </div>
      </Link>
    </div>
    <div className="media-card-copy">
      <div className="card-title-line" data-skeleton="line"><Link href={href} target={external ? "_blank" : undefined} rel={external ? "noopener noreferrer" : undefined} className="card-title" title={item.title}>{item.title}</Link><button className={`card-save ${saved ? "saved" : ""}`} onClick={() => toggle(item)} aria-label={`${saved ? "取消收藏" : "收藏"}${item.title}`} aria-pressed={saved}><Bookmark size={16} fill={saved ? "currentColor" : "none"}/></button></div>
      <p className="card-original" data-skeleton="line" title={item.originalTitle}>{item.originalTitle || "原名未提供"}</p>
      {item.source !== "demo" && item.voteCount > 0 && <p className="card-votes" data-skeleton="line">{formatCount(item.voteCount)} 人评分</p>}
      <div className="list-extra" data-skeleton="text"><p>{item.overview || "暂无剧情简介。"}</p>{item.source !== "demo" && <span>{ratingLabel} · {item.voteAverage > 0 ? `${item.voteAverage.toFixed(1)} 分 · ${formatCount(item.voteCount)} 人评分` : "暂无评分"}</span>}</div>
    </div>
  </article>;
}

export function MediaSkeletons() {
  return <div className="media-grid" aria-label="正在加载作品" aria-busy="true">{Array.from({ length: 12 }, (_, i) => <div className="skeleton-card" key={i}><div className="skeleton skeleton-poster"/><div className="skeleton skeleton-line"/><div className="skeleton skeleton-line short"/></div>)}</div>;
}

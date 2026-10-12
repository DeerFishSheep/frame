"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { ArrowRight, Bookmark, ChevronLeft, ChevronRight, Pause, Play } from "lucide-react";
import { imageUrl, mediaKey, type Media } from "@/lib/types";
import { FEATURED_INTERVAL_MS, formatMediaDate, selectFeaturedMedia } from "@/lib/media-presentation";
import { MediaImage } from "./media-card";
import { useFrame } from "./providers";

export function FeaturedFilm({ items, label }: { items: Media[]; label: string }) {
  const slides = selectFeaturedMedia(items);
  if (!slides.length) return null;
  return <FeaturedCarousel key={slides.map(mediaKey).join("|")} items={slides} label={label}/>;
}

function FeaturedCarousel({ items, label }: { items: Media[]; label: string }) {
  const { isFavorite, toggle } = useFrame();
  const [index, setIndex] = useState(0);
  const [playback, setPlayback] = useState<"auto" | "playing" | "paused">("auto");
  const [hovered, setHovered] = useState(false);
  const [visible, setVisible] = useState(true);
  const [reducedMotion, setReducedMotion] = useState(true);
  const touchStart = useRef<{ x: number; y: number } | null>(null);
  const item = items[index];
  const saved = isFavorite(item);
  const wantsPlaying = playback === "playing" || (playback === "auto" && !reducedMotion);
  const running = wantsPlaying && visible && !hovered && items.length > 1;
  const nextItem = items[(index + 1) % items.length];
  const nextImage = imageUrl(nextItem.backdropPath || nextItem.posterPath, nextItem.backdropPath ? "w1280" : "w500");

  useEffect(() => {
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const updateMotion = () => setReducedMotion(motion.matches);
    const updateVisibility = () => setVisible(!document.hidden);
    updateMotion(); updateVisibility();
    motion.addEventListener("change", updateMotion);
    document.addEventListener("visibilitychange", updateVisibility);
    return () => {
      motion.removeEventListener("change", updateMotion);
      document.removeEventListener("visibilitychange", updateVisibility);
    };
  }, []);

  useEffect(() => {
    if (!visible || !nextImage || items.length < 2) return;
    const preload = new window.Image();
    preload.src = nextImage;
  }, [nextImage, visible, items.length]);

  useEffect(() => {
    if (!running) return;
    const timer = window.setTimeout(() => setIndex(current => (current + 1) % items.length), FEATURED_INTERVAL_MS);
    return () => window.clearTimeout(timer);
  }, [running, index, items.length]);

  function select(next: number) {
    setIndex((next + items.length) % items.length);
    setPlayback("paused");
  }

  function onKeyDown(event: KeyboardEvent<HTMLElement>) {
    if (event.altKey || event.ctrlKey || event.metaKey) return;
    if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
      event.preventDefault();
      select(index + (event.key === "ArrowRight" ? 1 : -1));
    }
  }

  function onPointerDown(event: PointerEvent<HTMLElement>) {
    if (event.pointerType === "touch" && !(event.target as Element).closest("a,button")) touchStart.current = { x: event.clientX, y: event.clientY };
  }

  function onPointerUp(event: PointerEvent<HTMLElement>) {
    const start = touchStart.current;
    touchStart.current = null;
    if (!start) return;
    const horizontal = event.clientX - start.x;
    if (Math.abs(horizontal) > 45 && Math.abs(event.clientY - start.y) < 60) select(index + (horizontal < 0 ? 1 : -1));
  }

  return <section className="featured-film" aria-label={label} aria-roledescription="轮播" data-active-key={mediaKey(item)} data-slide-index={index} data-autoplay={running}
    onPointerEnter={event => { if (event.pointerType !== "touch") setHovered(true); }} onPointerLeave={() => setHovered(false)}
    onFocusCapture={event => { if (!(event.target as Element).closest("[data-playback-control]")) setPlayback("paused"); }}
    onPointerDown={onPointerDown} onPointerUp={onPointerUp} onPointerCancel={() => { touchStart.current = null; }}>
    <div key={mediaKey(item)} className="featured-slide" role="group" aria-roledescription="幻灯片" aria-label={`第 ${index + 1} 部，共 ${items.length} 部`} aria-live={wantsPlaying ? "off" : "polite"}>
      <div className="featured-image"><MediaImage item={item} backdrop={Boolean(item.backdropPath)}/></div>
      <div className="featured-shade"/>
      <div className="featured-copy">
        <span className="featured-label">{item.source === "demo" ? "精选预览" : label}</span>
        <h1 id="featured-title" title={item.title}>{item.title}</h1>
        <div className="featured-meta"><span>{item.mediaType === "tv" ? "电视剧" : "电影"}</span><time dateTime={item.releaseDate || undefined}>{formatMediaDate(item.releaseDate)}</time><span className="featured-genres">{item.genres.join(" / ") || "类型待补充"}</span></div>
        <p>{item.overview || "点击查看作品资料。"}</p>
        <div className="featured-actions">
          <Link className="primary-button" href={`/${item.mediaType}/${item.id}`}>查看详情<ArrowRight size={16}/></Link>
          <button className="featured-save" onClick={() => toggle(item)} aria-pressed={saved}><Bookmark size={17} fill={saved ? "currentColor" : "none"}/>{saved ? "已收藏" : "收藏"}</button>
        </div>
      </div>
    </div>
    {items.length > 1 && <div className="featured-controls" onKeyDown={onKeyDown}>
      <span className="featured-counter" aria-hidden="true">{String(index + 1).padStart(2, "0")}<span> / {String(items.length).padStart(2, "0")}</span></span>
      <button className="carousel-arrow" onClick={() => select(index - 1)} aria-label="上一部"><ChevronLeft size={18}/></button>
      <div className="carousel-dots" role="group" aria-label="选择轮播影片">{items.map((slide, position) => <button key={mediaKey(slide)} className={position === index ? "active" : ""} onClick={() => select(position)} aria-label={`切换到第 ${position + 1} 部：${slide.title}`} aria-pressed={position === index}><span/></button>)}</div>
      <button className="carousel-arrow" onClick={() => select(index + 1)} aria-label="下一部"><ChevronRight size={18}/></button>
      <button className="carousel-playback" data-playback-control onClick={() => setPlayback(wantsPlaying ? "paused" : "playing")} aria-label={wantsPlaying ? "暂停自动轮播" : "开始自动轮播"} title="每 6 秒切换，悬停时暂停">{wantsPlaying ? <Pause size={14}/> : <Play size={14}/>}</button>
    </div>}
  </section>;
}

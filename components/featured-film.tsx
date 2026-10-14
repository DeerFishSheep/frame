"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { ArrowRight, Bookmark, ChevronLeft, ChevronRight } from "lucide-react";
import { imageUrl, mediaHref, mediaKey, type Media } from "@/lib/types";
import { FEATURED_INTERVAL_MS, featuredIndex, formatMediaDate, selectFeaturedMedia } from "@/lib/media-presentation";
import { useStableUpdate } from "@/lib/use-stable-update";
import { useViewState } from "@/lib/view-state";
import { MediaImage } from "./media-card";
import { useMediaRegions } from "@/lib/use-media-regions";
import { useFrame } from "./providers";
import { resourceLoadingProps } from "./resource-feedback";

export function FeaturedFilm({ items, label, pending = false, stateKey = "featured:catalog" }: { items: Media[]; label: string; pending?: boolean; stateKey?: string }) {
  const slides = selectFeaturedMedia(items);
  if (!slides.length) return null;
  return <FeaturedCarousel items={slides} label={label} pending={pending} stateKey={stateKey}/>;
}

function FeaturedCarousel({ items, label, pending, stateKey }: { items: Media[]; label: string; pending: boolean; stateKey: string }) {
  const { isFavorite, toggle } = useFrame();
  const [selection, setSelection] = useViewState(stateKey, { key: mediaKey(items[0]), index: 0 });
  const index = featuredIndex(selection, items);
  const prepareUpdate = useStableUpdate();
  const [interaction, setInteraction] = useState(0);
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const [visible, setVisible] = useState(true);
  const [reducedMotion, setReducedMotion] = useState(true);
  const suppressSwipeClick = useRef(false);
  const touchStart = useRef<{ x: number; y: number } | null>(null);
  const item = items[index];
  const detailLink = { href: mediaHref(item), target: typeof item.id === "string" ? "_blank" : undefined, rel: typeof item.id === "string" ? "noopener noreferrer" : undefined };
  const saved = isFavorite(item);
  const { label: region, countryCodes } = useMediaRegions(item);
  const running = !pending && !reducedMotion && visible && !hovered && !focused && items.length > 1;
  const nextItem = items[(index + 1) % items.length];
  const activeKey = mediaKey(item), nextKey = mediaKey(nextItem);
  const nextImage = imageUrl(nextItem.backdropPath || nextItem.posterPath, nextItem.backdropPath ? "w1280" : "w500");

  useEffect(() => {
    if (selection.key !== activeKey || selection.index !== index) setSelection({ key: activeKey, index });
  }, [selection.key, selection.index, activeKey, index, setSelection]);

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
    const timer = window.setTimeout(() => {
      prepareUpdate();
      const next = (index + 1) % items.length;
      setSelection({ key: mediaKey(items[next]), index: next });
    }, FEATURED_INTERVAL_MS);
    return () => window.clearTimeout(timer);
  }, [running, index, items.length, activeKey, nextKey, interaction, prepareUpdate, setSelection]);

  function select(next: number) {
    prepareUpdate();
    const position = (next + items.length) % items.length;
    setSelection({ key: mediaKey(items[position]), index: position });
    // Restart the interval after touch/manual selection, including the active dot.
    setInteraction(current => current + 1);
  }

  function onKeyDown(event: KeyboardEvent<HTMLElement>) {
    if (event.altKey || event.ctrlKey || event.metaKey) return;
    if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
      event.preventDefault();
      select(index + (event.key === "ArrowRight" ? 1 : -1));
    }
  }

  function onPointerDown(event: PointerEvent<HTMLElement>) {
    suppressSwipeClick.current = false;
    if (event.pointerType === "touch" && !(event.target as Element).closest("a:not(.featured-image),button")) touchStart.current = { x: event.clientX, y: event.clientY };
  }

  function onPointerUp(event: PointerEvent<HTMLElement>) {
    const start = touchStart.current;
    touchStart.current = null;
    if (!start) return;
    const horizontal = event.clientX - start.x;
    if (Math.abs(horizontal) > 45 && Math.abs(event.clientY - start.y) < 60) {
      suppressSwipeClick.current = true;
      select(index + (horizontal < 0 ? 1 : -1));
    }
  }

  return <section className="featured-film" aria-label={label} {...resourceLoadingProps(pending)} aria-roledescription="轮播" data-active-key={mediaKey(item)} data-slide-index={index} data-autoplay={running} data-artwork={item.backdropPath ? "backdrop" : "poster"}
    onPointerEnter={event => { if (event.pointerType !== "touch") setHovered(true); }} onPointerLeave={() => setHovered(false)}
    onFocusCapture={() => setFocused(true)}
    onBlurCapture={event => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setFocused(false); }}
    onClickCapture={event => {
      if (suppressSwipeClick.current && event.detail > 0) { event.preventDefault(); event.stopPropagation(); }
      suppressSwipeClick.current = false;
    }}
    onPointerDown={onPointerDown} onPointerUp={onPointerUp} onPointerCancel={() => { touchStart.current = null; }}>
    <div key={mediaKey(item)} className="featured-slide" role="group" aria-roledescription="幻灯片" aria-label={`第 ${index + 1} 部，共 ${items.length} 部`} aria-live={running ? "off" : "polite"}>
      <Link {...detailLink} className="featured-image" data-skeleton="block" aria-label={`查看${item.title}详情`}><MediaImage item={item} backdrop={Boolean(item.backdropPath)}/></Link>
      <div className="featured-shade" aria-hidden="true"/>
      <div className="featured-copy">
        <span className="featured-label" data-skeleton="line">{label}</span>
        <h1 data-skeleton="line" id="featured-title" title={item.title}><Link {...detailLink} className="featured-title-link">{item.title}</Link></h1>
        <div className="featured-meta" data-skeleton="line"><span>{item.mediaType === "tv" ? "电视剧" : "电影"}</span><time dateTime={item.releaseDate || undefined}>{formatMediaDate(item.releaseDate)}</time><span className="featured-genres">{[region, item.genres.join(" / ") || "类型待补充"].filter(Boolean).join(" · ")}</span></div>
        <p data-skeleton="text">{item.overview || "点击查看作品资料。"}</p>
        <div className="featured-actions" data-skeleton="block">
          <Link className="primary-button" {...detailLink}>{typeof item.id === "string" ? "在 IMDB 查看" : "查看详情"}<ArrowRight size={16}/></Link>
          <button className="featured-save" onClick={() => toggle({ ...item, countryCodes })} aria-pressed={saved}><Bookmark size={17} fill={saved ? "currentColor" : "none"}/>{saved ? "已收藏" : "收藏"}</button>
        </div>
      </div>
    </div>
    {items.length > 1 && <div className="featured-controls" data-skeleton="line" onKeyDown={onKeyDown}>
      <span className="featured-counter" aria-hidden="true">{String(index + 1).padStart(2, "0")}<span> / {String(items.length).padStart(2, "0")}</span></span>
      <button className="carousel-arrow" onClick={() => select(index - 1)} aria-label="上一部"><ChevronLeft size={18}/></button>
      <div className="carousel-dots" role="group" aria-label="选择轮播影片">{items.map((slide, position) => <button key={mediaKey(slide)} className={position === index ? "active" : ""} onClick={() => select(position)} aria-label={`切换到第 ${position + 1} 部：${slide.title}`} aria-pressed={position === index}><span/></button>)}</div>
      <button className="carousel-arrow" onClick={() => select(index + 1)} aria-label="下一部"><ChevronRight size={18}/></button>
    </div>}
  </section>;
}

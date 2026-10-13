"use client";

import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useScrollMemory } from "@/lib/view-state";

/** Compact, keyboard-accessible rows for cast and stills. */
export function DetailMediaStrip({ title, kind, stateKey, children }: { title: string; kind: "cast" | "stills"; stateKey: string; children: ReactNode }) {
  const id = useId();
  const rail = useRef<HTMLDivElement>(null);
  const rememberRail = useScrollMemory(`media-strip:${stateKey}:${kind}`, rail);
  const [edges, setEdges] = useState({ start: true, end: true });
  const measure = useCallback(() => {
    const node = rail.current;
    if (!node) return;
    const start = node.scrollLeft <= 2;
    const end = node.scrollLeft + node.clientWidth >= node.scrollWidth - 2;
    setEdges(previous => previous.start === start && previous.end === end ? previous : { start, end });
  }, []);

  useEffect(() => {
    const node = rail.current;
    if (!node) return;
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    measure();
    return () => observer.disconnect();
  }, [measure]);

  function move(direction: number) {
    const node = rail.current;
    node?.scrollBy({ left: direction * node.clientWidth * .8, behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth" });
  }

  return <section className="detail-section" aria-labelledby={`${id}-title`}>
    <div className="subsection-head">
      <h2 id={`${id}-title`}>{title}</h2>
      {!(edges.start && edges.end) && <div className="rail-controls">
        <button onClick={() => move(-1)} disabled={edges.start} aria-label={`向左浏览${title}`} aria-controls={id}><ChevronLeft size={18}/></button>
        <button onClick={() => move(1)} disabled={edges.end} aria-label={`向右浏览${title}`} aria-controls={id}><ChevronRight size={18}/></button>
      </div>}
    </div>
    <div id={id} ref={rememberRail} className={`detail-media-strip detail-media-strip--${kind}`} role="region" aria-label={`${title}，左右滑动查看更多`} tabIndex={0} onScroll={measure}
      onKeyDown={event => { if (event.target === event.currentTarget && ["ArrowLeft", "ArrowRight"].includes(event.key)) { event.preventDefault(); move(event.key === "ArrowLeft" ? -1 : 1); } }}>
      {children}
    </div>
  </section>;
}

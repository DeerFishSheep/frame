"use client";

import { useCallback, useLayoutEffect, useRef } from "react";

interface Anchor { element: HTMLElement | null; key: string | null; top: number; y: number; x: number }
function capture(): Anchor | null {
  if (typeof window === "undefined") return null;
  const visible = (element: HTMLElement) => { const box = element.getBoundingClientRect(); return box.height > 0 && box.top >= 0 && box.top < window.innerHeight - 30; };
  const focused = document.activeElement instanceof HTMLElement && document.activeElement.closest("main") && visible(document.activeElement) ? document.activeElement : null;
  const element = focused || [...document.querySelectorAll<HTMLElement>("[data-scroll-anchor]")].find(visible) || null;
  return { element, key: element?.dataset.scrollAnchor ?? null, top: element?.getBoundingClientRect().top ?? 0, y: window.scrollY, x: window.scrollX };
}

/** Capture immediately before a state commit; restore before paint, without fighting later user scroll. */
export function useStableUpdate() {
  const anchor = useRef<Anchor | null>(null);
  const prepare = useCallback(() => { if (!anchor.current) anchor.current = capture(); }, []);
  useLayoutEffect(() => {
    const saved = anchor.current; anchor.current = null;
    if (!saved) return;
    const element = saved.element?.isConnected ? saved.element : saved.key
      ? [...document.querySelectorAll<HTMLElement>("[data-scroll-anchor]")].find(node => node.dataset.scrollAnchor === saved.key) : null;
    const delta = element ? element.getBoundingClientRect().top - saved.top : saved.y - window.scrollY;
    if (Math.abs(delta) > 1) window.scrollTo({ top: Math.max(0, window.scrollY + delta), left: saved.x, behavior: "instant" });
  });
  return prepare;
}

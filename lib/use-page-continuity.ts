"use client";

import { useEffect, useLayoutEffect, useRef } from "react";
import { readViewState, saveViewState } from "./view-state";

import { isPinnedAnchor } from "./scroll-anchors";

interface Position { x: number; y: number; anchor: string | null; top: number }
function locationKey(path: string, search: string) {
  const params = new URLSearchParams(search);
  if (params.get("page") === "1") params.delete("page");
  params.sort(); return `${path}?${params}`;
}
function position(): Position {
  const anchor = [...document.querySelectorAll<HTMLElement>("[data-scroll-anchor]")].find(element => {
    const box = element.getBoundingClientRect(); return !isPinnedAnchor(element) && box.height > 0 && box.top >= 0 && box.top < window.innerHeight;
  });
  return { x: window.scrollX, y: window.scrollY, anchor: anchor?.dataset.scrollAnchor ?? null, top: anchor?.getBoundingClientRect().top ?? 0 };
}

/** One history/viewport policy for all routes, independent of the data provider. */
export function usePageContinuity(pathname: string, query: string) {
  const key = locationKey(pathname, query), current = useRef(key), restoring = useRef<string | null>(null);
  const finishRestore = useRef<(() => void) | null>(null);
  useEffect(() => {
    const remember = () => {
      // Next can change the URL before the new page commits; never save its scroll to the old page.
      if (!restoring.current && current.current === locationKey(window.location.pathname, window.location.search)) {
        saveViewState(`position:${current.current}`, position());
      }
    };
    const pop = () => {
      remember();
      restoring.current = locationKey(window.location.pathname, window.location.search);
    };
    const interrupt = () => { restoring.current = null; finishRestore.current?.(); };
    const keyInterrupt = (event: KeyboardEvent) => { if (["ArrowUp", "ArrowDown", "PageUp", "PageDown", "Home", "End"].includes(event.key)) interrupt(); };
    window.addEventListener("scroll", remember, { passive: true });
    document.addEventListener("click", remember, true);
    window.addEventListener("popstate", pop);
    window.addEventListener("frame:scroll-to-top", interrupt);
    window.addEventListener("wheel", interrupt, { passive: true });
    window.addEventListener("touchmove", interrupt, { passive: true });
    window.addEventListener("keydown", keyInterrupt);
    return () => {
      window.removeEventListener("scroll", remember); document.removeEventListener("click", remember, true);
      window.removeEventListener("popstate", pop); window.removeEventListener("wheel", interrupt);
      window.removeEventListener("frame:scroll-to-top", interrupt);
      window.removeEventListener("touchmove", interrupt); window.removeEventListener("keydown", keyInterrupt);
      finishRestore.current?.();
    };
  }, []);
  useLayoutEffect(() => {
    current.current = key;
    finishRestore.current?.();
    if (restoring.current !== key) return;
    const saved = readViewState<Position | null>(`position:${key}`, null), main = document.querySelector("main");
    if (!saved || !main) { restoring.current = null; return; }
    let frame = 0, stopped = false, settledPasses = 0;
    const observer = new MutationObserver(() => { cancelAnimationFrame(frame); frame = requestAnimationFrame(restore); });
    const resize = new ResizeObserver(() => { cancelAnimationFrame(frame); frame = requestAnimationFrame(restore); });
    function finish() { stopped = true; observer.disconnect(); resize.disconnect(); cancelAnimationFrame(frame); }
    function restore() {
      if (stopped || restoring.current !== key) return;
      const anchor = saved!.anchor ? [...document.querySelectorAll<HTMLElement>("[data-scroll-anchor]")].find(element => element.dataset.scrollAnchor === saved!.anchor) : null;
      const pinnedSnapshot = anchor?.closest("[data-sticky-heading]") && saved!.top <= 1;
      const top = anchor && !pinnedSnapshot ? window.scrollY + anchor.getBoundingClientRect().top - saved!.top : saved!.y;
      window.scrollTo({ top: Math.max(0, top), left: saved!.x, behavior: "instant" });
      if (!main!.querySelector('[aria-busy="true"]') && (!saved!.anchor || anchor)) {
        // Next's native history restoration can run after layout effects. Settle with it,
        // while preserving the user's anchor instead of saving that transient position.
        if (++settledPasses >= 3) { restoring.current = null; finish(); }
        else frame = requestAnimationFrame(restore);
      } else settledPasses = 0;
    }
    finishRestore.current = finish;
    observer.observe(main, { childList: true, subtree: true, attributes: true, attributeFilter: ["aria-busy"] });
    resize.observe(main); restore();
    return finish;
  }, [key]);
}

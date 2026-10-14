"use client";

import { ArrowUp } from "lucide-react";

/** Always available in the shared shell, including detail and collection pages. */
export function BackToTop() {
  function goToTop() {
    window.dispatchEvent(new Event("frame:scroll-to-top"));
    window.scrollTo({ top: 0, left: 0, behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth" });
  }
  return <button type="button" className="back-to-top" onClick={goToTop} aria-label="回到顶部" title="回到顶部"><ArrowUp size={20}/></button>;
}

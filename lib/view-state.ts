"use client";

import { useCallback, useRef, useState, type RefObject } from "react";

const viewMemory = globalThis as typeof globalThis & { __frameViewsV1?: Map<string, unknown> };
const views = typeof window === "undefined" ? new Map<string, unknown>()
  : viewMemory.__frameViewsV1 ?? (viewMemory.__frameViewsV1 = new Map<string, unknown>());
export function readViewState<T>(key: string, fallback: T): T { return views.has(key) ? views.get(key) as T : fallback; }
export function saveViewState<T>(key: string, value: T) {
  views.delete(key); views.set(key, value);
  if (views.size > 64) views.delete(views.keys().next().value!);
}
export function useViewState<T>(key: string, fallback: T) {
  const defaultValue = useRef(fallback); defaultValue.current = fallback;
  const [state, setState] = useState(() => ({ key, value: readViewState(key, fallback) }));
  const value = state.key === key ? state.value : readViewState(key, fallback);
  const setValue = useCallback((next: T | ((current: T) => T)) => {
    setState(current => {
      const previous = current.key === key ? current.value : readViewState(key, defaultValue.current);
      const value = typeof next === "function" ? (next as (current: T) => T)(previous) : next;
      saveViewState(key, value); return { key, value };
    });
  }, [key]);
  return [value, setValue] as const;
}

/** Common persistence for horizontal strips and other independently scrollable regions. */
export function useScrollMemory<T extends HTMLElement>(key: string, ref: RefObject<T | null>) {
  const cleanup = useRef<(() => void) | null>(null);
  return useCallback((node: T | null) => {
    cleanup.current?.(); cleanup.current = null; ref.current = node;
    if (!node) return;
    const saved = readViewState(key, { x: 0, y: 0 });
    node.scrollLeft = saved.x; node.scrollTop = saved.y;
    const remember = () => saveViewState(key, { x: node.scrollLeft, y: node.scrollTop });
    node.addEventListener("scroll", remember, { passive: true });
    cleanup.current = () => { remember(); node.removeEventListener("scroll", remember); };
  }, [key, ref]);
}

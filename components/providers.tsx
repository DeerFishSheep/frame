"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { Check, Info, X } from "lucide-react";
import { readFavorites, writeFavorites, toggleFavorite, sameFavorite, FAVORITES_KEY } from "@/lib/favorites";
import type { Media } from "@/lib/types";
import { useStableUpdate } from "@/lib/use-stable-update";
import { COLLECTION_FAVORITES_KEY, collectionKey, readSavedCollections, writeSavedCollections, toggleSavedCollection, type CollectionSummary } from "@/lib/collections";

interface FrameContextValue {
  favorites: Media[];
  favoritesReady: boolean;
  collections: CollectionSummary[];
  toggleCollection: (item: CollectionSummary) => void;
  isFavorite: (item: Media) => boolean;
  toggle: (item: Media) => void;
  theme: "dark" | "light";
  toggleTheme: () => void;
  preview: boolean;
  setPreview: (value: boolean) => void;
  configured: boolean;
  notify: (message: string, warning?: boolean) => void;
}

const FrameContext = createContext<FrameContextValue | null>(null);
export function useFrame() {
  const context = useContext(FrameContext);
  if (!context) throw new Error("FrameProvider is missing");
  return context;
}

export function FrameProvider({ children, configured }: { children: ReactNode; configured: boolean }) {
  const prepareUpdate = useStableUpdate();
  const [favorites, setFavorites] = useState<Media[]>([]);
  const favoritesRef = useRef<Media[]>([]);
  const [collections, setCollections] = useState<CollectionSummary[]>([]);
  const collectionsRef = useRef<CollectionSummary[]>([]);
  const [favoritesReady, setFavoritesReady] = useState(false);
  const [theme, setTheme] = useState<"dark" | "light">("dark");
  const [preview, setPreview] = useState(!configured);
  const [toast, setToast] = useState<{message:string;warning:boolean} | null>(null);
  useEffect(() => {
    try { favoritesRef.current = readFavorites(window.localStorage); } catch { favoritesRef.current = []; }
    setFavorites(favoritesRef.current);
    try { collectionsRef.current = readSavedCollections(window.localStorage); } catch { collectionsRef.current = []; }
    setCollections(collectionsRef.current);
    setFavoritesReady(true);
    setTheme(document.documentElement.dataset.theme === "light" ? "light" : "dark");
    const sync = (event: StorageEvent) => {
      if (event.key === FAVORITES_KEY || event.key === null) { prepareUpdate(); try { favoritesRef.current = readFavorites(window.localStorage); } catch { favoritesRef.current = []; } setFavorites(favoritesRef.current); }
      if (event.key === COLLECTION_FAVORITES_KEY || event.key === null) { prepareUpdate(); try { collectionsRef.current = readSavedCollections(window.localStorage); } catch { collectionsRef.current = []; } setCollections(collectionsRef.current); }
    };
    window.addEventListener("storage", sync);
    return () => window.removeEventListener("storage", sync);
  }, []);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 3400);
    return () => clearTimeout(timer);
  }, [toast]);
  const notify = useCallback((message: string, warning = false) => setToast({message,warning}), []);
  const toggle = useCallback((item: Media) => {
    prepareUpdate();
    const next = toggleFavorite(favoritesRef.current, item);
    favoritesRef.current = next;
    setFavorites(next);
    try {
      writeFavorites(window.localStorage, next);
      setToast({message:next.some(entry=>sameFavorite(entry,item))?"已收藏影片":"已取消影片收藏",warning:false});
    } catch { setToast({message:"浏览器未允许保存，收藏暂存于当前页面",warning:true}); }
  }, [prepareUpdate]);
  const toggleCollection = useCallback((item: CollectionSummary) => {
    prepareUpdate();
    const next = toggleSavedCollection(collectionsRef.current, item);
    collectionsRef.current = next; setCollections(next);
    try {
      writeSavedCollections(window.localStorage, next);
      setToast({ message: next.some(saved => collectionKey(saved) === collectionKey(item)) ? "已收藏整个片单" : "已取消片单收藏", warning: false });
    } catch { setToast({ message: "浏览器未允许保存，片单收藏暂存于当前页面", warning: true }); }
  }, [prepareUpdate]);
  const toggleTheme = () => {
    const next = theme === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    setTheme(next);
    try { localStorage.setItem("frame_theme_v2", next); } catch { /* Theme still works for this visit. */ }
  };
  return <FrameContext.Provider value={{favorites,favoritesReady,collections,toggleCollection,isFavorite:item=>favorites.some(entry=>sameFavorite(entry,item)),toggle,theme,toggleTheme,preview,setPreview,configured,notify}}>
    {children}
    <div className={`toast ${toast ? "toast-visible" : ""}`} role="status" aria-live="polite" aria-hidden={!toast}>
      {toast?.warning?<Info size={17}/>:<Check size={17}/>}<span>{toast?.message}</span><button aria-label="关闭通知" onClick={()=>setToast(null)}><X size={15}/></button>
    </div>
  </FrameContext.Provider>;
}

"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { Check, Info, X } from "lucide-react";
import { readFavorites, writeFavorites, toggleFavorite, FAVORITES_KEY } from "@/lib/favorites";
import { mediaKey, type Media } from "@/lib/types";
import { useStableUpdate } from "@/lib/use-stable-update";

interface FrameContextValue {
  favorites: Media[];
  favoritesReady: boolean;
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
  const [favoritesReady, setFavoritesReady] = useState(false);
  const [theme, setTheme] = useState<"dark" | "light">("dark");
  const [preview, setPreview] = useState(!configured);
  const [toast, setToast] = useState<{message:string;warning:boolean} | null>(null);
  useEffect(() => {
    try { favoritesRef.current = readFavorites(window.localStorage); } catch { favoritesRef.current = []; }
    setFavorites(favoritesRef.current);
    setFavoritesReady(true);
    setTheme(document.documentElement.dataset.theme === "light" ? "light" : "dark");
    const sync = (event: StorageEvent) => { if (event.key === FAVORITES_KEY || event.key === null) { prepareUpdate(); try { favoritesRef.current = readFavorites(window.localStorage); } catch { favoritesRef.current = []; } setFavorites(favoritesRef.current); } };
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
      setToast({message:next.some(entry=>mediaKey(entry)===mediaKey(item))?"已收进你的片单":"已从片单移除",warning:false});
    } catch { setToast({message:"浏览器未允许保存，收藏暂存于当前页面",warning:true}); }
  }, [prepareUpdate]);
  const toggleTheme = () => {
    const next = theme === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    setTheme(next);
    try { localStorage.setItem("frame_theme_v2", next); } catch { /* Theme still works for this visit. */ }
  };
  return <FrameContext.Provider value={{favorites,favoritesReady,isFavorite:item=>favorites.some(entry=>mediaKey(entry)===mediaKey(item)),toggle,theme,toggleTheme,preview,setPreview,configured,notify}}>
    {children}
    <div className={`toast ${toast ? "toast-visible" : ""}`} role="status" aria-live="polite" aria-hidden={!toast}>
      {toast?.warning?<Info size={17}/>:<Check size={17}/>}<span>{toast?.message}</span><button aria-label="关闭通知" onClick={()=>setToast(null)}><X size={15}/></button>
    </div>
  </FrameContext.Provider>;
}

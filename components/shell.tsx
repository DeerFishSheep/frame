"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useLayoutEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { ArrowUpRight, Film, Moon, Search, Sun, X } from "lucide-react";
import { buildSearchHref } from "@/lib/navigation";
import { BackToTop } from "./back-to-top";
import { useFrame } from "./providers";
import { readViewState } from "@/lib/view-state";
import { usePageContinuity } from "@/lib/use-page-continuity";
import { catalogDataSource, sourceLabel } from "@/lib/catalog-sources";
import { catalogNavigationHref } from "@/lib/catalog-navigation";

const navigation = [
  { id: "movie", label: "电影", href: "/" },
  { id: "tv", label: "电视剧", href: "/?media=tv" },
  { id: "lists", label: "片单", href: "/lists" },
  { id: "discover", label: "找片", href: "/discover" },
  { id: "favorites", label: "我的收藏", href: "/favorites" },
];

export function FrameShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const params = useSearchParams();
  usePageContinuity(pathname, params.toString());
  const router = useRouter();
  const { favorites, collections, theme, toggleTheme, preview, setPreview, configured } = useFrame();
  const [sourceOpen, setSourceOpen] = useState(false);
  const [query, setQuery] = useState(params.get("query") || "");
  const [savedNavigation, setSavedNavigation] = useState<{ location: string; movie: string; tv: string } | null>(null);
  const searchInput = useRef<HTMLInputElement>(null);
  const currentQuery = params.get("query") || "";
  const paramString = params.toString(), location = `${pathname}?${paramString}`;
  const collectionMode = pathname.startsWith("/lists") || pathname === "/favorites" && params.get("section") === "lists";
  const source = collectionMode ? "douban" : pathname === "/" ? catalogDataSource(new URLSearchParams(params)) : "tmdb";
  const providerMode = source !== "tmdb", providerLabel = sourceLabel(source);
  const mediaNavigation = (item: typeof navigation[number]) => {
    if (item.id !== "movie" && item.id !== "tv") return item.href;
    return savedNavigation?.location === location ? savedNavigation[item.id]
      : catalogNavigationHref(item.id, pathname, new URLSearchParams(params));
  };
  const active = pathname === "/favorites" ? "favorites"
    : pathname === "/lists" || pathname.startsWith("/lists/") ? "lists"
    : pathname === "/discover" ? "discover"
    : pathname.startsWith("/movie/") ? "movie"
    : pathname.startsWith("/tv/") ? "tv"
    : pathname === "/" ? params.get("media") === "tv" ? "tv" : "movie" : "";

  useEffect(() => setQuery(currentQuery), [currentQuery, pathname]);
  // Read browser-owned chart memory only after hydration; SSR and the first client render share URLs.
  useLayoutEffect(() => {
    const remember = (key: string) => readViewState<string | undefined>(key, undefined);
    const current = new URLSearchParams(paramString);
    setSavedNavigation({ location, movie: catalogNavigationHref("movie", pathname, current, remember), tv: catalogNavigationHref("tv", pathname, current, remember) });
  }, [location, pathname, paramString]);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        searchInput.current?.focus();
      }
    };
    const source = () => setSourceOpen(true);
    window.addEventListener("keydown", onKey);
    window.addEventListener("frame:source", source);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("frame:source", source);
    };
  }, []);

  function search(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    router.push(buildSearchHref(pathname, new URLSearchParams(params), query, key => readViewState<string | undefined>(key, undefined)), { scroll: false });
  }

  function clearSearch() {
    setQuery("");
    searchInput.current?.focus();
    if (currentQuery) router.push(buildSearchHref(pathname, new URLSearchParams(params), "", key => readViewState<string | undefined>(key, undefined)), { scroll: false });
  }

  return <>
    <header className="site-header">
      <div className="site-header-inner">
        <Link className="site-brand" href={mediaNavigation(navigation[0])} aria-label="帧榜电影"><Film size={25} strokeWidth={1.7}/><strong>帧榜<span>FRAME</span></strong></Link>
        <nav className="site-nav" aria-label="主导航">
          {navigation.map(item => <Link key={item.id} href={mediaNavigation(item)} scroll={pathname === "/" && (item.id === "movie" || item.id === "tv") ? false : undefined} className={active === item.id ? "active" : ""} aria-current={active === item.id ? "page" : undefined}>
            {item.label}{item.id === "favorites" && favorites.length + collections.length > 0 && <span className="nav-count">{favorites.length + collections.length}</span>}
          </Link>)}
        </nav>
        <form className="site-search" role="search" onSubmit={search} onKeyDown={event => { if (event.key === "Enter" && event.nativeEvent.isComposing) event.preventDefault(); }}>
          <Search size={18}/>
          <input ref={searchInput} value={query} onChange={event => setQuery(event.target.value)} maxLength={200} placeholder={pathname === "/favorites" ? "搜索我的收藏" : "搜索电影、电视剧"} aria-label={pathname === "/favorites" ? "搜索收藏" : "搜索影视作品"}/>
          {query && <button type="button" className="search-clear" onClick={clearSearch} aria-label="清空搜索"><X size={15}/></button>}
          <button type="submit" className="search-submit">搜索</button>
        </form>
        <button className="theme-button icon-button" onClick={toggleTheme} aria-label={theme === "dark" ? "切换浅色主题" : "切换深色主题"}>{theme === "dark" ? <Sun size={19}/> : <Moon size={19}/>}</button>
      </div>
    </header>
    <main className="main-shell">{children}</main>
    <footer className="site-footer">
      <Link href={mediaNavigation(navigation[0])} className="footer-brand">帧榜<span>FRAME</span></Link>
      <span>电影 · 电视剧 · 好片收藏</span>
      <div className="footer-links"><button onClick={() => setSourceOpen(true)}>{providerMode ? `${providerLabel} 数据` : preview ? "预览模式" : "TMDB 数据"}</button><Link href="/about">关于与数据来源</Link></div>
    </footer>
    <BackToTop/>
    <Dialog.Root open={sourceOpen} onOpenChange={setSourceOpen}>
      <Dialog.Portal><Dialog.Overlay className="dialog-overlay"/>
        <Dialog.Content className="info-dialog">
          <Dialog.Close className="dialog-close icon-button" aria-label="关闭数据说明"><X size={19}/></Dialog.Close>
          <Dialog.Title>数据来源</Dialog.Title>
          <Dialog.Description>{providerMode ? `当前榜单、评分和评分数量来自${providerLabel}；本站详情由可靠匹配的 TMDB 资料补充。` : preview ? "当前展示固定的预览影片，不代表今日榜单。" : "影视资料和榜单来自 TMDB，按接口返回顺序展示。"}</Dialog.Description>
          <p className="source-instruction">{providerMode ? `榜单按来源顺序展示，评分保留${providerLabel}原始数据；暂未匹配本站详情的作品仍可在原站查看。` : configured ? "已配置 TMDB，可以切换真实数据与预览影片。" : "TMDB 真实榜单尚未启用。预览可以体验选片、详情和收藏。"}</p>
          {!providerMode && !configured && <details className="connection-help"><summary>本地数据接入说明</summary><p>在本地 .env.local 中配置 <code>TMDB_API_KEY</code> 或 <code>TMDB_API_READ_ACCESS_TOKEN</code>，重启应用后即可联调。</p></details>}
          {!providerMode && <button className="primary-button full-width" onClick={() => { setPreview(!preview); setSourceOpen(false); }}>{preview ? "切换真实数据" : "查看预览影片"}</button>}
          <Link className="text-link" href="/about" onClick={() => setSourceOpen(false)}>完整来源说明<ArrowUpRight size={14}/></Link>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  </>;
}

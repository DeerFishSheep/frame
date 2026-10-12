"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { ArrowUpRight, Film, Moon, Search, Sun, X } from "lucide-react";
import { buildSearchHref } from "@/lib/navigation";
import { useFrame } from "./providers";

const navigation = [
  { id: "home", label: "首页", href: "/" },
  { id: "movie", label: "电影", href: "/?media=movie" },
  { id: "tv", label: "电视剧", href: "/?media=tv" },
  { id: "discover", label: "片库", href: "/discover" },
  { id: "favorites", label: "我的收藏", href: "/favorites" },
];

export function FrameShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const params = useSearchParams();
  const router = useRouter();
  const { favorites, theme, toggleTheme, preview, setPreview, configured } = useFrame();
  const [sourceOpen, setSourceOpen] = useState(false);
  const [query, setQuery] = useState(params.get("query") || "");
  const searchInput = useRef<HTMLInputElement>(null);
  const currentQuery = params.get("query") || "";
  const active = pathname === "/favorites" ? "favorites"
    : pathname === "/discover" ? "discover"
    : pathname.startsWith("/movie/") ? "movie"
    : pathname.startsWith("/tv/") ? "tv"
    : pathname === "/" ? params.get("media") === "tv" ? "tv" : params.get("media") === "movie" ? "movie" : "home" : "";

  useEffect(() => setQuery(currentQuery), [currentQuery, pathname]);
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
    router.push(buildSearchHref(pathname, new URLSearchParams(params), query));
  }

  function clearSearch() {
    setQuery("");
    searchInput.current?.focus();
    if (currentQuery) router.push(buildSearchHref(pathname, new URLSearchParams(params), ""));
  }

  return <>
    <header className="site-header">
      <div className="site-header-inner">
        <Link className="site-brand" href="/" aria-label="帧榜首页"><Film size={25} strokeWidth={1.7}/><strong>帧榜<span>FRAME</span></strong></Link>
        <nav className="site-nav" aria-label="主导航">
          {navigation.map(item => <Link key={item.id} href={item.href} className={active === item.id ? "active" : ""} aria-current={active === item.id ? "page" : undefined}>
            {item.label}{item.id === "favorites" && favorites.length > 0 && <span className="nav-count">{favorites.length}</span>}
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
      <Link href="/" className="footer-brand">帧榜<span>FRAME</span></Link>
      <span>电影 · 电视剧 · 好片收藏</span>
      <div className="footer-links"><button onClick={() => setSourceOpen(true)}>{preview ? "预览模式" : "TMDB 数据"}</button><Link href="/about">关于与数据来源</Link></div>
    </footer>
    <Dialog.Root open={sourceOpen} onOpenChange={setSourceOpen}>
      <Dialog.Portal><Dialog.Overlay className="dialog-overlay"/>
        <Dialog.Content className="info-dialog">
          <Dialog.Close className="dialog-close icon-button" aria-label="关闭数据说明"><X size={19}/></Dialog.Close>
          <Dialog.Title>数据来源</Dialog.Title>
          <Dialog.Description>{preview ? "当前展示固定的预览影片，不代表今日榜单。" : "影视资料和榜单来自 TMDB，按接口返回顺序展示。"}</Dialog.Description>
          <p className="source-instruction">{configured ? "已配置 TMDB，可以切换真实数据与预览影片。" : "真实榜单尚未启用。预览可以体验选片、详情和收藏。"}</p>
          {!configured && <details className="connection-help"><summary>本地数据接入说明</summary><p>在本地 .env.local 中配置 <code>TMDB_API_KEY</code> 或 <code>TMDB_API_READ_ACCESS_TOKEN</code>，重启应用后即可联调。</p></details>}
          <button className="primary-button full-width" onClick={() => { setPreview(!preview); setSourceOpen(false); }}>{preview ? "切换真实数据" : "查看预览影片"}</button>
          <Link className="text-link" href="/about" onClick={() => setSourceOpen(false)}>完整来源说明<ArrowUpRight size={14}/></Link>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  </>;
}

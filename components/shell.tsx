"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { ArrowUpRight, Bookmark, CalendarDays, ChevronRight, Compass, Film, Menu, Moon, Search, Sparkles, Star, Sun, TrendingUp, X, CircleHelp, Radio, Check } from "lucide-react";
import { useFrame } from "./providers";

const navigation = [
  {label:"趋势榜单",href:"/",chart:"trending",icon:TrendingUp},
  {label:"人气热门",href:"/?chart=popular",chart:"popular",icon:Sparkles},
  {label:"口碑高分",href:"/?chart=top",chart:"top",icon:Star},
  {label:"正在上映",href:"/?chart=now",chart:"now",icon:Film},
  {label:"即将上映",href:"/?chart=upcoming",chart:"upcoming",icon:CalendarDays},
  {label:"发现好故事",href:"/discover",chart:"discover",icon:Compass},
];

export function FrameShell({children}:{children:ReactNode}) {
  const pathname = usePathname();
  const params = useSearchParams();
  const router = useRouter();
  const {favorites,theme,toggleTheme,preview,setPreview,configured} = useFrame();
  const [menuOpen,setMenuOpen] = useState(false);
  const [sourceOpen,setSourceOpen] = useState(false);
  const chart = pathname === "/discover" ? "discover" : pathname === "/favorites" ? "favorites" : params.get("chart") || "trending";
  const currentMedia = params.get("media") || (pathname.startsWith("/tv/") ? "tv" : "movie");
  const search = () => {
    if (["/","/discover","/favorites"].includes(pathname)) window.dispatchEvent(new Event("frame:search"));
    else router.push("/?focus=search");
  };
  useEffect(()=> {
    const onKey = (event:KeyboardEvent) => {if ((event.metaKey||event.ctrlKey)&&event.key.toLowerCase()==="k") {event.preventDefault();search();}};
    const source=()=>setSourceOpen(true);
    window.addEventListener("keydown",onKey);
    window.addEventListener("frame:source",source);
    return ()=>{window.removeEventListener("keydown",onKey);window.removeEventListener("frame:source",source);};
  });
  const sideContent = <>
    <Link href="/" className="brand" onClick={()=>setMenuOpen(false)} aria-label="FRAME 帧榜首页"><span className="brand-mark"><Film size={19} strokeWidth={1.3}/></span><span><strong>FRAME<span>.</span></strong><small>THE SCREEN INDEX</small></span></Link>
    <div className="nav-label">EXPLORE <span>· 探索</span></div>
    <nav aria-label="主导航" className="side-nav">{navigation.map(({label,href,chart:key,icon:Icon})=><Link key={key} href={key==="discover"?href:`/?chart=${key}&media=${currentMedia==="all"&&key!=="trending"?"movie":currentMedia}${key==="trending"?`&period=${params.get("period")||"day"}`:""}`} className={`nav-item ${chart===key && !pathname.startsWith("/movie") && !pathname.startsWith("/tv") && pathname!=="/about" ? "active" : ""}`} onClick={()=>setMenuOpen(false)}><Icon size={17} strokeWidth={1.6}/><span>{currentMedia==="tv"&&key==="now"?"近期在播":currentMedia==="tv"&&key==="upcoming"?"今日播出":label}</span>{chart===key&&<ChevronRight className="nav-chevron" size={14}/>}</Link>)}</nav>
    <div className="nav-divider"/><div className="nav-label">COLLECTION <span>· 收藏</span></div>
    <Link href="/favorites" onClick={()=>setMenuOpen(false)} className={`nav-item ${pathname==="/favorites"?"active":""}`}><Bookmark size={17} strokeWidth={1.6}/><span>我的收藏</span><span className="nav-count">{favorites.length}</span></Link>
    <div className="side-bottom"><div className="editor-note"><span className="eyebrow">AN INVITATION TO WATCH</span><p>把时间，<br/>留给好故事。</p><span className="editor-signature">LESS SCROLLING. MORE FEELING.</span></div><Link href="/about" className="source-link" onClick={()=>setMenuOpen(false)}><CircleHelp size={14}/><span>关于帧榜与数据来源</span><ArrowUpRight size={13}/></Link><span className="side-caption">一帧一世界，一部一人生。</span></div>
  </>;
  return <>
    <aside className="sidebar">{sideContent}</aside>
    <Dialog.Root open={menuOpen} onOpenChange={setMenuOpen}><Dialog.Portal><Dialog.Overlay className="dialog-overlay"/><Dialog.Content className="mobile-sidebar"><Dialog.Title className="sr-only">导航菜单</Dialog.Title><Dialog.Description className="sr-only">浏览榜单、发现和收藏</Dialog.Description><Dialog.Close className="mobile-close icon-button" aria-label="关闭菜单"><X size={19}/></Dialog.Close>{sideContent}</Dialog.Content></Dialog.Portal></Dialog.Root>
    <main className="main-shell"><header className="topbar"><button className="icon-button menu-trigger" onClick={()=>setMenuOpen(true)} aria-label="打开菜单"><Menu size={20}/></button><div className="topbar-note"><span className="tiny-star">✦</span><span>FILMS, FEELINGS & THE IN-BETWEEN</span></div><div className="topbar-actions"><button className="quick-search" onClick={search} aria-label="搜索电影和剧集"><Search size={16}/><span>搜索好故事</span><kbd>⌘ K</kbd></button><button className="icon-button" onClick={toggleTheme} aria-label={theme==="dark"?"切换浅色主题":"切换深色主题"}>{theme==="dark"?<Sun size={18} strokeWidth={1.5}/>:<Moon size={18} strokeWidth={1.5}/>}</button><button className={`data-status ${preview?"preview":""}`} onClick={()=>setSourceOpen(true)} aria-label={`数据来源：${preview?"设计预览":"TMDB 数据"}`}><span className="status-dot"/><span>{preview?"设计预览":"TMDB 数据"}</span></button></div></header>
      {children}
      <footer className="site-footer"><Link href="/" className="footer-brand">FRAME<span>.</span></Link><p>把好电影，留给好时光。</p><Link href="/about">数据来源 TMDB <ArrowUpRight size={12}/></Link></footer>
    </main>
    <Dialog.Root open={sourceOpen} onOpenChange={setSourceOpen}><Dialog.Portal><Dialog.Overlay className="dialog-overlay"/><Dialog.Content className="info-dialog"><Dialog.Close className="dialog-close icon-button" aria-label="关闭数据说明"><X size={19}/></Dialog.Close><span className="eyebrow">BEHIND THE FRAME</span><Dialog.Title>每一份榜单，都有出处。</Dialog.Title><Dialog.Description>帧榜通过服务器读取 TMDB 数据。日榜与周榜代表关注趋势，更新时间以页面标注为准。</Dialog.Description><div className="connection-info"><Radio size={19}/><div><strong>{configured?"服务器已配置 TMDB":"当前为设计预览"}</strong><p>{configured?"真实榜单由 TMDB 返回，按原始顺序展示。":"预览用于体验界面与交互。样本不代表当日榜单，评分不作展示。"}</p></div></div><p className="source-instruction">{configured?"可随时切换预览与真实数据。":"接入真实数据：在服务器 .env.local 中配置 TMDB_API_READ_ACCESS_TOKEN，然后重启应用。"}</p><button className="primary-button full-width" onClick={()=>{setPreview(!preview);setSourceOpen(false);}}><Check size={16}/>{preview?"查看真实数据模式":"浏览设计预览"}</button><Link className="text-link" href="/about" onClick={()=>setSourceOpen(false)}>查看完整数据说明 <ArrowUpRight size={14}/></Link></Dialog.Content></Dialog.Portal></Dialog.Root>
  </>;
}

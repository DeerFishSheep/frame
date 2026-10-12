"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowDown, ArrowRight, ArrowUpRight, Bookmark, ChevronDown, Clock3, Grid2X2, List, LoaderCircle, RefreshCw, Search, SlidersHorizontal, X } from "lucide-react";
import { DEFAULT_FILTERS, mediaKey, type CatalogFilters, type CatalogResponse, type Chart, type Media } from "@/lib/types";
import { DEMO_MEDIA, getDemoCatalog } from "@/lib/demo";
import { parseFilters } from "@/lib/query";
import { activeFilterCount, chartMeta, formatCount, formatTime, GENRES, serializeFilters } from "@/lib/ui";
import { useFrame } from "./providers";
import { MediaCard, MediaImage, MediaSkeletons } from "./media-card";
import { FilterPanel } from "./filter-panel";

function filterFavorites(items:Media[],filters:CatalogFilters) {
  const query=filters.query.trim().toLowerCase();
  const filtered=items.filter(item=>(filters.media==="all"||item.mediaType===filters.media)&&(!query||`${item.title} ${item.originalTitle} ${item.overview}`.toLowerCase().includes(query))&&(!filters.genres.length||(filters.genreLogic==="and"?filters.genres.every(id=>item.genreIds.includes(Number(id))):filters.genres.some(id=>item.genreIds.includes(Number(id)))))&&(!filters.yearFrom||Number(item.year)>=Number(filters.yearFrom))&&(!filters.yearTo||Number(item.year)<=Number(filters.yearTo))&&(!filters.scoreMin||item.voteAverage>=Number(filters.scoreMin))&&(!filters.scoreMax||item.voteAverage<=Number(filters.scoreMax))&&(!filters.votesMin||item.voteCount>=Number(filters.votesMin)));
  if(filters.sort==="vote_average.desc") filtered.sort((a,b)=>b.voteAverage-a.voteAverage);
  else if(filters.sort==="vote_count.desc") filtered.sort((a,b)=>b.voteCount-a.voteCount);
  else if(filters.sort.includes("date")) filtered.sort((a,b)=>b.releaseDate.localeCompare(a.releaseDate));
  else filtered.sort((a,b)=>b.popularity-a.popularity);
  return filtered;
}

export function Workspace({initialChart}:{initialChart:Chart}) {
  const pathname=usePathname();
  const searchParams=useSearchParams();
  const router=useRouter();
  const {preview,setPreview,favorites,favoritesReady,notify}=useFrame();
  const paramString=searchParams.toString();
  const parsed=useMemo(()=>{
    try {
      const params=new URLSearchParams(paramString);
      if(initialChart!=="trending") params.set("chart",initialChart);
      if(initialChart==="favorites"&&!params.has("media")) params.set("media","all");
      return {filters:parseFilters(params),error:""};
    } catch(err) { return {filters:{...DEFAULT_FILTERS,chart:initialChart},error:err instanceof Error?err.message:"筛选链接无效"}; }
  },[paramString,initialChart]);
  const {filters}=parsed;
  const [query,setQuery]=useState(filters.query);
  const [layout,setLayout]=useState<"grid"|"list">("grid");
  const [response,setResponse]=useState<CatalogResponse|null>(null);
  const [loading,setLoading]=useState(true);
  const [loadingMore,setLoadingMore]=useState(false);
  const [error,setError]=useState("");
  const [moreError,setMoreError]=useState("");
  const [refresh,setRefresh]=useState(0);
  const [favoriteCount,setFavoriteCount]=useState(20);
  const searchInput=useRef<HTMLInputElement>(null);
  const heading=useRef<HTMLElement>(null);
  const requestGeneration=useRef(0);
  const favoriteMode=filters.chart==="favorites";
  const meta=chartMeta(filters.chart,filters.media,filters.period);
  const updateFilters=useCallback((next:CatalogFilters)=>{
    const destination=next.chart==="discover"?"/discover":next.chart==="favorites"?"/favorites":"/";
    router.replace(`${destination}?${serializeFilters({...next,page:1}).toString()}`,{scroll:false});
  },[router]);
  useEffect(()=>{setQuery(filters.query);},[filters.query]);
  useEffect(()=>{
    try {setLayout(localStorage.getItem("frame_layout_v2")==="list"?"list":"grid");} catch { /* Grid is a safe default. */ }
    const focus=()=>{heading.current?.scrollIntoView({behavior:"smooth",block:"start"});searchInput.current?.focus({preventScroll:true});};
    window.addEventListener("frame:search",focus);
    if(searchParams.get("focus")==="search") focus();
    return ()=>window.removeEventListener("frame:search",focus);
  },[]);
  useEffect(()=> {
    if(query===filters.query) return;
    const timer=setTimeout(()=>{
      if(favoriteMode) updateFilters({...filters,query,page:1});
      else updateFilters({...DEFAULT_FILTERS,chart:filters.chart==="discover"?"trending":filters.chart,media:filters.media,period:filters.period,query,page:1});
    },400);
    return ()=>clearTimeout(timer);
  },[query,filters,updateFilters,favoriteMode]);
  useEffect(()=>{
    const generation=++requestGeneration.current;
    setError("");setMoreError("");setLoadingMore(false);setFavoriteCount(20);
    if(parsed.error){setLoading(false);setError(parsed.error);setResponse(null);return;}
    if(favoriteMode){setLoading(false);setResponse(null);return;}
    const controller=new AbortController();
    setLoading(true);setResponse(null);
    const load=async()=>{
      try {
        const data=preview?getDemoCatalog(filters):await fetch(`/api/catalog?${serializeFilters(filters)}`,{signal:controller.signal}).then(async result=>{const json=await result.json();if(!result.ok)throw new Error(json.error||"暂时无法获取榜单");return json as CatalogResponse;});
        if(generation!==requestGeneration.current) return;
        setResponse(data);
      } catch(err) {if(!controller.signal.aborted&&generation===requestGeneration.current)setError(err instanceof Error?err.message:"连接中断，请重试");}
      finally {if(generation===requestGeneration.current)setLoading(false);}
    };
    load();return ()=>controller.abort();
  },[filters,parsed.error,preview,refresh,favoriteMode]);
  const favoriteItems=useMemo(()=>filterFavorites(favorites,filters),[favorites,filters]);
  const items=favoriteMode?favoriteItems.slice(0,favoriteCount):response?.results||[];
  const filtered=activeFilterCount(filters)>0;
  const searchMode=Boolean(filters.query.trim());
  const title=searchMode?`“${filters.query}” 的搜索结果`:meta.title;
  const showRank=!favoriteMode&&!searchMode&&filters.chart!=="discover";
  const shownTotal=favoriteMode?favoriteItems.length:filters.media==="all"&&response?.source==="tmdb"?items.length:response?.totalResults||0;
  const previewSchedule=response?.source==="demo"&&(filters.chart==="now"||filters.chart==="upcoming");
  const feature=(!favoriteMode&&response?.results.find(item=>item.backdropPath))||DEMO_MEDIA.find(item=>item.id===157336)||DEMO_MEDIA[0];
  const genres=GENRES[filters.media==="tv"?"tv":"movie"];
  const quickGenres=genres.filter(item=>[18,878,9648,16,10765].includes(item.id));
  const changeMedia=(media:CatalogFilters["media"])=>updateFilters({...filters,media,genres:[],sort:filters.sort.includes("date")?(media==="tv"?"first_air_date.desc":"primary_release_date.desc"):filters.sort});
  const clearFilters=()=>updateFilters({...DEFAULT_FILTERS,chart:favoriteMode?"favorites":filters.chart,media:filters.media,period:filters.period});
  const toggleLayout=()=>{const next=layout==="grid"?"list":"grid";setLayout(next);try{localStorage.setItem("frame_layout_v2",next);}catch{}};
  const loadMore=async()=> {
    if(favoriteMode){setFavoriteCount(previous=>previous+20);return;}
    if(!response||loadingMore) return;
    const generation=requestGeneration.current;
    setLoadingMore(true);setMoreError("");
    try {
      const nextFilters={...filters,page:response.page+1};
      const next=preview?getDemoCatalog(nextFilters):await fetch(`/api/catalog?${serializeFilters(nextFilters)}`).then(async result=>{const data=await result.json();if(!result.ok)throw new Error(data.error||"更多作品加载失败");return data as CatalogResponse;});
      if(generation!==requestGeneration.current) return;
      setResponse(previous=>previous?{...next,results:[...previous.results,...next.results.filter(item=>!previous.results.some(existing=>mediaKey(existing)===mediaKey(item)))]}:next);
    } catch(err){if(generation===requestGeneration.current)setMoreError(err instanceof Error?err.message:"加载失败，请重试");}
    finally {if(generation===requestGeneration.current)setLoadingMore(false);}
  };
  const hasMore=favoriteMode?favoriteItems.length>favoriteCount:response&&response.page<response.totalPages;
  return <div className="workspace">
    {initialChart==="trending"&&!searchMode&&filters.chart==="trending"&&<section className="hero"><div className="hero-image">{feature&&<MediaImage key={mediaKey(feature)} item={feature} backdrop/>}</div><div className="hero-vignette"/><div className="hero-copy"><div className="hero-kicker"><span/>THE ART OF DISCOVERY <i>·</i> VOL. 01</div><h1>总有一部电影，<br/>值得你<span>为它停留</span><em>.</em></h1><p>把热度交给数据，把选择留给自己。<br/>在每天的光影里，发现值得珍藏的故事。</p><div className="hero-actions"><button className="primary-button" onClick={()=>heading.current?.scrollIntoView({behavior:"smooth",block:"start"})}>探索榜单<ArrowDown size={15}/></button><Link className="hero-secondary" href="/discover">按喜好找片<ArrowRight size={15}/></Link></div></div>{feature&&<Link href={`/${feature.mediaType}/${feature.id}`} className="hero-caption"><span>IN THE FRAME</span><strong>{feature.title}<ArrowUpRight size={13}/></strong></Link>}</section>}
    <section className="rankings" ref={heading} aria-labelledby="workspace-title"><div className="section-heading"><div><span className="eyebrow">{searchMode?"THE SEARCH FOR A STORY":meta.en}</span><h2 id="workspace-title">{title}</h2><p>{searchMode?(preview?"在设计预览样本中搜索。":"在 TMDB 电影与剧集库中搜索。") :meta.description}</p></div><span className="section-side-note"><span/>DISCOVER WHAT MATTERS</span></div>
    {initialChart==="discover"&&<div className="discovery-intro"><SlidersHorizontal size={19} strokeWidth={1.3}/><p>不必漫无目的地翻找。<span>选几个偏好，让下一部好片自己浮现。</span></p><span className="discovery-label">YOUR TASTE. YOUR FRAME.</span></div>}
    <div className="toolbar"><div className="segmented media-tabs" role="group" aria-label="作品形式">{(favoriteMode||filters.chart==="trending"?(["all","movie","tv"] as const):(["movie","tv"] as const)).map(media=><button key={media} className={filters.media===media?"selected":""} aria-pressed={filters.media===media} onClick={()=>changeMedia(media)}>{media==="all"?"全部":media==="movie"?"电影":"剧集"}</button>)}</div><div className="toolbar-right">{filters.chart==="trending"&&!searchMode&&<div className="segmented period-tabs" aria-label="趋势窗口" role="group">{(["day","week"] as const).map(period=><button key={period} aria-pressed={filters.period===period} className={filters.period===period?"selected":""} onClick={()=>updateFilters({...filters,period})}>{period==="day"?"日榜":"周榜"}</button>)}</div>}<FilterPanel filters={filters} onApply={next=>{updateFilters(next);if(!favoriteMode&&next.chart!==filters.chart)notify("已切换到全站探索");}}/><div className="view-controls"><button className="icon-button" onClick={toggleLayout} aria-label={layout==="grid"?"切换列表视图":"切换海报视图"}>{layout==="grid"?<List size={17}/>:<Grid2X2 size={17}/>}</button>{!favoriteMode&&<button className="icon-button" onClick={()=>{setRefresh(previous=>previous+1);if(preview)notify("预览样本已重新加载");}} disabled={loading} aria-label="重新加载榜单"><RefreshCw size={16} className={loading?"spinning":""}/></button>}</div></div></div>
    <div className="search-row"><Search size={17}/><input ref={searchInput} value={query} onChange={event=>setQuery(event.target.value)} placeholder={favoriteMode?"搜索你的收藏作品…":"搜索电影、剧集或原名…"} aria-label={favoriteMode?"搜索收藏":"搜索影视作品"}/>{query&&<button className="search-clear" onClick={()=>setQuery("")} aria-label="清空搜索"><X size={16}/></button>}<kbd>⌘ K</kbd><span>THE FILM IS OUT THERE. FIND IT.</span></div>
    {(filters.chart==="discover"||favoriteMode)&&!searchMode&&<div className="quick-genres"><button className={`filter-chip ${!filters.genres.length?"active":""}`} onClick={()=>updateFilters({...filters,genres:[]})}>全部类型</button>{quickGenres.map(genre=><button key={genre.id} aria-pressed={filters.genres.includes(String(genre.id))} className={`filter-chip ${filters.genres.includes(String(genre.id))?"active":""}`} onClick={()=>updateFilters({...filters,genres:filters.genres.includes(String(genre.id))?filters.genres.filter(id=>id!==String(genre.id)):[...filters.genres,String(genre.id)]})}>{genre.name}</button>)}</div>}
    {(filtered||searchMode)&&<div className="applied-filters">{filters.genres.map(id=><button key={id} onClick={()=>updateFilters({...filters,genres:filters.genres.filter(other=>other!==id)})}>{genres.find(item=>String(item.id)===id)?.name||"类型"}<X size={12}/></button>)}{filters.yearFrom||filters.yearTo?<span>{filters.yearFrom||"最早"} — {filters.yearTo||"至今"}</span>:null}{filters.scoreMin||filters.scoreMax?<span>评分 {filters.scoreMin||0} — {filters.scoreMax||10}</span>:null}{filters.votesMin&&<span>≥ {filters.votesMin} 人评分</span>}{filters.region&&<span>地区 {filters.region}</span>}{filters.language&&<span>语言 {filters.language}</span>}{filters.keywords&&<span>主题筛选</span>}{filters.runtimeMin||filters.runtimeMax?<span>时长 {filters.runtimeMin||0} — {filters.runtimeMax||"不限"} 分钟</span>:null}<button className="clear-all" onClick={clearFilters}>清空条件<X size={12}/></button></div>}
    <div className="data-disclosure"><span>{favoriteMode?"保存在此浏览器 · 无需登录":loading?"正在寻找好故事…":error?"数据连接暂不可用":response?.source==="demo"?"设计预览 · 样本作品，非当日排名；评分不作展示":`${response?.stale?"缓存数据 · ":""}来源 TMDB · ${filters.chart==="discover"?"全站探索结果":searchMode?"搜索结果":"按官方返回顺序"}`}</span><span className="disclosure-meta">{!favoriteMode&&response?.source==="tmdb"&&<><Clock3 size={12}/>{formatTime(response.retrievedAt)}<i>·</i></>}{!loading&&!error&&<>{formatCount(shownTotal)} {filters.media==="all"&&response?.source==="tmdb"?"部已加载":"部作品"}</>}</span></div>
    {loading||(favoriteMode&&!favoritesReady)?<MediaSkeletons/>:error?<div className="empty-state error-state"><div className="empty-icon"><RefreshCw size={27} strokeWidth={1.2}/></div><span className="eyebrow">LET'S TRY AGAIN</span><h3>{parsed.error?"这份筛选链接，需要调整一下。":"故事还在，连接暂时中断。"}</h3><p>{error}</p><div className="empty-actions"><button className="primary-button" onClick={()=>parsed.error?clearFilters():setRefresh(previous=>previous+1)}>{parsed.error?"清空无效条件":"重新加载"}<RefreshCw size={14}/></button>{!parsed.error&&<button className="secondary-button" onClick={()=>setPreview(true)}>浏览设计预览</button>}</div></div>:!items.length?<div className="empty-state"><div className="empty-icon">{favoriteMode?<Bookmark size={28} strokeWidth={1.2}/>:<Search size={28} strokeWidth={1.2}/>}</div><span className="eyebrow">ROOM FOR A GOOD STORY</span><h3>{favoriteMode&&!favorites.length?"把喜欢的故事，留在这里。":previewSchedule?"新故事，需要一份新榜单。":"换一个条件，好故事就在下一页。"}</h3><p>{favoriteMode&&!favorites.length?"点击作品上的书签，收进属于你的片单。":response?.notice||"没有找到符合条件的作品，试试其他类型或年代。"}</p>{favoriteMode&&!favorites.length?<Link href="/" className="primary-button">去发现作品<ArrowRight size={15}/></Link>:previewSchedule?<button className="secondary-button" onClick={()=>window.dispatchEvent(new Event("frame:source"))}>查看数据接入说明<ArrowUpRight size={14}/></button>:<button className="secondary-button" onClick={clearFilters}>清空筛选条件<X size={14}/></button>}</div>:<div className={`media-grid ${layout==="list"?"list-layout":""}`}>{items.map(item=><MediaCard key={mediaKey(item)} item={item} showRank={showRank}/>)}</div>}
    {moreError&&<p className="load-error" role="alert">{moreError}</p>}{hasMore&&!loading&&!error&&<div className="load-more-row"><button className="load-more" onClick={loadMore} disabled={loadingMore}>{loadingMore?<LoaderCircle size={16} className="spinning"/>:<ChevronDown size={16}/>} {loadingMore?"正在寻找更多故事":"再发现一些好故事"}</button><span>已展示 {items.length} 部作品</span></div>}
    </section>
  </div>;
}

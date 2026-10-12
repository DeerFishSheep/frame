"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { ArrowLeft, ArrowUpRight, Bookmark, Clock3, Film, RefreshCw, Star, UserRound } from "lucide-react";
import { getDemoDetail } from "@/lib/demo";
import { imageUrl, mediaKey, type MediaDetail, type MediaType } from "@/lib/types";
import { formatCount, formatTime } from "@/lib/ui";
import { useFrame } from "./providers";
import { MediaImage } from "./media-card";
import { RecommendationsRail } from "./recommendations-rail";
import { formatMediaDate } from "@/lib/media-presentation";

const statusNames:Record<string,string>={Released:"已上映", "Post Production":"后期制作", "In Production":"制作中", Planned:"筹备中", Rumored:"待确认",Canceled:"已取消", "Returning Series":"持续更新", Ended:"已完结", Pilot:"试播"};

function CastPhoto({path,name}:{path:string|null;name:string}) {
  const [failed,setFailed]=useState(false);
  const src=imageUrl(path,"w185");
  return src&&!failed?<img src={src} alt={name} loading="lazy" onError={()=>setFailed(true)}/>:<div className="cast-placeholder"><UserRound size={24} strokeWidth={1}/></div>;
}

export function DetailView({mediaType,id}:{mediaType:MediaType;id:number}) {
  const router=useRouter();
  const {preview,isFavorite,toggle}=useFrame();
  const [item,setItem]=useState<MediaDetail|null>(null);
  const [error,setError]=useState("");
  const [loading,setLoading]=useState(true);
  const [refresh,setRefresh]=useState(0);
  const [retrievedAt,setRetrievedAt]=useState<string|null>(null);
  const [stale,setStale]=useState(false);
  useEffect(()=> {
    const controller=new AbortController();
    setLoading(true);setError("");setItem(null);setRetrievedAt(null);setStale(false);
    const load=async()=>{
      try {
        if(preview) {
          const data=getDemoDetail(mediaType,id);
          if(!data) throw new Error("这部作品不在固定预览样本中。连接 TMDB 后可浏览完整资料。");
          setItem(data);
        } else {
          const response=await fetch(`/api/details/${mediaType}/${id}`,{signal:controller.signal});
          const data=await response.json();
          if(!response.ok)throw new Error(data.error||"暂时无法读取作品资料");
          if(controller.signal.aborted)return;
          setItem(data);
          setRetrievedAt(response.headers.get("X-Data-Retrieved-At"));
          setStale(response.headers.get("X-Data-Stale")==="true");
        }
      }catch(err){if(!controller.signal.aborted)setError(err instanceof Error?err.message:"连接中断，请重试");}
      finally{if(!controller.signal.aborted)setLoading(false);}
    };
    load();window.scrollTo({top:0,behavior:"instant"});return()=>controller.abort();
  },[id,mediaType,preview,refresh]);
  const back=()=>{if(window.history.length>1)router.back();else router.push("/");};
  if (loading) return <div className="detail-workspace" aria-busy="true" aria-label="加载作品详情">
    <button className="back-link" onClick={back}><ArrowLeft size={16}/>返回榜单</button>
    <div className="detail-loading"><div className="skeleton detail-poster"/><div><div className="skeleton skeleton-line"/><div className="skeleton skeleton-line short"/></div></div>
  </div>;
  if(error||!item)return <div className="detail-workspace"><button className="back-link" onClick={back}><ArrowLeft size={16}/>返回榜单</button><div className="empty-state"><Film size={30} strokeWidth={1}/><h2>暂时无法加载详情</h2><p>{error||"作品不存在"}</p><button className="primary-button" onClick={()=>setRefresh(value=>value+1)}>重新加载<RefreshCw size={14}/></button><Link href="/" className="text-link">返回榜单<ArrowRightIcon/></Link></div></div>;
  const saved=isFavorite(item);
  return <div className="detail-workspace">
    <div className="detail-breadcrumb">
      <button className="back-link" onClick={back}><ArrowLeft size={15}/>返回榜单</button>
      <span>{mediaType === "movie" ? "电影档案" : "剧集档案"}<i>/</i>{item.title}</span>
    </div>
    <div className="detail-content">
      <aside className="detail-aside">
        <div className="detail-poster"><MediaImage item={item}/></div>
        <button className={`primary-button full-width ${saved ? "is-saved" : ""}`} onClick={() => toggle(item)} aria-pressed={saved}><Bookmark size={17} fill={saved ? "currentColor" : "none"}/>{saved ? "已收藏" : "加入收藏"}</button>
        <a className="secondary-button full-width" href={`https://www.themoviedb.org/${mediaType}/${id}`} target="_blank" rel="noopener noreferrer">在 TMDB 查看<ArrowUpRight size={15}/></a>
        {item.imdbId && <a className="text-link" href={`https://www.imdb.com/title/${item.imdbId}/`} target="_blank" rel="noopener noreferrer">IMDb 作品页面<ArrowUpRight size={14}/></a>}
      </aside>
      <div className="detail-summary">
        <header className="detail-title">
          <h1>{item.title}</h1>
          {item.originalTitle && item.originalTitle !== item.title && <p className="detail-original">{item.originalTitle}</p>}
          <div className="detail-tags">
            <time dateTime={item.releaseDate || undefined}>{formatMediaDate(item.releaseDate)}</time>
            {item.genres.map(genre => <span key={genre}>{genre}</span>)}
            {!!item.runtime && <span>{item.runtime} 分钟{mediaType === "tv" ? " / 集" : ""}</span>}
            {!!item.numberOfSeasons && <span>{item.numberOfSeasons} 季</span>}
          </div>
        </header>
        <div className="detail-rating-row">
          <div><span className="eyebrow">{item.source === "demo" ? "预览资料" : "TMDB 评分"}</span>
            {item.source === "tmdb" && item.voteAverage > 0
              ? <div className="detail-rating"><Star size={19} fill="currentColor"/><strong>{item.voteAverage.toFixed(1)}</strong><span>/ 10</span><small>{formatCount(item.voteCount)} 人评分</small></div>
              : <p className="detail-no-rating">{item.source === "demo" ? "预览样本 · 评分待接入真实数据" : "暂无评分"}</p>}
          </div>
          <span className="detail-source">{item.source === "demo" ? "预览资料" : <><Clock3 size={13}/>{stale ? "缓存资料 · " : ""}{formatTime(retrievedAt)}</>}</span>
        </div>
      </div>
      <div className="detail-story">
        <section className="story-section"><h2>剧情简介</h2><p className="synopsis">{item.overview || "这部作品暂未提供中文简介。"}</p></section>
        <dl className="film-facts">
          <div><dt>{mediaType === "movie" ? "导演" : "主创"}</dt><dd>{item.directors.join("、") || "暂无资料"}</dd></div>
          <div><dt>{mediaType === "movie" ? "上映日期" : "首播日期"}</dt><dd>{formatMediaDate(item.releaseDate)}</dd></div>
          <div><dt>制片地区</dt><dd>{item.countries.join("、") || "暂无资料"}</dd></div>
          <div><dt>作品状态</dt><dd>{statusNames[item.status] || item.status || "暂无资料"}</dd></div>
        </dl>
        {item.keywords.length > 0 && <section className="story-section keyword-section"><h2>相关主题</h2><div className="keyword-tags">{item.keywords.slice(0, 12).map(keyword => <Link key={keyword.id} href={`/discover?media=${mediaType}&keywords=${keyword.id}`}>{keyword.name}<ArrowUpRight size={11}/></Link>)}</div></section>}
      </div>
    </div>
    {item.cast.length > 0 && <section className="detail-section">
      <div className="subsection-head"><h2>主要演员</h2></div>
      <div className="cast-grid">{item.cast.slice(0, 6).map(actor => <div className="cast-card" key={actor.id}><CastPhoto path={actor.profilePath} name={actor.name}/><strong title={actor.name}>{actor.name}</strong><span title={actor.character}>{actor.character || "角色未提供"}</span></div>)}</div>
    </section>}
    {item.images.length > 0 && <section className="detail-section">
      <div className="subsection-head"><h2>剧照</h2></div>
      <div className="stills-grid">{item.images.slice(0, 3).map(path => <img src={imageUrl(path, "w780") || ""} key={path} alt={`${item.title}剧照`} loading="lazy"/>)}</div>
    </section>}
    <RecommendationsRail key={`${mediaKey(item)}:${item.source}:${refresh}`} initial={item.recommendations} mediaType={mediaType} id={id}/>
  </div>;
}

function ArrowRightIcon(){return <ArrowUpRight size={14}/>;}

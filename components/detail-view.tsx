"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { useAsyncResource } from "@/lib/use-async-resource";
import { ResourceFeedback, resourceLoadingProps } from "./resource-feedback";
import { ArrowLeft, ArrowUpRight, Bookmark, Clock3, Film, RefreshCw, Star, UserRound } from "lucide-react";
import { getDemoDetail } from "@/lib/demo";
import { imageUrl, mediaKey, type DisplayDetail, type MediaType } from "@/lib/types";
import { formatCount, formatTime } from "@/lib/ui";
import { useFrame } from "./providers";
import { MediaImage } from "./media-card";
import { DetailMediaStrip } from "./detail-media-strip";
import { RecommendationsRail } from "./recommendations-rail";
import { formatRegions } from "@/lib/media-regions";
import { formatMediaDate } from "@/lib/media-presentation";
import { mergeCastMembers } from "@/lib/media-cast";
import { useDetailRating } from "@/lib/use-detail-rating";
import { detailFavorite } from "@/lib/detail-rating";
import { sourceLabel } from "@/lib/catalog-sources";
import { ResourceSearchProvider, ResourceSearchButton, ResourceSearchResults } from "./resource-search";
import { doubanImageUrl } from "@/lib/media-artwork";
import { catalogNavigationHref } from "@/lib/catalog-navigation";
import { readViewState } from "@/lib/view-state";

const statusNames:Record<string,string>={Released:"已上映", "Post Production":"后期制作", "In Production":"制作中", Planned:"筹备中", Rumored:"待确认",Canceled:"已取消", "Returning Series":"持续更新", Ended:"已完结", Pilot:"试播"};
const detailImage = (path: string | null, size: string) => {
  const douban = path && doubanImageUrl(path);
  return douban ? `/api/images/douban?url=${encodeURIComponent(douban)}` : imageUrl(path, size);
};

function StillPhoto({ path, title, index }: { path: string; title: string; index: number }) {
  const [failed, setFailed] = useState(false);
  const src = detailImage(path, "w780");
  return <div className="still-photo" data-skeleton="block">{src && !failed
    ? <img src={src} alt={`${title}剧照 ${index + 1}`} loading="lazy" onError={() => setFailed(true)}/>
    : <div className="still-placeholder" role="img" aria-label="剧照暂无法加载"><Film size={24}/><span>剧照暂无法加载</span></div>}</div>;
}

function CastPhoto({path,name}:{path:string|null;name:string}) {
  const [failed,setFailed]=useState(false);
  const src=detailImage(path,"w185");
  return <div data-skeleton="block">{src&&!failed?<img src={src} alt={name} loading="lazy" onError={()=>setFailed(true)}/>:<div className="cast-placeholder"><UserRound size={24} strokeWidth={1}/></div>}</div>;
}

export function DetailView({mediaType: requestedMediaType,id: requestedId,provider="tmdb"}:{mediaType:MediaType;id:number|string;provider?:"tmdb"|"douban"}) {
  const router=useRouter(), params=useSearchParams();
  const {preview,isFavorite,toggle}=useFrame();
  const detailParams = new URLSearchParams();
  if (provider === "tmdb") for (const key of ["source", "doubanId", "season"]) for (const value of params.getAll(key)) detailParams.append(key, value);
  const detailQuery = detailParams.toString(), detailKey = `detail:v3:${provider}:${provider === "tmdb" && preview}:${requestedMediaType}:${requestedId}:${detailQuery}`;
  const resource = useAsyncResource<{ item: DisplayDetail; retrievedAt: string | null; stale: boolean }>({
    key: detailKey, group: detailKey, keepPrevious: false,
    load: async signal => {
      if (preview && provider === "tmdb") {
        if (detailParams.has("season")) throw new Error("分季详情需要连接 TMDB 后查看。");
        const item = getDemoDetail(requestedMediaType, Number(requestedId));
        if (!item) throw new Error("这部作品不在固定预览样本中。连接 TMDB 后可浏览完整资料。");
        return { item, retrievedAt: null, stale: false };
      }
      const endpoint = provider === "douban" ? `/api/douban/details/${requestedMediaType}/${requestedId}` : `/api/details/${requestedMediaType}/${requestedId}${detailQuery ? `?${detailQuery}` : ""}`;
      const response = await fetch(endpoint, { signal });
      const item = await response.json();
      if (!response.ok) throw new Error(item.error || "暂时无法读取作品资料");
      return { item, retrievedAt: response.headers.get("X-Data-Retrieved-At"), stale: response.headers.get("X-Data-Stale") === "true" };
    },
  });
  const item = resource.current ? resource.data?.item : undefined, error = resource.error, loading = resource.pending;
  const { context: ratingContext, rating, pending: ratingPending, retry: retryRating } = useDetailRating(item, requestedMediaType, requestedId, provider);
  const retrievedAt = resource.data?.retrievedAt ?? null, stale = resource.data?.stale ?? false;
  const mediaType = item?.mediaType ?? requestedMediaType, id = item?.id ?? requestedId;
  const backHref = () => catalogNavigationHref(requestedMediaType, `${provider === "douban" ? "/douban" : ""}/${requestedMediaType}/${requestedId}`, detailParams, key => readViewState<string | undefined>(key, undefined));
  const back=()=>{if(window.history.length>1)router.back();else router.push(backHref());};
  if (loading && !item) return <div className="detail-workspace" aria-busy="true" aria-label="加载作品详情">
    <button className="back-link" onClick={back}><ArrowLeft size={16}/>返回榜单</button>
    <div className="detail-loading"><div className="skeleton detail-poster"/><div><div className="skeleton skeleton-line"/><div className="skeleton skeleton-line short"/></div></div>
  </div>;
  if(!item)return <div className="detail-workspace"><button className="back-link" onClick={back}><ArrowLeft size={16}/>返回榜单</button><div className="empty-state"><Film size={30} strokeWidth={1}/><h2>暂时无法加载详情</h2><p>{error||"作品不存在"}</p><button className="primary-button" onClick={resource.refresh}>重新加载<RefreshCw size={14}/></button><Link href={backHref()} className="text-link">返回榜单<ArrowRightIcon/></Link></div></div>;
  const saved=isFavorite(item);
  const displayedSeason = item.sourceSeasonNumber ?? item.seasonNumber;
  // Old browser snapshots can predate server-side credit deduplication.
  const cast = mergeCastMembers(item.cast);
  return <ResourceSearchProvider item={item}><div className="detail-workspace resource-region" aria-busy={loading}>
    <ResourceFeedback pending={loading} error={error} retained onRetry={resource.refresh}/>
    <div className="detail-breadcrumb" data-scroll-anchor="detail-heading">
      <button className="back-link" onClick={back}><ArrowLeft size={15}/>返回榜单</button>
      <span>{mediaType === "movie" ? "电影档案" : "剧集档案"}<i>/</i>{item.title}</span>
    </div>
    <div className="detail-content" {...resourceLoadingProps(loading)}>
      <aside className="detail-aside">
        <div className="detail-poster" data-skeleton="block"><MediaImage item={item}/></div>
        <div className="detail-actions" data-skeleton="block">
          <button className={`primary-button full-width ${saved ? "is-saved" : ""}`} disabled={ratingPending} onClick={() => toggle(detailFavorite(item, rating, ratingContext))} aria-pressed={saved}><Bookmark size={17} fill={saved ? "currentColor" : "none"}/>{saved ? "已收藏" : "加入收藏"}</button>
          <ResourceSearchButton/>
        </div>
      </aside>
      <div className="detail-main">
        <div className="detail-summary">
          <header className="detail-title">
            <h1 data-skeleton="line">{item.title}{item.originalTitle && item.originalTitle !== item.title && <> <span className="detail-original">（{item.originalTitle}）</span></>}</h1>
            <div className="detail-tags" data-skeleton="line">
              <time dateTime={item.releaseDate || undefined}>{formatMediaDate(item.releaseDate)}</time>
              {formatRegions(item.countryCodes) && <span className="detail-region">{formatRegions(item.countryCodes)}</span>}
              {item.genres.map(genre => <span key={genre}>{genre}</span>)}
              {!!item.runtime && <span>{item.runtime} 分钟{mediaType === "tv" ? " / 集" : ""}</span>}
              {displayedSeason ? <span>第 {displayedSeason} 季{item.numberOfEpisodes ? ` · ${item.numberOfEpisodes} 集` : ""}</span> : !!item.numberOfSeasons && <span>{item.numberOfSeasons} 季</span>}
            </div>
          </header>
          <div className="detail-rating-row" data-skeleton="line">
            <div className="detail-rating-block" {...resourceLoadingProps(ratingPending)} aria-busy={ratingPending}><span className="eyebrow" data-skeleton="line">{item.source === "demo" ? "预览资料" : `${sourceLabel(rating.source)} 评分`}</span>
              {item.source !== "demo" && rating.voteAverage > 0
                ? <div className="detail-rating" data-skeleton="line"><Star size={19} fill="currentColor"/><strong>{rating.voteAverage.toFixed(1)}</strong><span>/ 10</span>{rating.voteCount > 0 && <small>{formatCount(rating.voteCount)} 人评分</small>}</div>
                : <p className="detail-no-rating">{item.source === "demo" ? "预览样本 · 评分待接入真实数据" : "暂无评分"}</p>}
              {rating.fallback && !ratingPending && <p className="detail-rating-note">{sourceLabel(ratingContext.source)}{rating.fallback === "missing" ? "暂无对应评分" : "评分暂不可用"}，显示 TMDB{rating.fallback === "unavailable" && <button className="text-button" onClick={retryRating}>重试</button>}</p>}
            </div>
            <span className="detail-source">{item.source === "demo" ? "预览资料" : <><Clock3 size={13}/>{stale ? "缓存资料 · " : ""}{formatTime(retrievedAt)}</>}</span>
          </div>
        </div>
        <div className="detail-story">
          <section className="story-section"><h2>剧情简介</h2><p className="synopsis" data-skeleton="text">{item.overview || "这部作品暂未提供中文简介。"}</p></section>
          <dl className="film-facts" data-skeleton="text">
            <div><dt>{mediaType === "movie" ? "导演" : "主创"}</dt><dd>{item.directors.join("、") || "暂无资料"}</dd></div>
            <div><dt>{mediaType === "movie" ? "上映日期" : "首播日期"}</dt><dd>{formatMediaDate(item.releaseDate)}</dd></div>
            <div><dt>制片地区</dt><dd>{item.countries.join("、") || "暂无资料"}</dd></div>
            {displayedSeason ? <div><dt>本季集数</dt><dd>{item.numberOfEpisodes ? `${item.numberOfEpisodes} 集` : "暂无资料"}</dd></div> : <div><dt>作品状态</dt><dd>{statusNames[item.status] || item.status || "暂无资料"}</dd></div>}
          </dl>
        </div>
      </div>
    </div>
    <ResourceSearchResults/>
    {cast.length > 0 && <DetailMediaStrip pending={loading} title="主要演员" kind="cast" stateKey={mediaKey(item)}>
      {cast.map(actor => <div className="cast-card" key={actor.id}><CastPhoto path={actor.profilePath} name={actor.name}/><strong data-skeleton="line" title={actor.name}>{actor.name}</strong><span data-skeleton="line" title={actor.character}>{actor.character || "角色未提供"}</span></div>)}
    </DetailMediaStrip>}
    {item.images.length > 0 && <DetailMediaStrip pending={loading} title="剧照" kind="stills" stateKey={mediaKey(item)}>
      {item.images.map((path, index) => <StillPhoto key={path} path={path} title={item.title} index={index}/>)}
    </DetailMediaStrip>}
    {typeof id === "number" && <RecommendationsRail pending={loading} key={`${mediaKey(item)}:${item.source}`} source={item.source} initial={item.recommendations} mediaType={mediaType} id={id}/>}
  </div></ResourceSearchProvider>;
}

function ArrowRightIcon(){return <ArrowUpRight size={14}/>;}

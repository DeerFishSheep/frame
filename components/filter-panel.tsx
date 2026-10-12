"use client";

import { useEffect, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { Check, ChevronDown, RotateCcw, Search, SlidersHorizontal, X } from "lucide-react";
import { DEFAULT_FILTERS, type CatalogFilters } from "@/lib/types";
import { activeFilterCount, GENRES } from "@/lib/ui";
import { useFrame } from "./providers";

function KeywordPicker({value,onChange}:{value:string;onChange:(value:string)=>void}) {
  const {preview} = useFrame();
  const [query,setQuery] = useState("");
  const [options,setOptions] = useState<{id:number;name:string}[]>([]);
  const [names,setNames] = useState<Record<string,string>>({});
  const [message,setMessage] = useState("");
  const ids = value.split(/[,|]/).filter(Boolean);
  useEffect(()=> {
    setOptions([]);setMessage("");
    if (query.trim().length<2) return;
    if (preview) {setMessage("主题搜索在连接 TMDB 后可用");return;}
    const controller = new AbortController();
    const timer = setTimeout(async()=>{
      try {
        const response = await fetch(`/api/keywords?query=${encodeURIComponent(query)}`,{signal:controller.signal});
        const data = await response.json();
        if(!response.ok) throw new Error(data.error||"主题搜索暂不可用");
        setOptions(data.results.slice(0,8));
        if(!data.results.length) setMessage("没有找到主题，试试英文关键词");
      } catch(error) {if(!controller.signal.aborted) setMessage(error instanceof Error?error.message:"主题搜索暂不可用");}
    },350);
    return ()=>{clearTimeout(timer);controller.abort();};
  },[query,preview]);
  return <div className="keyword-picker"><div className="input-with-icon"><Search size={15}/><input value={query} onChange={event=>setQuery(event.target.value)} placeholder="搜索主题，例如 time loop" aria-label="搜索主题关键词"/></div>{options.length>0&&<div className="keyword-options">{options.map(option=><button key={option.id} type="button" onClick={()=>{setNames({...names,[option.id]:option.name});onChange([...new Set([...ids,String(option.id)])].join(","));setQuery("");setOptions([]);}}>{option.name}<span>添加</span></button>)}</div>}{message&&<p className="field-hint">{message}</p>}{ids.length>0&&<div className="selected-keywords">{ids.map(id=><button type="button" className="filter-chip active" key={id} onClick={()=>onChange(ids.filter(other=>other!==id).join(","))}>{names[id]||`主题 ${id}`}<X size={12}/></button>)}</div>}</div>;
}

export function FilterPanel({filters,onApply}:{filters:CatalogFilters;onApply:(next:CatalogFilters)=>void}) {
  const {preview}=useFrame();
  const [open,setOpen] = useState(false);
  const [draft,setDraft] = useState(filters);
  const [error,setError] = useState("");
  const count = activeFilterCount(filters);
  const favorites = filters.chart==="favorites";
  const media = draft.media === "tv" ? "tv" : "movie";
  const update = (patch:Partial<CatalogFilters>)=>setDraft(previous=>({...previous,...patch}));
  const apply = (event:React.FormEvent<HTMLFormElement>)=> {
    event.preventDefault();
    if(draft.yearFrom&&draft.yearTo&&Number(draft.yearFrom)>Number(draft.yearTo)) {setError("起始年份不能晚于结束年份");return;}
    if(draft.scoreMin&&draft.scoreMax&&Number(draft.scoreMin)>Number(draft.scoreMax)) {setError("最低评分不能高于最高评分");return;}
    if(draft.runtimeMin&&draft.runtimeMax&&Number(draft.runtimeMin)>Number(draft.runtimeMax)) {setError("最短时长不能大于最长时长");return;}
    onApply({...draft,keywords:draft.keywords.split(/[,|]/).filter(Boolean).join(draft.genreLogic==="and"?",":"|"),media:favorites?draft.media:media,chart:favorites?"favorites":"discover",query:favorites?draft.query:"",page:1});
    setOpen(false);
  };
  return <Dialog.Root open={open} onOpenChange={value=>{setOpen(value);if(value){setDraft(filters);setError("");}}}><Dialog.Trigger asChild><button className={`filter-button ${count?"has-filters":""}`}><SlidersHorizontal size={16}/><span>筛选</span>{count>0&&<span className="filter-count">{count}</span>}<ChevronDown size={12}/></button></Dialog.Trigger><Dialog.Portal><Dialog.Overlay className="dialog-overlay"/><Dialog.Content className="filter-dialog"><div className="filter-dialog-head"><div><span className="eyebrow">FIND YOUR NEXT FAVORITE</span><Dialog.Title>{favorites?"整理你的片单":"每一个偏好，都值得被看见。"}</Dialog.Title><Dialog.Description>{favorites?"筛选保存在当前浏览器的作品。":preview?"设计预览：筛选仅作用于固定作品样本。":"组合条件，在 TMDB 全部作品中探索。"}</Dialog.Description></div><Dialog.Close className="icon-button" aria-label="关闭筛选"><X size={20}/></Dialog.Close></div><form onSubmit={apply}><div className="filter-dialog-body">
    {!favorites&&<fieldset><legend>故事的形式</legend><div className="segmented wide">{(["movie","tv"] as const).map(type=><button type="button" key={type} className={media===type?"selected":""} onClick={()=>update({media:type,genres:[]})}>{type==="movie"?"电影":"剧集"}</button>)}</div></fieldset>}
    <fieldset><div className="legend-line"><legend>喜欢的类型</legend><select aria-label="类型组合逻辑" value={draft.genreLogic} onChange={event=>update({genreLogic:event.target.value as "or"|"and"})}><option value="or">包含任一类型</option><option value="and">同时包含所有类型</option></select></div><div className="genre-options">{GENRES[media].map(genre=><button type="button" key={genre.id} className={`filter-chip ${draft.genres.includes(String(genre.id))?"active":""}`} aria-pressed={draft.genres.includes(String(genre.id))} onClick={()=>update({genres:draft.genres.includes(String(genre.id))?draft.genres.filter(id=>id!==String(genre.id)):[...draft.genres,String(genre.id)]})}>{draft.genres.includes(String(genre.id))&&<Check size={12}/>} {genre.name}</button>)}</div></fieldset>
    <div className="filter-fields"><fieldset><legend>上映年代</legend><div className="range-fields"><input type="number" min="1870" max="2100" placeholder="起始年份" aria-label="起始年份" value={draft.yearFrom} onChange={event=>update({yearFrom:event.target.value})}/><span>—</span><input type="number" min="1870" max="2100" placeholder="至今" aria-label="结束年份" value={draft.yearTo} onChange={event=>update({yearTo:event.target.value})}/></div></fieldset><fieldset><legend>TMDB 评分</legend><div className="range-fields"><input type="number" min="0" max="10" step="0.1" placeholder="最低分" aria-label="最低评分" value={draft.scoreMin} onChange={event=>update({scoreMin:event.target.value})}/><span>—</span><input type="number" min="0" max="10" step="0.1" placeholder="10" aria-label="最高评分" value={draft.scoreMax} onChange={event=>update({scoreMax:event.target.value})}/></div></fieldset><fieldset><legend>评分人数</legend><select value={draft.votesMin} onChange={event=>update({votesMin:event.target.value})} aria-label="最低评分人数"><option value="">不限</option><option value="100">至少 100 人</option><option value="500">至少 500 人</option><option value="1000">至少 1,000 人</option><option value="5000">至少 5,000 人</option></select></fieldset><fieldset><legend>排序方式</legend><select value={draft.sort} onChange={event=>update({sort:event.target.value})} aria-label="排序方式"><option value="popularity.desc">关注热度优先</option><option value="vote_average.desc">评分从高到低</option><option value={media==="tv"?"first_air_date.desc":"primary_release_date.desc"}>最近上映优先</option><option value="vote_count.desc">评分人数优先</option></select></fieldset></div>
    {!favorites&&<><div className="filter-fields"><fieldset><legend>制片地区</legend><select value={draft.region} onChange={event=>update({region:event.target.value})} aria-label="制片地区"><option value="">全部地区</option><option value="CN">中国大陆</option><option value="HK">中国香港</option><option value="TW">中国台湾</option><option value="US">美国</option><option value="GB">英国</option><option value="FR">法国</option><option value="JP">日本</option><option value="KR">韩国</option><option value="IN">印度</option></select></fieldset><fieldset><legend>原始语言</legend><select value={draft.language} onChange={event=>update({language:event.target.value})} aria-label="原始语言"><option value="">全部语言</option><option value="zh">普通话</option><option value="cn">粤语</option><option value="en">英语</option><option value="ja">日语</option><option value="ko">韩语</option><option value="fr">法语</option><option value="es">西班牙语</option></select></fieldset><fieldset className="span-two"><legend>{media==="tv"?"单集时长":"影片时长"}<span> / 分钟</span></legend><div className="range-fields"><input type="number" min="0" max="1000" placeholder="最短时长" aria-label="最短时长" value={draft.runtimeMin} onChange={event=>update({runtimeMin:event.target.value})}/><span>—</span><input type="number" min="0" max="1000" placeholder="最长时长" aria-label="最长时长" value={draft.runtimeMax} onChange={event=>update({runtimeMax:event.target.value})}/></div></fieldset></div><fieldset><legend>主题关键词</legend><KeywordPicker value={draft.keywords} onChange={value=>update({keywords:value})}/><p className="field-hint">多个主题按上方“任一 / 同时包含”的方式组合。</p></fieldset></>}
    {error&&<p className="form-error" role="alert">{error}</p>}</div><div className="filter-dialog-foot"><button type="button" className="text-button" onClick={()=>{setDraft({...DEFAULT_FILTERS,chart:filters.chart,media});setError("");}}><RotateCcw size={14}/>重置条件</button><button className="primary-button" type="submit">{favorites?"筛选片单":"发现作品"}<Check size={16}/></button></div></form></Dialog.Content></Dialog.Portal></Dialog.Root>;
}

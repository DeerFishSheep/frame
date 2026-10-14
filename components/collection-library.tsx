"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState, type FormEvent } from "react";
import { ArrowLeft, ArrowRight, ArrowUpRight, Bookmark, Film, Plus, RefreshCw } from "lucide-react";
import { collectionDirectory, collectionFallback, collectionHref, collectionKey, collectionKind, PRESET_COLLECTIONS, type CollectionRef, type CollectionSummary } from "@/lib/collections";
import { useCollection } from "@/lib/use-collection";
import { defaultDoubanFilters, doubanListUrl, doubanParams, parseDoubanListUrl } from "@/lib/douban/query";
import { useFrame } from "./providers";
import { MediaImage } from "./media-card";
import { resourceLoadingProps, ResourceFeedback } from "./resource-feedback";
import { ProviderCatalog } from "./provider-catalog";
import type { CatalogResponse } from "@/lib/types";

function CollectionCover({ item }: { item: CollectionSummary }) {
  return <div className="collection-cover" data-skeleton="block" aria-label="片单三张海报封面">
    {Array.from({ length: 3 }, (_, index) => <div className="collection-poster" key={index}>{item.preview[index] ? <MediaImage item={item.preview[index]}/> : <div className="collection-poster-empty"><Film size={25} strokeWidth={1}/></div>}</div>)}
  </div>;
}
function CollectionOrigin({ item }: { item: CollectionSummary }) {
  return <div className="collection-origin" data-skeleton="line"><span className="collection-source"><span className="platform-icon platform-icon--douban"><img src="/platforms/douban.svg" alt=""/></span>豆瓣</span><span>·</span><span>{collectionKind(item.kind)}</span>{item.creator && item.creator !== "豆瓣" && <><span>·</span><span className="collection-creator" title={item.creator}>{item.creator}</span></>}</div>;
}
function CollectionImport() {
  const router = useRouter(), [url, setUrl] = useState(""), [error, setError] = useState("");
  const submit = (event: FormEvent) => {
    event.preventDefault();
    try { const id = parseDoubanListUrl(url); setError(""); router.push(collectionHref({ source: "douban", id })); }
    catch (error) { setError(error instanceof Error ? error.message : "片单链接无效。"); }
  };
  return <details className="collection-importer"><summary><Plus size={16}/>打开豆瓣片单</summary><form onSubmit={submit}>
    <label><span className="sr-only">豆瓣片单链接</span><input type="url" aria-label="豆瓣片单链接" value={url} maxLength={2048} placeholder="粘贴豆列或榜单链接" onChange={event => setUrl(event.target.value)}/></label>
    <button type="submit" className="primary-button">打开片单<ArrowRight size={16}/></button>
  </form>{error && <p className="load-error" role="alert">{error}</p>}</details>;
}
function CollectionCard({ reference }: { reference: CollectionRef }) {
  const { collections, toggleCollection } = useFrame(), resource = useCollection(reference);
  const saved = collections.find(item => collectionKey(item) === collectionKey(reference));
  const item = resource.data || saved || collectionFallback(reference);
  return <article className="collection-card" data-scroll-anchor={`collection:${collectionKey(reference)}`}>
    <div {...resourceLoadingProps(resource.pending)}>
      <Link className="collection-card-link" href={collectionHref(reference)} aria-label={`查看片单：${item.title}`}>
        <CollectionCover item={item}/>
      </Link>
      <div className="collection-card-copy">
        <Link className="collection-title-link" href={collectionHref(reference)}><h2 data-skeleton="line" title={item.title}>{item.title}</h2></Link>
        <span className="collection-count" data-skeleton="line">{item.count === null ? "数量待更新" : `${item.count.toLocaleString("zh-CN")} ${item.unit}`}</span>
        <button className={`icon-button collection-save ${saved ? "is-saved" : ""}`} aria-pressed={!!saved} disabled={!resource.data && !saved} onClick={() => toggleCollection(item)} aria-label={`${saved ? "取消收藏片单" : "收藏片单"}：${item.title}`}><Bookmark size={17} fill={saved ? "currentColor" : "none"}/></button>
      </div>
    </div>
    {resource.error && <div className="collection-card-error" role="status"><span>片单资料暂时无法更新</span><button className="text-button" onClick={resource.refresh}><RefreshCw size={13}/>重试</button></div>}
  </article>;
}

export function CollectionDirectory({ savedOnly = false }: { savedOnly?: boolean }) {
  const { collections, favoritesReady } = useFrame(), params = useSearchParams();
  const query = savedOnly ? (params.get("query") || "").trim().toLocaleLowerCase() : "";
  const refs = (savedOnly ? collections : collectionDirectory(collections)).filter(ref => !query || ref.title.toLocaleLowerCase().includes(query));
  return <section className="collection-library" aria-labelledby="collection-library-title">
    <header className="collection-library-heading" data-scroll-anchor="collection-directory-heading"><div><h1 id="collection-library-title">{savedOnly ? "收藏的片单" : "片单"}</h1><p>{savedOnly ? "收藏整个片单，随时接着看。" : "先选一个主题，再慢慢挑片。"}</p></div>{!savedOnly && <CollectionImport/>}</header>
    {!savedOnly && <div className="collection-directory-links"><span>精选主题</span><Link href="/favorites?section=lists">收藏的片单{collections.length > 0 ? ` ${collections.length}` : ""}<ArrowRight size={14}/></Link></div>}
    {savedOnly && !favoritesReady ? <div className="collection-grid" aria-busy="true">{Array.from({ length: 4 }, (_, i) => <div key={i} className="skeleton collection-cover"/>)}</div>
      : refs.length ? <div className="collection-grid">{refs.map(reference => <CollectionCard key={collectionKey(reference)} reference={reference}/>)}</div>
      : <div className="empty-state"><Bookmark size={30}/><h2>{query ? "没有找到这个片单" : "还没有收藏片单"}</h2><p>在片单封面或详情页点击收藏，就能保存整个片单。</p><Link href="/lists" className="primary-button">浏览片单<ArrowRight size={16}/></Link></div>}
  </section>;
}

export function CollectionDetail({ id }: { id: string }) {
  const router = useRouter(), { collections, toggleCollection } = useFrame();
  const reference: CollectionRef = PRESET_COLLECTIONS.find(item => item.id === id) || { id, source: "douban", title: "豆瓣片单" };
  const saved = collections.find(item => collectionKey(item) === collectionKey(reference)), resource = useCollection(reference);
  const item = resource.data || saved || collectionFallback(reference), filters = { ...defaultDoubanFilters("movie", "lists"), list: id };
  const back = () => window.history.length > 1 ? router.back() : router.push("/lists");
  return <div className="collection-detail">
    <button className="back-link" onClick={back}><ArrowLeft size={15}/>返回片单</button>
    <div className="collection-hero" {...resourceLoadingProps(resource.pending)}>
      <CollectionCover item={item}/>
      <div className="collection-hero-copy"><CollectionOrigin item={item}/><h1 data-skeleton="line">{item.title}</h1>
        <p className="collection-size" data-skeleton="line">{item.count === null ? "正在读取片单资料" : `${item.count.toLocaleString("zh-CN")} ${item.unit}`}</p>
        <div className="collection-hero-actions" data-skeleton="block"><button className="primary-button" aria-pressed={!!saved} disabled={!resource.data && !saved} onClick={() => toggleCollection(item)}><Bookmark size={17} fill={saved ? "currentColor" : "none"}/>{saved ? "已收藏片单" : "收藏整个片单"}</button><a className="secondary-button" href={doubanListUrl(id)} target="_blank" rel="noopener noreferrer">豆瓣原片单<ArrowUpRight size={15}/></a></div>
      </div>
    </div>
    <ResourceFeedback pending={resource.pending} retained error={resource.error} onRetry={resource.refresh}/>
    <ProviderCatalog source="douban" queryKey={doubanParams(filters).toString()} page={1} title="片单影片" ranked={id.startsWith("collection:")} originalUrl={doubanListUrl(id)} originalLabel="查看原片单" countLabel="原片单"
      featured={false} resourceGroup={`collection-feed:${id}`} charts={[]} onReset={() => router.push("/lists")}
      loadPage={async (page, signal) => {
        const response = await fetch(`/api/douban?${doubanParams({ ...filters, page })}`, { signal }), data = await response.json();
        if (!response.ok) throw new Error(data.error || "片单影片暂时无法加载。");
        if (data.source !== "douban" || data.page !== page || !Array.isArray(data.results)) throw new Error("片单分页无效，请重试。");
        return data as CatalogResponse;
      }}/>
  </div>;
}

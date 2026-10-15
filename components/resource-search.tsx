"use client";

import { createContext, useCallback, useContext, useId, useLayoutEffect, useRef, useState, type CSSProperties, type FormEvent, type ReactNode } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { ArrowUpRight, Check, ChevronLeft, ChevronRight, Cloud, Link as LinkIcon, LoaderCircle, Magnet, RefreshCw, Search, SlidersHorizontal, X } from "lucide-react";
import { RESOURCE_CHANNELS } from "@/lib/pansou/channels";
import type { ResourceChannel, ResourceItem, ResourceSearchQuery, ResourceSearchResult } from "@/lib/pansou/types";
import { mediaKey, type MediaDetail } from "@/lib/types";
import { useAsyncResource } from "@/lib/use-async-resource";
import { useStableUpdate } from "@/lib/use-stable-update";
import { useViewState } from "@/lib/view-state";
import { resourcePageForSize, resourcePageSize, resourcePagination } from "@/lib/resource-pagination";
import { normalizeResourceChannels } from "@/lib/resource-preferences";
import { resourceCopyText } from "@/lib/resource-copy";
import { resourceLoadingProps } from "./resource-feedback";
import { useFrame } from "./providers";
import styles from "./resource-search.module.css";

const CHANNEL_PREFERENCE = "frame_resource_channels_v1";
const SEARCH_STATE_VERSION = "v2";
const allChannels = () => RESOURCE_CHANNELS.map(channel => channel.id);
const channelInfo = (id: ResourceChannel) => RESOURCE_CHANNELS.find(channel => channel.id === id)!;
const queryKey = (query: ResourceSearchQuery | null) => query ? JSON.stringify([query.keyword, query.channels]) : "idle";

interface SearchView {
  query: ResourceSearchQuery | null;
  channel: ResourceChannel | "all";
  page: number;
  pageSize: number;
}
interface ResourceSearchContextValue {
  open: boolean;
  openPicker: (anchor: HTMLButtonElement) => void;
  view: SearchView;
  setChannel: (channel: ResourceChannel | "all") => void;
  setPage: (page: number) => void;
  resource: ReturnType<typeof useAsyncResource<ResourceSearchResult>>;
  resultId: string;
  panelId: string;
}
const ResourceSearchContext = createContext<ResourceSearchContextValue | null>(null);
const useResourceSearch = () => {
  const context = useContext(ResourceSearchContext);
  if (!context) throw new Error("ResourceSearchProvider is missing");
  return context;
};

function readChannels(): ResourceChannel[] {
  try {
    const saved: unknown = JSON.parse(localStorage.getItem(CHANNEL_PREFERENCE) || "null");
    return normalizeResourceChannels(saved);
  } catch { /* Channel selection still works when browser storage is unavailable. */ }
  return allChannels();
}

/** Scope both requests and browsing state to one title, including when the route reuses its component. */
export function ResourceSearchProvider({ item, children }: { item: MediaDetail; children: ReactNode }) {
  return <ResourceSearchState key={`${SEARCH_STATE_VERSION}:${mediaKey(item)}`} item={item}>{children}</ResourceSearchState>;
}

function ResourceSearchState({ item, children }: { item: MediaDetail; children: ReactNode }) {
  const identity = mediaKey(item);
  const [view, setView] = useViewState<SearchView>(`resource-search:${SEARCH_STATE_VERSION}:${identity}`, { query: null, channel: "all", page: 1, pageSize: resourcePageSize(false) });
  const [open, setOpen] = useState(false);
  const [mobile, setMobile] = useState(false);
  const [keyword, setKeyword] = useState(item.title);
  const [channels, setChannels] = useState<ResourceChannel[]>(allChannels);
  const [position, setPosition] = useState({ left: 16, top: 16 });
  const [submitSequence, setSubmitSequence] = useState(0);
  const submittedClose = useRef(false);
  const anchor = useRef<HTMLButtonElement | null>(null), panel = useRef<HTMLDivElement>(null);
  const prepare = useStableUpdate();
  const id = useId(), resultId = `resource-results-${id}`, panelId = `resource-picker-${id}`;
  const resource = useAsyncResource<ResourceSearchResult>({
    key: `resources:${SEARCH_STATE_VERSION}:${identity}:${queryKey(view.query)}`, group: `resources:${SEARCH_STATE_VERSION}:${identity}`, enabled: Boolean(view.query),
    load: async signal => {
      let response: Response;
      try {
        response = await fetch("/api/resources/search", {
          method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(view.query), signal,
        });
      } catch (error) {
        if (signal.aborted) throw error;
        throw new Error("资源搜索连接失败，请重试。");
      }
      let body;
      try { body = await response.json(); } catch { throw new Error("搜索响应暂时无法读取，请重试。"); }
      if (!response.ok) throw new Error(typeof body?.error === "string" ? body.error : "资源搜索暂时失败，请重试。");
      if (!body || !Array.isArray(body.items)) throw new Error("搜索响应暂时无法读取，请重试。");
      return body as ResourceSearchResult;
    },
  });

  // Only an explicit submission moves the viewport; refreshes and result updates do not.
  useLayoutEffect(() => {
    if (!submitSequence) return;
    let secondFrame = 0;
    const firstFrame = requestAnimationFrame(() => {
      secondFrame = requestAnimationFrame(() => {
        const target = document.getElementById(resultId);
        target?.focus({ preventScroll: true });
        target?.scrollIntoView({ block: "start", behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth" });
      });
    });
    return () => { cancelAnimationFrame(firstFrame); cancelAnimationFrame(secondFrame); };
  }, [submitSequence, resultId]);

  useLayoutEffect(() => {
    const query = window.matchMedia("(max-width: 760px)");
    const sync = () => {
      const nextSize = resourcePageSize(query.matches);
      prepare();
      setMobile(query.matches);
      setView(current => current.pageSize === nextSize ? current : { ...current, page: resourcePageForSize(current.page, current.pageSize, nextSize), pageSize: nextSize });
    };
    sync(); query.addEventListener("change", sync);
    return () => query.removeEventListener("change", sync);
  }, [prepare, setView]);
  const placePanel = useCallback(() => {
    const box = anchor.current?.getBoundingClientRect();
    if (!box) return;
    const width = Math.min(420, window.innerWidth - 32), height = panel.current?.offsetHeight || 560;
    const left = Math.max(16, Math.min(box.left, window.innerWidth - width - 16));
    const preferred = box.bottom + 8 + height <= window.innerHeight - 16 ? box.bottom + 8 : box.top - height - 8;
    const top = Math.max(16, preferred);
    setPosition(current => current.left === left && current.top === top ? current : { left, top });
  }, []);
  useLayoutEffect(() => {
    if (!open || mobile) return;
    placePanel(); window.addEventListener("resize", placePanel); window.addEventListener("scroll", placePanel, true);
    return () => { window.removeEventListener("resize", placePanel); window.removeEventListener("scroll", placePanel, true); };
  }, [open, mobile, placePanel]);

  function openPicker(button: HTMLButtonElement) {
    submittedClose.current = false;
    anchor.current = button;
    setKeyword(view.query?.keyword || item.title);
    setChannels(view.query?.channels ?? readChannels());
    setOpen(true);
  }
  function toggleChannel(id: ResourceChannel) {
    setChannels(current => current.includes(id) ? current.filter(value => value !== id) : allChannels().filter(value => value === id || current.includes(value)));
  }
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const clean = keyword.trim();
    if (!clean || !channels.length) return;
    const query = { keyword: clean, channels: allChannels().filter(id => channels.includes(id)) };
    try { localStorage.setItem(CHANNEL_PREFERENCE, JSON.stringify(query.channels)); } catch { /* Selection remains available in this page. */ }
    prepare();
    submittedClose.current = true;
    setOpen(false);
    setView(current => ({ ...current, query, channel: "all", page: 1 }));
    setSubmitSequence(value => value + 1);
    if (queryKey(query) === queryKey(view.query)) resource.refresh();
  }
  const suggestions = [...new Set([item.title, item.originalTitle, /^\d{4}$/.test(item.year) ? `${item.title} ${item.year}` : ""])].filter(Boolean);
  return <ResourceSearchContext.Provider value={{
    open, openPicker, view, resource, resultId, panelId,
    setChannel: channel => { prepare(); setView(current => ({ ...current, channel, page: 1 })); },
    setPage: page => { prepare(); setView(current => current.page === page ? current : { ...current, page }); },
  }}>
    <Dialog.Root open={open} onOpenChange={setOpen} modal={mobile}>
      {children}
      <Dialog.Portal>
        {mobile && <Dialog.Overlay className="source-picker-overlay"/>}
        <Dialog.Content id={panelId} ref={panel} className={`source-picker-panel ${styles.panel}`} style={mobile ? undefined : position}
          onOpenAutoFocus={event => { event.preventDefault(); if (!mobile) placePanel(); panel.current?.querySelector<HTMLButtonElement>("[data-channel-option]")?.focus({ preventScroll: true }); }}
          onCloseAutoFocus={event => { event.preventDefault(); if (!submittedClose.current) anchor.current?.focus({ preventScroll: true }); }}>
          <span className="source-picker-handle" aria-hidden="true"/>
          <div className="source-picker-head"><Dialog.Title>搜索资源</Dialog.Title><Dialog.Close className="icon-button" aria-label="关闭资源搜索"><X size={17}/></Dialog.Close></div>
          <Dialog.Description className="sr-only">编辑搜索关键词，选择一个或多个资源渠道后开始搜索。</Dialog.Description>
          <form onSubmit={submit} className={styles.form}>
            <div className={styles.formBody}>
              <label className={styles.keywordLabel} htmlFor={`resource-keyword-${id}`}>搜索关键词</label>
              <div className={styles.keywordInput}><Search size={16} aria-hidden="true"/><input id={`resource-keyword-${id}`} value={keyword} onChange={event => setKeyword(event.target.value)} maxLength={100} placeholder="片名、年份或季数" autoComplete="off" enterKeyHint="search"/></div>
              <div className={styles.suggestions} aria-label="建议关键词">{suggestions.map(value => <button key={value} type="button" onClick={() => setKeyword(value)} title={value} aria-pressed={keyword === value}>{value}</button>)}</div>
              <fieldset className={styles.channelFieldset}>
                <legend>搜索渠道 <span>已选 {channels.length} / {RESOURCE_CHANNELS.length}</span></legend>
                <button type="button" className={styles.selectAll} onClick={() => setChannels(channels.length === RESOURCE_CHANNELS.length ? [] : allChannels())}>{channels.length === RESOURCE_CHANNELS.length ? "清空" : "全选"}</button>
                <div className={styles.channelGrid}>
                  {RESOURCE_CHANNELS.map(channel => <button type="button" key={channel.id} data-channel-option className={styles.channelOption} aria-pressed={channels.includes(channel.id)} onClick={() => toggleChannel(channel.id)}>
                    <ChannelBadge channel={channel.id}/><span>{channel.label}</span><span className={styles.channelCheck} aria-hidden="true">{channels.includes(channel.id) && <Check size={12}/>}</span>
                  </button>)}
                </div>
              </fieldset>
            </div>
            <div className={styles.formFooter}><button type="submit" className="primary-button full-width" disabled={!keyword.trim() || !channels.length}><Search size={16}/>开始搜索</button></div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  </ResourceSearchContext.Provider>;
}

export function ResourceSearchButton() {
  const { open, openPicker, panelId } = useResourceSearch();
  return <button type="button" className="secondary-button full-width" aria-haspopup="dialog" aria-controls={open ? panelId : undefined} aria-expanded={open} onClick={event => openPicker(event.currentTarget)}><Search size={17}/>搜索资源</button>;
}

function ChannelBadge({ channel }: { channel: ResourceChannel }) {
  const info = channelInfo(channel);
  const [failedIcon, setFailedIcon] = useState<string | null>(null);
  return <span className={styles.channelBadge} style={{ "--channel-color": info.color } as CSSProperties} aria-hidden="true">
    {info.icon && failedIcon !== info.icon
      ? <img src={info.icon} alt="" width={28} height={28} onError={() => setFailedIcon(info.icon!)}/>
      : channel === "magnet" ? <Magnet size={19}/> : channel === "ed2k" ? <LinkIcon size={19}/> : <Cloud size={19}/>}
  </span>;
}

function resourceDate(value: string | null) {
  if (!value) return "";
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toLocaleDateString("zh-CN", { year: "numeric", month: "2-digit", day: "2-digit" }).replaceAll("/", "-") : "";
}

async function copyText(value: string) {
  if (navigator.clipboard && window.isSecureContext) {
    try { await navigator.clipboard.writeText(value); return; } catch { /* Allow the local HTTP/LAN fallback below. */ }
  }
  const focused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  const input = document.createElement("textarea");
  input.value = value; input.readOnly = true;
  Object.assign(input.style, { position: "fixed", top: "0", left: "0", opacity: "0", pointerEvents: "none" });
  document.body.appendChild(input); input.select();
  try { if (!document.execCommand("copy")) throw new Error("无法复制"); }
  finally { input.remove(); focused?.focus({ preventScroll: true }); }
}

function ResourceRow({ item }: { item: ResourceItem }) {
  const { notify } = useFrame();
  const info = channelInfo(item.channel), date = resourceDate(item.publishedAt);
  const http = /^https?:\/\//i.test(item.url);
  const copy = async () => {
    try {
      await copyText(resourceCopyText(item));
      notify("已复制链接");
    } catch { notify("复制失败，请重试", true); }
  };
  return <article className={styles.resultRow} data-scroll-anchor={`resource:${item.id}`} data-skeleton="block">
    {http
      ? <a className={styles.resultHitArea} href={item.url} target="_blank" rel="noopener noreferrer" title={item.title} aria-label={`打开资源：${item.title}`}/>
      : <button type="button" className={styles.resultHitArea} onClick={copy} title={item.title} aria-label={`复制资源链接：${item.title}`}/>}
    <ChannelBadge channel={item.channel}/>
    <div className={styles.resultCopy}>
      <h3 title={item.title}>{item.title}</h3>
      <div className={styles.resultMeta}><span>{info.label}</span>{date && <time dateTime={item.publishedAt!}>{date}</time>}{item.extractionCode && <span className={styles.extraction}>提取码 <code>{item.extractionCode}</code></span>}</div>
    </div>
  </article>;
}

export function ResourceSearchResults() {
  const { openPicker, view, setChannel, setPage, resource, resultId } = useResourceSearch();
  const data = resource.current || resource.pending ? resource.data : null;
  const items = data?.items ?? [];
  const counts = new Map<ResourceChannel, number>();
  for (const item of items) counts.set(item.channel, (counts.get(item.channel) || 0) + 1);
  const filtered = view.channel === "all" ? items : items.filter(item => item.channel === view.channel);
  const pagination = resourcePagination(filtered.length, view.page, view.pageSize);
  useLayoutEffect(() => {
    if (view.query && resource.current && !resource.pending && view.page !== pagination.page) setPage(pagination.page);
  }, [view.query, view.page, resource.current, resource.pending, pagination.page, setPage]);
  if (!view.query) return null;
  return <section id={resultId} className={styles.results} tabIndex={-1} aria-labelledby={`${resultId}-heading`} aria-busy={resource.pending}>
    <div className={styles.resultsHeading} data-scroll-anchor={`resource-heading:${resultId}`}>
      <div><h2 id={`${resultId}-heading`}>资源搜索</h2></div>
      <div className={styles.toolbar}>
        <button type="button" onClick={event => openPicker(event.currentTarget)}><SlidersHorizontal size={15}/><span>修改搜索</span></button>
        <button type="button" onClick={resource.refresh} disabled={resource.pending} aria-label="刷新资源搜索结果"><RefreshCw size={15}/><span>刷新</span></button>
      </div>
    </div>
    {resource.error && !resource.pending && <div className={styles.error} role="alert"><span>{resource.error}</span><button type="button" className="text-button" onClick={resource.refresh}><RefreshCw size={14}/>重试</button></div>}
    <div className={styles.resultViewport}>
    {resource.pending && <div className={styles.searchLoading} role="status"><LoaderCircle className={styles.searchSpinner} size={28} aria-hidden="true"/><p>正在搜索“{view.query.keyword}”</p></div>}
    <div className={styles.resultContent} {...resourceLoadingProps(resource.pending)} aria-hidden={resource.pending || undefined}>
      {items.length > 0 && <>
        <div className={styles.resultFilters} role="group" aria-label="筛选搜索结果渠道" data-skeleton="line">
          <button type="button" aria-pressed={view.channel === "all"} onClick={() => setChannel("all")}>全部<span>{items.length}</span></button>
          {RESOURCE_CHANNELS.filter(channel => counts.has(channel.id) || channel.id === view.channel).map(channel => <button key={channel.id} type="button" aria-pressed={view.channel === channel.id} onClick={() => setChannel(channel.id)}>{channel.label}<span>{counts.get(channel.id) || 0}</span></button>)}
        </div>
        <div className={styles.resultList}>{filtered.slice(pagination.start, pagination.end).map(item => <ResourceRow key={item.id} item={item}/>)}{filtered.length === 0 && <p className={styles.emptyChannel}>此渠道暂无资源</p>}</div>
        <div className={styles.resultFoot} data-skeleton="line">
          <span>共 {filtered.length} 条 · 第 {pagination.page} / {pagination.totalPages} 页</span>
          <nav className={styles.pagination} aria-label="资源搜索结果分页">
            <button type="button" className={styles.pageArrow} disabled={pagination.page === 1} onClick={() => setPage(pagination.page - 1)} aria-label="上一页资源"><ChevronLeft size={15}/></button>
            {pagination.pages.map(page => <button key={page} type="button" aria-label={`第 ${page} 页资源`} aria-current={page === pagination.page ? "page" : undefined} onClick={() => setPage(page)}>{page}</button>)}
            <button type="button" className={styles.pageArrow} disabled={pagination.page === pagination.totalPages} onClick={() => setPage(pagination.page + 1)} aria-label="下一页资源"><ChevronRight size={15}/></button>
          </nav>
        </div>
      </>}
      {resource.pending && items.length === 0 && <div className={styles.resultList} aria-hidden="true">{Array.from({ length: view.pageSize }, (_, index) => <div key={index} className={styles.skeletonRow} data-skeleton="block"/>)}</div>}
      {!resource.pending && !resource.error && items.length === 0 && <div className={styles.empty}><Search size={24} strokeWidth={1.4}/><h3>暂无匹配资源</h3><p>试试原名，或调整年份、季数和搜索渠道。</p><button type="button" className="text-button" onClick={event => openPicker(event.currentTarget)}>修改搜索<ArrowUpRight size={14}/></button></div>}
    </div>
    </div>
    {!resource.pending && <span className="sr-only" role="status">{resource.error ? "" : `已获取 ${items.length} 条资源`}</span>}
  </section>;
}

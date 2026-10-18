"use client";

import { useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { Check, RotateCcw, SlidersHorizontal, X } from "lucide-react";
import { DEFAULT_FILTERS, type CatalogFilters } from "@/lib/types";
import { activeFilterCount, GENRES, REGIONS, getSortOptions, sortForMedia } from "@/lib/ui";
import { useFrame } from "./providers";
import { resolveDateTo } from "@/lib/date-filters";
import { useTodayDate } from "@/lib/use-today-date";

export function FilterPanel({ filters, onApply }: { filters: CatalogFilters; onApply: (next: CatalogFilters) => void }) {
  const { preview } = useFrame();
  const today = useTodayDate();
  const [open, setOpen] = useState(false);
  const [advanced, setAdvanced] = useState(true);
  const [draft, setDraft] = useState(filters);
  const [error, setError] = useState("");
  const count = activeFilterCount(filters);
  const favorites = filters.chart === "favorites";
  const media = draft.media === "tv" ? "tv" : "movie";
  const update = (patch: Partial<CatalogFilters>) => setDraft(previous => ({ ...previous, ...patch }));
  function openPanel(value: boolean) {
    setOpen(value);
    if (value) {
      setDraft({ ...filters, dateTo: filters.dateTo || "today" }); setError("");
      setAdvanced(true);
    }
  }
  function apply(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (draft.dateFrom && draft.dateFrom > resolveDateTo(draft.dateTo || "today", today)) { setError("起始日期不能晚于结束日期"); return; }
    if (draft.scoreMin && draft.scoreMax && Number(draft.scoreMin) > Number(draft.scoreMax)) { setError("最低评分不能高于最高评分"); return; }
    if (draft.runtimeMin && draft.runtimeMax && Number(draft.runtimeMin) > Number(draft.runtimeMax)) { setError("最短时长不能大于最长时长"); return; }
    onApply({ ...draft, dateTo: draft.dateTo || "today", media: favorites ? draft.media : media, chart: favorites ? "favorites" : "discover", query: favorites ? draft.query : "", page: 1 });
    setOpen(false);
  }
  return <Dialog.Root open={open} onOpenChange={openPanel}>
    <Dialog.Trigger asChild><button className={`filter-button ${count ? "has-filters" : ""}`}><SlidersHorizontal size={15}/>筛选{count > 0 && <span className="filter-count">{count}</span>}</button></Dialog.Trigger>
    <Dialog.Portal><Dialog.Overlay className="dialog-overlay"/>
      <Dialog.Content className="filter-dialog">
        <div className="filter-dialog-head"><div><Dialog.Title>{favorites ? "筛选收藏" : "筛选影片"}</Dialog.Title><Dialog.Description>{favorites ? "在收藏中查找作品。" : preview ? "预览模式：条件只用于固定样本。" : "选择你想看的类型和上映／首播日期。"}</Dialog.Description></div><Dialog.Close className="icon-button" aria-label="关闭筛选"><X size={20}/></Dialog.Close></div>
        <form onSubmit={apply}>
          <div className="filter-dialog-body">
            {!favorites && <fieldset><legend>作品类型</legend><div className="media-tabs">{(["movie", "tv"] as const).map(type => <button type="button" key={type} className={media === type ? "selected" : ""} aria-pressed={media === type} onClick={() => update({ media: type, genres: [], sort: sortForMedia(draft.sort, type) })}>{type === "movie" ? "电影" : "电视剧"}</button>)}</div></fieldset>}
            <fieldset><legend>类型 <span>可多选</span></legend><div className="genre-options">{GENRES[media].map(genre => <button type="button" key={genre.id} className={`filter-chip ${draft.genres.includes(String(genre.id)) ? "active" : ""}`} aria-pressed={draft.genres.includes(String(genre.id))} onClick={() => update({ genres: draft.genres.includes(String(genre.id)) ? draft.genres.filter(id => id !== String(genre.id)) : [...draft.genres, String(genre.id)] })}>{draft.genres.includes(String(genre.id)) && <Check size={12}/>} {genre.name}</button>)}</div></fieldset>
            <div className="filter-fields">
              <fieldset className="span-two"><legend>{media === "tv" ? "首播日期" : "上映日期"}</legend><div className="date-range-fields"><label>起始日期<input type="date" min="1800-01-01" max="2200-12-31" aria-label="起始日期" value={draft.dateFrom} onInput={event => update({ dateFrom: event.currentTarget.value })} onChange={event => update({ dateFrom: event.target.value })}/></label><span>—</span><label>结束日期<input type="date" min="1800-01-01" max="2200-12-31" aria-label="结束日期" value={resolveDateTo(draft.dateTo || "today", today)} onInput={event => update({ dateTo: event.currentTarget.value || "today" })} onChange={event => update({ dateTo: event.target.value || "today" })}/></label></div><div className="date-range-hint"><span>{!draft.dateTo || draft.dateTo === "today" ? "结束日期跟随当天（北京时间）" : "结束日期已固定"}</span>{draft.dateTo && draft.dateTo !== "today" && <button type="button" onClick={() => update({ dateTo: "today" })}>使用今天</button>}</div></fieldset>
              {!favorites && <fieldset><legend>地区</legend><select value={draft.region} onChange={event => update({ region: event.target.value })} aria-label="制片地区">{REGIONS.map(region => <option key={region.value} value={region.value}>{region.label}</option>)}</select></fieldset>}
              <fieldset className={favorites ? "span-two" : undefined}><legend>排序</legend><select value={sortForMedia(draft.sort, media)} onChange={event => update({ sort: event.target.value })} aria-label="排序方式">{getSortOptions(media).map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select></fieldset>
            </div>
            <details className="advanced-filters" open={advanced} onToggle={event => setAdvanced(event.currentTarget.open)}>
              <summary>更多条件</summary>
              <div className="advanced-fields">
                <div className="filter-fields">
                  <fieldset><legend>类型组合</legend><select aria-label="类型组合逻辑" value={draft.genreLogic} onChange={event => update({ genreLogic: event.target.value as "or" | "and" })}><option value="and">同时包含全部</option><option value="or">包含任一</option></select></fieldset>
                  <fieldset><legend>评分人数</legend><select value={draft.votesMin} onChange={event => update({ votesMin: event.target.value })} aria-label="最低评分人数"><option value="">不限</option><option value="100">至少 100 人</option><option value="500">至少 500 人</option><option value="1000">至少 1,000 人</option><option value="5000">至少 5,000 人</option></select></fieldset>
                  <fieldset className="span-two"><legend>{filters.chart === "favorites" ? "评分（按卡片来源）" : "TMDB 评分"}</legend><div className="range-fields"><input type="number" min="0" max="10" step="0.1" placeholder="最低评分" aria-label="最低评分" value={draft.scoreMin} onChange={event => update({ scoreMin: event.target.value })}/><span>—</span><input type="number" min="0" max="10" step="0.1" placeholder="最高评分" aria-label="最高评分" value={draft.scoreMax} onChange={event => update({ scoreMax: event.target.value })}/></div></fieldset>
                  {!favorites && <><fieldset className="span-two"><legend>原始语言</legend><select value={draft.language} onChange={event => update({ language: event.target.value })} aria-label="原始语言"><option value="">全部语言</option><option value="zh">普通话</option><option value="cn">粤语</option><option value="en">英语</option><option value="ja">日语</option><option value="ko">韩语</option><option value="fr">法语</option><option value="es">西班牙语</option></select></fieldset><fieldset className="span-two"><legend>{media === "tv" ? "单集时长" : "影片时长"}<span> / 分钟</span></legend><div className="range-fields"><input type="number" min="0" max="1000" placeholder="最短时长" aria-label="最短时长" value={draft.runtimeMin} onChange={event => update({ runtimeMin: event.target.value })}/><span>—</span><input type="number" min="0" max="1000" placeholder="最长时长" aria-label="最长时长" value={draft.runtimeMax} onChange={event => update({ runtimeMax: event.target.value })}/></div></fieldset></>}
                </div>
              </div>
            </details>
            {error && <p className="form-error" role="alert">{error}</p>}
          </div>
          <div className="filter-dialog-foot"><button type="button" className="text-button" onClick={() => { setDraft({ ...DEFAULT_FILTERS, chart: filters.chart, media }); setError(""); setAdvanced(true); }}><RotateCcw size={14}/>重置</button><button className="primary-button" type="submit">查看结果<Check size={16}/></button></div>
        </form>
      </Dialog.Content>
    </Dialog.Portal>
  </Dialog.Root>;
}

"use client";

import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { Check, ChevronDown, X } from "lucide-react";
import { CATALOG_SOURCES, type CatalogSourceId } from "@/lib/catalog-sources";

export const CatalogSourceContext = createContext<{ source: CatalogSourceId; onSelect: (source: CatalogSourceId) => void } | null>(null);
export const useCatalogSource = () => useContext(CatalogSourceContext);

export function SourcePicker() {
  const navigation = useCatalogSource();
  const [open, setOpen] = useState(false), [mobile, setMobile] = useState(false);
  const [position, setPosition] = useState({ left: 16, top: 16 });
  const trigger = useRef<HTMLButtonElement>(null), content = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const query = window.matchMedia("(max-width: 760px)");
    const sync = () => setMobile(query.matches);
    sync(); query.addEventListener("change", sync);
    return () => query.removeEventListener("change", sync);
  }, []);
  const placePanel = useCallback(() => {
    const box = trigger.current?.getBoundingClientRect();
    if (!box) return;
    const width = Math.min(320, window.innerWidth - 32), height = content.current?.offsetHeight || 220;
    const left = Math.max(16, Math.min(box.right - width, window.innerWidth - width - 16));
    const preferredTop = box.bottom + 8 + height <= window.innerHeight - 16 ? box.bottom + 8 : box.top - height - 8;
    const top = Math.max(16, preferredTop);
    setPosition(current => current.left === left && current.top === top ? current : { left, top });
  }, []);
  useLayoutEffect(() => {
    if (!open || mobile) return;
    placePanel(); window.addEventListener("resize", placePanel); window.addEventListener("scroll", placePanel, true);
    return () => { window.removeEventListener("resize", placePanel); window.removeEventListener("scroll", placePanel, true); };
  }, [open, mobile, placePanel]);
  if (!navigation) return null;
  const current = CATALOG_SOURCES.find(source => source.id === navigation.source)!;

  function onKeys(event: KeyboardEvent<HTMLDivElement>) {
    if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
    const options = [...event.currentTarget.querySelectorAll<HTMLButtonElement>("[data-platform-option]")];
    if (!options.length) return;
    event.preventDefault();
    const index = options.indexOf(document.activeElement as HTMLButtonElement);
    const next = event.key === "Home" ? 0 : event.key === "End" ? options.length - 1 : (index + (event.key === "ArrowDown" ? 1 : -1) + options.length) % options.length;
    options[next].focus();
  }

  return <Dialog.Root open={open} onOpenChange={setOpen} modal={mobile}>
    <Dialog.Trigger asChild>
      <button ref={trigger} type="button" className="source-picker-trigger" data-source-trigger data-scroll-anchor="catalog-source" aria-label={`切换榜单平台，当前 ${current.label}`}>
        <span className={`platform-icon platform-icon--${current.id}`}><img src={current.icon} alt="" width={28} height={28}/></span>
        <span>{current.label}</span><ChevronDown className="source-picker-chevron" size={14}/>
      </button>
    </Dialog.Trigger>
    <Dialog.Portal>
      {mobile && <Dialog.Overlay className="source-picker-overlay"/>}
      <Dialog.Content ref={content} className="source-picker-panel" style={mobile ? undefined : position}
        onOpenAutoFocus={event => { event.preventDefault(); if (!mobile) placePanel(); content.current?.querySelector<HTMLButtonElement>('[aria-pressed="true"]')?.focus({ preventScroll: true }); }}>
        <span className="source-picker-handle" aria-hidden="true"/>
        <div className="source-picker-head"><Dialog.Title>切换平台</Dialog.Title><Dialog.Close className="icon-button" aria-label="关闭平台选择"><X size={17}/></Dialog.Close></div>
        <Dialog.Description className="sr-only">选择榜单来源，保留当前电影或电视剧分类。</Dialog.Description>
        <div className="source-picker-options" onKeyDown={onKeys}>
          {CATALOG_SOURCES.map(source => <button key={source.id} type="button" data-platform-option className="source-picker-option" aria-pressed={source.id === current.id}
            onClick={() => { setOpen(false); if (source.id !== current.id) navigation.onSelect(source.id); }}>
            <span className={`platform-icon platform-icon--${source.id}`}><img src={source.icon} alt="" width={40} height={40}/></span>
            <span className="source-picker-copy"><strong>{source.label}</strong><small>{source.description}</small></span>
            {source.id === current.id && <Check size={18} className="source-picker-check"/>}
          </button>)}
        </div>
      </Dialog.Content>
    </Dialog.Portal>
  </Dialog.Root>;
}

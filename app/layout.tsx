import type { Metadata } from "next";
import { Suspense } from "react";
import { FrameProvider } from "@/components/providers";
import { FrameShell } from "@/components/shell";
import "./globals.css";

export const metadata: Metadata = {
  title: { default:"FRAME 帧榜 · 把时间留给好故事", template:"%s · FRAME 帧榜" },
  description:"电影与剧集的每日趋势、口碑佳作和内容发现。把热度交给数据，把选择留给自己。",
};
export const dynamic = "force-dynamic";

export default function RootLayout({children}:{children:React.ReactNode}) {
  return <html lang="zh-CN" data-theme="dark" data-scroll-behavior="smooth" suppressHydrationWarning><head><script dangerouslySetInnerHTML={{__html:"try{document.documentElement.dataset.theme=localStorage.getItem('frame_theme_v2')==='light'?'light':'dark'}catch(e){}"}}/></head><body><Suspense fallback={<div className="boot-state">FRAME.</div>}><FrameProvider configured={Boolean(process.env.TMDB_API_READ_ACCESS_TOKEN?.trim())}><FrameShell>{children}</FrameShell></FrameProvider></Suspense></body></html>;
}

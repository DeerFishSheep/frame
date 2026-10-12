import type { Metadata } from "next";
import { Suspense } from "react";
import { FrameProvider } from "@/components/providers";
import { FrameShell } from "@/components/shell";
import "./globals.css";

export const metadata: Metadata = {
  title: { default:"帧榜 · 电影与电视剧", template:"%s · 帧榜" },
  description:"查看影视榜单，搜索电影与电视剧，浏览作品资料并收藏想看的影片。",
};
export const dynamic = "force-dynamic";

export default function RootLayout({children}:{children:React.ReactNode}) {
  return <html lang="zh-CN" data-theme="dark" data-scroll-behavior="smooth" suppressHydrationWarning><head><script dangerouslySetInnerHTML={{__html:"try{document.documentElement.dataset.theme=localStorage.getItem('frame_theme_v2')==='light'?'light':'dark'}catch(e){}"}}/></head><body><Suspense fallback={<div className="boot-state">FRAME.</div>}><FrameProvider configured={Boolean(process.env.TMDB_API_READ_ACCESS_TOKEN?.trim())}><FrameShell>{children}</FrameShell></FrameProvider></Suspense></body></html>;
}

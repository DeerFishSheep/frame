"use client";
import { RefreshCw } from "lucide-react";
export default function ErrorBoundary({reset}:{error:Error;reset:()=>void}){return <div className="empty-state"><span className="eyebrow">A BRIEF INTERMISSION</span><h2>稍作停留，再次探索。</h2><p>页面遇到了加载问题。</p><button className="primary-button" onClick={reset}>重试<RefreshCw size={14}/></button></div>;}

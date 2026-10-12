"use client";
import { RefreshCw } from "lucide-react";
export default function ErrorBoundary({reset}:{error:Error;reset:()=>void}){return <div className="empty-state"><h2>页面加载失败</h2><p>请重试。</p><button className="primary-button" onClick={reset}>重试<RefreshCw size={14}/></button></div>;}

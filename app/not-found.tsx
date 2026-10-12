import Link from "next/link";
import { ArrowLeft } from "lucide-react";
export default function NotFound(){return <div className="empty-state not-found"><span className="eyebrow">OUT OF FRAME · 404</span><h1>这一帧，暂时没有故事。</h1><p>页面不存在，回到榜单继续探索。</p><Link className="primary-button" href="/"><ArrowLeft size={15}/>回到首页</Link></div>;}

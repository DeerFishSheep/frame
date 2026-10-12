import Link from "next/link";
import { ArrowLeft } from "lucide-react";
export default function NotFound(){return <div className="empty-state not-found"><h1>页面不存在</h1><p>回到首页继续浏览影片。</p><Link className="primary-button" href="/"><ArrowLeft size={15}/>回到首页</Link></div>;}

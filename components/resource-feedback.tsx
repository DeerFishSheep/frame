import { LoaderCircle, RefreshCw } from "lucide-react";
import type { ReactNode } from "react";

/** Shared, in-place feedback: existing content stays mounted during refreshes and errors. */
export function ResourceFeedback({ pending, error, retained, onRetry }: { pending: boolean; error?: string; retained: boolean; onRetry: () => void }) {
  if (!retained || (!pending && !error)) return null;
  return <div className={`resource-feedback ${error ? "resource-feedback--error" : ""}`} role={error ? "alert" : "status"}>
    {pending ? <><LoaderCircle size={15} className="spinning"/><span>正在更新，暂时保留上次内容…</span></> : <><span>{error} 已保留上次内容。</span><button className="text-button" onClick={onRetry}><RefreshCw size={14}/>重试</button></>}
  </div>;
}

export function ResourceRegion({ children, ...feedback }: { children: ReactNode; pending: boolean; error?: string; retained: boolean; onRetry: () => void }) {
  return <div className="resource-region" aria-busy={feedback.pending}>
    <ResourceFeedback {...feedback}/>
    {children}
  </div>;
}

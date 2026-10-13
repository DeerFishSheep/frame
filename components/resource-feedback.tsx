import { RefreshCw } from "lucide-react";
import type { ReactNode } from "react";

/** Keep layout/state mounted, mask marked surfaces, and block stale-content actions. */
export function resourceLoadingProps(pending: boolean) {
  return { "aria-busy": pending, "data-loading": pending, inert: pending || undefined };
}

/** Loading is shown on the content itself; only failures need a message. */
export function ResourceFeedback({ pending, error, retained, onRetry }: { pending: boolean; error?: string; retained: boolean; onRetry: () => void }) {
  if (!retained || pending || !error) return null;
  return <div className="resource-feedback resource-feedback--error" role="alert">
    <span>{error}</span><button className="text-button" onClick={onRetry}><RefreshCw size={14}/>重试</button>
  </div>;
}

export function ResourceRegion({ children, ...feedback }: { children: ReactNode; pending: boolean; error?: string; retained: boolean; onRetry: () => void }) {
  return <div className="resource-region" {...resourceLoadingProps(feedback.pending)}>
    <ResourceFeedback {...feedback}/>
    {children}
  </div>;
}

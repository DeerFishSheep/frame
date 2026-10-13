"use client";

import { useCallback, useLayoutEffect, useRef, useState } from "react";
import { AsyncResource, ResourceCache, browserResources } from "./resource-state";
import { useStableUpdate } from "./use-stable-update";

interface Options<T> {
  key: string;
  group: string;
  load: (signal: AbortSignal, previous: T | null) => Promise<T>;
  initial?: T;
  enabled?: boolean;
  keepPrevious?: boolean;
}

/** Every asynchronously updated region uses the same retain/replace/error contract. */
export function useAsyncResource<T>({ key, group, load, initial, enabled = true, keepPrevious = true }: Options<T>) {
  const loader = useRef(load); loader.current = load;
  const [resource] = useState(() => new AsyncResource<T>(typeof window === "undefined" ? new ResourceCache() : browserResources, group, key, initial, keepPrevious));
  const [state, setState] = useState(resource.snapshot);
  const prepare = useStableUpdate();
  useLayoutEffect(() => resource.subscribe(() => { prepare(); setState(resource.snapshot()); }), [resource, prepare]);
  useLayoutEffect(() => {
    resource.setGroup(group);
    if (enabled) void resource.load(key, (signal, previous) => loader.current(signal, previous));
    return () => resource.cancel();
  }, [resource, group, key, enabled]);
  const refresh = useCallback(() => { if (enabled) void resource.load(key, (signal, previous) => loader.current(signal, previous), true); }, [resource, key, enabled]);
  const update = useCallback((value: T) => resource.update(key, value), [resource, key]);
  return { ...state, pending: enabled && (state.pending || state.requestKey !== key), current: state.dataKey === key, refresh, update };
}

"use client";

import { useEffect, useState } from "react";
import { getTodayDate } from "./date-filters";

/** Refresh at Beijing midnight and when returning to a suspended browser tab. */
export function useTodayDate() {
  const [today, setToday] = useState(getTodayDate);
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    function refresh() {
      const current = getTodayDate();
      setToday(current);
      clearTimeout(timer);
      const midnight = new Date(`${current}T00:00:00+08:00`).getTime() + 86_400_000;
      timer = setTimeout(refresh, Math.max(1, midnight - Date.now()));
    }
    refresh();
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, []);
  return today;
}

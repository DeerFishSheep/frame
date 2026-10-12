/** Calendar dates use the same Beijing timezone as the site's timestamps. */
export function getTodayDate(now = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(now);
  const part = (type: string) => parts.find(item => item.type === type)!.value;
  return `${part("year")}-${part("month")}-${part("day")}`;
}

export function isCalendarDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const year = Number(value.slice(0, 4));
  const parsed = new Date(`${value}T00:00:00Z`);
  return year >= 1800 && year <= 2200 && Number.isFinite(parsed.getTime())
    && parsed.toISOString().slice(0, 10) === value;
}

export function resolveDateTo(value: string, today = getTodayDate()): string {
  return value === "today" ? today : value;
}

/** A missing/invalid release date cannot satisfy an active date range. */
export function matchesDateRange(releaseDate: string, dateFrom: string, dateTo: string, today = getTodayDate()): boolean {
  const end = resolveDateTo(dateTo, today);
  if (!dateFrom && !end) return true;
  return isCalendarDate(releaseDate) && (!dateFrom || releaseDate >= dateFrom) && (!end || releaseDate <= end);
}

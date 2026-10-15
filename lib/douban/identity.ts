import { normalizedName, searchTitle, tvSeasonNumber } from "../media-match";
import type { Media } from "../types";

/** Source metadata only: no saved cross-provider mappings or guessed numeric seasons. */
export function readDoubanIdentity(item: Media, value: unknown): { names: string[]; seasonNumber?: number; ambiguousSeason: boolean } {
  const raw = value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
  const unique = (values: unknown[]) => {
    const seen = new Set<string>();
    return values.flatMap(value => {
      if (typeof value !== "string") return [];
      const name = value.normalize("NFKC").replace(/\p{Cf}/gu, "").trim(), key = normalizedName(name);
      if (!name || name.length > 200 || seen.has(key)) return [];
      seen.add(key); return [name];
    });
  };
  const complete = unique([item.title, raw.title, raw.original_title, item.originalTitle, ...(Array.isArray(raw.aka) ? raw.aka.slice(0, 16) : [])]).slice(0, 20);
  const hints = item.mediaType === "tv" ? [...new Set(complete.map(tvSeasonNumber).filter((number): number is number => number !== null))] : [];
  const ambiguousSeason = hints.length > 1, seasonNumber = hints.length === 1 ? hints[0] : undefined;
  const bases = seasonNumber === undefined ? [] : complete.map(name => {
    const explicit = tvSeasonNumber(name);
    if (explicit === seasonNumber) return searchTitle(name, "tv");
    // A bare suffix is an alternate query only after another name explicitly states this season.
    // The entire trailing number must agree: 1988 and 24 cannot silently become season 2.
    const suffix = /^(.*?)(\d+)$/.exec(name);
    return suffix && Number(suffix[2]) === seasonNumber && suffix[1].trim().length >= 2 ? suffix[1].trim() : name;
  });
  return { names: unique([...bases, ...complete]), ...(seasonNumber === undefined ? {} : { seasonNumber }), ambiguousSeason };
}

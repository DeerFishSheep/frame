import type { Media, MediaType } from "./types";

const normalizedTitle = (value: string) => value.normalize("NFKC").toLocaleLowerCase().replace(/[\p{P}\p{Z}\s]/gu, "");
export const searchTitle = (title: string, media: MediaType) => media === "tv" ? title.replace(/\s*(?:第[一二三四五六七八九十零百\d]+季|Season\s*\d+|S\d+)\s*$/i, "").trim() : title.trim();

/** A unique exact name + year is required; ambiguous remakes and later seasons stay unmatched. */
export function exactMediaMatch(candidates: Media[], title: string, year: string, media: MediaType) {
  if (!/^\d{4}$/.test(year)) return null;
  const wanted = normalizedTitle(searchTitle(title, media));
  const matches = candidates.filter(item => item.mediaType === media && item.year === year && [item.title, item.originalTitle].some(name => normalizedTitle(name) === wanted));
  const unique = [...new Map(matches.map(item => [item.id, item])).values()];
  return unique.length === 1 ? unique[0] : null;
}

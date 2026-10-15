import type { Media, MediaDetail, MediaType } from "./types";

export const normalizedName = (value: string) => value.normalize("NFKC").toLocaleLowerCase().replace(/[\p{P}\p{Z}\p{Cf}\s]/gu, "");
export const searchTitle = (title: string, media: MediaType) => {
  const clean = title.replace(/\p{Cf}/gu, "").trim();
  return media === "tv" ? clean.replace(/\s*(?:第[一二三四五六七八九十零百\d]+季|Season\s*\d+|S\d+)\s*$/i, "").trim() : clean;
};

/** A unique exact name + year is required; ambiguous remakes and later seasons stay unmatched. */
export function exactMediaMatch(candidates: Media[], title: string, year: string, media: MediaType) {
  const unique = exactMediaCandidates(candidates, title, year, media);
  return unique.length === 1 ? unique[0] : null;
}
export function exactMediaCandidates(candidates: Media[], title: string, year: string, media: MediaType) {
  if (!/^\d{4}$/.test(year)) return [];
  const wanted = normalizedName(searchTitle(title, media));
  const matches = candidates.filter(item => item.mediaType === media && item.year === year && [item.title, item.originalTitle].some(name => normalizedName(name) === wanted));
  return [...new Map(matches.map(item => [item.id, item])).values()];
}

export function creditsMatch(detail: Pick<MediaDetail, "directors" | "cast">, evidence: { directors: string[]; actors: string[] }) {
  const directors = new Set(evidence.directors.map(normalizedName).filter(Boolean));
  const actors = new Set(evidence.actors.map(normalizedName).filter(Boolean));
  const director = detail.directors.some(name => directors.has(normalizedName(name)));
  const matched = detail.cast.filter(actor => actors.has(normalizedName(actor.name)));
  const distinctNames = new Set(matched.map(actor => normalizedName(actor.name))).size;
  const distinctPeople = new Set(matched.map(actor => actor.id)).size;
  return director || distinctNames >= 2 && distinctPeople >= 2;
}

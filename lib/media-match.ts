import type { Media, MediaDetail, MediaType } from "./types";

export const normalizedName = (value: string) => value.normalize("NFKC").toLocaleLowerCase().replace(/[\p{P}\p{Z}\p{Cf}\s]/gu, "");
export const searchTitle = (title: string, media: MediaType) => {
  const clean = title.normalize("NFKC").replace(/\p{Cf}/gu, "").trim();
  return media === "tv" ? clean.replace(/(?:\s*第[一二三四五六七八九十零百\d]+季|(?:^|\s)(?:Season\s*\d+|S\d+))\s*$/i, "").trim() : clean;
};

/** Only an explicit season suffix authorizes a season-year lookup. */
export function tvSeasonNumber(title: string): number | null {
  const clean = title.normalize("NFKC").replace(/\p{Cf}/gu, "").trim();
  const match = /(?:第([一二三四五六七八九十零百\d]+)季|(?:^|\s)(?:Season\s*(\d+)|S(\d+)))\s*$/i.exec(clean);
  if (!match) return null;
  const token = match[1] || match[2] || match[3];
  let number;
  if (/^\d+$/.test(token)) number = Number(token);
  else {
    const digits: Record<string, number> = { 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 };
    if (/^[一二三四五六七八九]$/.test(token)) number = digits[token];
    else if (/^[一二三四五六七八九]?十[一二三四五六七八九]?$/.test(token)) {
      const [tens, units] = token.split("十"); number = (tens ? digits[tens] : 1) * 10 + (units ? digits[units] : 0);
    }
  }
  return number && Number.isSafeInteger(number) && number <= 99 ? number : null;
}

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

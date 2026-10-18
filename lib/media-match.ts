import type { Media, MediaDetail, MediaType } from "./types";

export const normalizedName = (value: string) => value.normalize("NFKC").toLocaleLowerCase().replace(/[\p{P}\p{Z}\p{Cf}\s]/gu, "");

const SEASON_MARKER = /(?:第([一二三四五六七八九十零百\d]+)季|(?:^|\s)(?:Season\s*(\d+)|S(\d+))|시즌\s*(\d+))\s*$/i;
const CHINESE_DIGITS: Record<string, number> = { 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 };
/** Titles carrying CJK or Hangul are the ones where a bare trailing number reads as a season, not as part of the name. */
const CJK_OR_HANGUL = /[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff\u3040-\u30ff\uac00-\ud7a3]/;

/** Korean and Chinese numerals share the same meaning; a bare trailing number is normalized here too. */
function parseSeasonToken(token: string | undefined): number | null {
  if (!token) return null;
  if (/^\d+$/.test(token)) return Number(token);
  if (/^[一二三四五六七八九]$/.test(token)) return CHINESE_DIGITS[token];
  if (/^[一二三四五六七八九]?十[一二三四五六七八九]?$/.test(token)) {
    const [tens, units] = token.split("十");
    return (tens ? CHINESE_DIGITS[tens] : 1) * 10 + (units ? CHINESE_DIGITS[units] : 0);
  }
  return null;
}

const validSeason = (value: number | null): number | null => value !== null && Number.isSafeInteger(value) && value >= 1 && value <= 99 ? value : null;

/**
 * The season read from a bare trailing number, e.g. 问心2, 飞常日志2, IT狗2.0, 유미의세포들 시즌3.
 * Guarded so ordinary names keep their numbers: a title that is only a number (1923) never parses,
 * and a Latin-only name (CANON 2) is left to the explicit season markers above.
 */
function bareSeason(title: string): { base: string; number: number } | null {
  const versioned = /^(.*\D)\s*(\d+)\.0$/.exec(title);
  const trailing = versioned ?? /^(.*\D)\s*(\d+)$/.exec(title);
  if (!trailing) return null;
  const base = trailing[1].replace(/[\s\p{P}]+$/u, "").trim();
  if (!base || !CJK_OR_HANGUL.test(base)) return null;
  const number = validSeason(Number(trailing[2]));
  return number === null ? null : { base, number };
}

/** The number behind an explicit season marker; null when the marker is unparsable or out of range. */
function explicitSeasonSuffix(title: string): number | null {
  const match = SEASON_MARKER.exec(title);
  return match ? validSeason(parseSeasonToken(match[1] || match[2] || match[3] || match[4])) : null;
}

/**
 * Season suffixes are the same facts as tvSeasonNumber reads; searchTitle strips them from the same titles.
 * An unparsable or out-of-range suffix (第零季, S100) is still stripped, so a caller can tell that the title
 * carries a season marker it cannot accept instead of searching the whole name.
 */
export const searchTitle = (title: string, media: MediaType) => {
  const clean = title.normalize("NFKC").replace(/\p{Cf}/gu, "").trim();
  if (media !== "tv") return clean;
  if (SEASON_MARKER.test(clean)) return clean.replace(SEASON_MARKER, "").trim();
  const bare = bareSeason(clean);
  return bare && bare.number >= 2 ? bare.base : clean;
};

/** The number an explicit season marker states anywhere in a name, e.g. a season record titled "第 5 季 夏篇". */
export function seasonMarkerNumber(name: string): number | null {
  const clean = name.normalize("NFKC").replace(/\p{Cf}/gu, "").trim();
  // A season record writes its marker with or without spacing ("第 5 季 夏篇", "第5季"), so the digits are read across spaces.
  const match = /(?:第\s*([一二三四五六七八九十零百\d]+)\s*季|(?:^|\s)Season\s*(\d+)|(?:^|\s)S(\d+)|시즌\s*(\d+))/i.exec(clean);
  return match ? validSeason(parseSeasonToken(match[1] || match[2] || match[3] || match[4])) : null;
}

/**
 * A season number written inside a name rather than at its end (晚酌的流派5：夏篇). The name does not state its own
 * season by this alone, so it only authorizes an attempt: the season record must carry the same number and premiere
 * on the Douban release date before anything is accepted. A number that is merely part of the name (1923, 24小时,
 * 东京爱情故事2020) never reaches this shape.
 */
export function innerSeasonNumber(title: string): number | null {
  const clean = title.normalize("NFKC").replace(/\p{Cf}/gu, "").trim();
  const match = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]\s*(\d{1,2})\s*[：:·、，,。.～~—–\-！!？?（(「『【[]/u.exec(clean);
  return match ? validSeason(Number(match[1])) : null;
}

/**
 * Only an explicit season suffix, a Korean 시즌N marker or a guarded bare trailing number authorizes a season-year lookup.
 * A title that is nothing but digits (1923) and a Latin-only name (CANON 2) stay whole.
 */
export function tvSeasonNumber(title: string): number | null {
  const clean = title.normalize("NFKC").replace(/\p{Cf}/gu, "").trim();
  const explicit = explicitSeasonSuffix(clean);
  if (explicit !== null) return explicit;
  const bare = bareSeason(clean);
  return bare && bare.number >= 2 ? bare.number : null;
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

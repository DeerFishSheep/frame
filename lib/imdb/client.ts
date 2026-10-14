import { IMDB_SORTS, imdbChart, type ImdbFilters } from "./query";

export class ImdbError extends Error {
  constructor(message: string, readonly code: string, readonly status: number) { super(message); this.name = "ImdbError"; }
}
export interface ImdbTitle {
  id: string; title: string; overview: string; poster: string | null;
  date: string; year: string; genres: string[]; rating: number; votes: number; rank: number;
}
export interface ImdbChartResult { titles: ImdbTitle[]; retrievedAt: string; stale: boolean }
export interface ImdbRatingResult { rating: number; votes: number; retrievedAt: string; stale: boolean }
type Raw = Record<string, unknown>;
const object = (x: unknown): Raw => x && typeof x === "object" && !Array.isArray(x) ? x as Raw : {};
const text = (x: unknown) => typeof x === "string" ? x.trim() : "";
const invalid = () => new ImdbError("IMDB 返回的榜单不完整，请稍后重试。", "IMDB_INVALID_RESPONSE", 502);

export function parseImdbChart(payload: unknown, limit: number): ImdbTitle[] {
  const data = object(payload);
  if (Array.isArray(data.errors) && data.errors.length) throw invalid();
  const chart = object(object(data.data).chartTitles);
  if (!Number.isSafeInteger(chart.total) || Number(chart.total) < 1 || !Array.isArray(chart.edges)) throw invalid();
  if (chart.edges.length !== Math.min(limit, Number(chart.total))) throw invalid();
  const ids = new Set<string>();
  return chart.edges.map(value => {
    const edge = object(value), node = object(edge.node), ratings = object(node.ratingsSummary);
    const id = text(node.id), title = text(object(node.titleText).text);
    if (!/^tt\d{5,12}$/.test(id) || ids.has(id) || !title || !Number.isSafeInteger(edge.currentRank) || Number(edge.currentRank) < 1) throw invalid();
    ids.add(id);
    const rating = ratings.aggregateRating ?? 0, votes = ratings.voteCount ?? 0;
    if (typeof rating !== "number" || !Number.isFinite(rating) || rating < 0 || rating > 10 || !Number.isSafeInteger(votes) || Number(votes) < 0) throw invalid();
    const release = object(node.releaseDate), year = Number(release.year || object(node.releaseYear).year);
    const fullDate = [release.year, release.month, release.day].every(Number.isInteger)
      ? `${String(release.year).padStart(4, "0")}-${String(release.month).padStart(2, "0")}-${String(release.day).padStart(2, "0")}` : "";
    const parsedDate = new Date(`${fullDate}T00:00:00Z`);
    const date = fullDate && Number.isFinite(parsedDate.getTime()) && parsedDate.toISOString().slice(0, 10) === fullDate ? fullDate : "";
    const rawGenres = object(node.titleGenres).genres;
    return {
      id, title, overview: text(object(object(node.plot).plotText).plainText),
      poster: text(object(node.primaryImage).url) || null, date,
      year: Number.isInteger(year) && year >= 1800 && year <= 2200 ? String(year) : "",
      genres: Array.isArray(rawGenres) ? rawGenres.map(g => text(object(object(g).genre).text)).filter(Boolean) : [],
      rating, votes: Number(votes), rank: Number(edge.currentRank),
    };
  });
}

export function buildImdbRequest(filters: ImdbFilters) {
  const chart = imdbChart(filters), sort = IMDB_SORTS.find(option => option.value === filters.sort)!;
  // Fetch the complete finite chart before slicing; later pages never filter a partial sample.
  const query = `query FrameChart($first:Int!,$sort:AdvancedTitleSearchSort){chartTitles(first:$first,chart:{chartType:${chart.type}},sort:$sort){total edges{currentRank node{id titleText{text} primaryImage{url} plot{plotText{plainText}} ratingsSummary{aggregateRating voteCount} releaseDate{year month day} releaseYear{year} titleGenres{genres{genre{text}}}}}}}`;
  const variables = { first: chart.limit, sort: { sortBy: sort.sortBy, sortOrder: sort.sortOrder } };
  // IMDB expects percent-encoded spaces, not URLSearchParams' plus encoding.
  return `https://api.graphql.imdb.com/?query=${encodeURIComponent(query)}&variables=${encodeURIComponent(JSON.stringify(variables))}`;
}

export function createImdbClient(options: { fetchImpl?: typeof fetch; now?: () => number; timeoutMs?: number; sleep?: (ms: number) => Promise<void> } = {}) {
  const fetchImpl = options.fetchImpl ?? fetch, now = options.now ?? Date.now;
  const sleep = options.sleep ?? ((ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms)));
  const cache = new Map<string, { titles: ImdbTitle[]; retrievedAt: string; at: number }>();
  const inflight = new Map<string, Promise<ImdbChartResult>>();
  async function request(url: string): Promise<unknown> {
    for (let attempt = 0; attempt < 2; attempt++) {
      const controller = new AbortController(), timer = setTimeout(() => controller.abort(), options.timeoutMs ?? 12000);
      try {
        const response = await fetchImpl(url, {
          signal: controller.signal, cache: "no-store", redirect: "error",
          headers: { Accept: "application/graphql+json, application/json", "User-Agent": "Mozilla/5.0", "x-imdb-client-name": "imdb-web-next", "x-imdb-user-language": "zh-CN" },
        });
        if ((response.status === 429 || response.status >= 500) && attempt === 0) { await sleep(400); continue; }
        if (!response.ok) throw new ImdbError(response.status === 429 ? "IMDB 请求频繁，请稍后重试。" : "暂时无法获取 IMDB 榜单，请稍后重试。", "IMDB_UPSTREAM_FAILED", response.status === 429 ? 429 : 502);
        let payload: unknown;
        try { payload = await response.json(); } catch { throw invalid(); }
        return payload;
      } catch (error) {
        if (error instanceof ImdbError) throw error;
        if (attempt === 0) { await sleep(250); continue; }
        throw new ImdbError(controller.signal.aborted ? "连接 IMDB 超时，请重试。" : "无法连接 IMDB，请稍后重试。", "IMDB_UNAVAILABLE", controller.signal.aborted ? 504 : 502);
      } finally { clearTimeout(timer); }
    }
    throw invalid();
  }
  async function load(filters: ImdbFilters): Promise<ImdbChartResult> {
    return { titles: parseImdbChart(await request(buildImdbRequest(filters)), imdbChart(filters).limit), retrievedAt: new Date(now()).toISOString(), stale: false };
  }
  function chart(filters: ImdbFilters): Promise<ImdbChartResult> {
    const key = `${filters.media}:${filters.chart}:${filters.sort}`, previous = cache.get(key);
    if (previous && now() - previous.at < 30 * 60_000) return Promise.resolve({ ...previous, stale: false });
    const pending = inflight.get(key); if (pending) return pending;
    const promise = load(filters).then(result => {
      cache.set(key, { titles: result.titles, retrievedAt: result.retrievedAt, at: now() });
      return result;
    }).catch((error: unknown) => {
      if (previous && now() - previous.at < 24 * 60 * 60_000) return { titles: previous.titles, retrievedAt: previous.retrievedAt, stale: true };
      throw error;
    }).finally(() => inflight.delete(key));
    inflight.set(key, promise); return promise;
  }
  const ratingCache = new Map<string, ImdbRatingResult & { at: number }>(), ratingPending = new Map<string, Promise<ImdbRatingResult>>();
  function rating(id: string): Promise<ImdbRatingResult> {
    if (!/^tt\d{5,12}$/.test(id)) return Promise.reject(new ImdbError("IMDB 编号无效。", "INVALID_IMDB_ID", 400));
    const previous = ratingCache.get(id);
    if (previous && now() - previous.at < 30 * 60_000) return Promise.resolve(previous);
    // A just-opened chart already carries this title's authoritative rating.
    for (const entry of [...cache.values()].sort((a, b) => b.at - a.at)) {
      const title = entry.titles.find(title => title.id === id);
      if (title && now() - entry.at < 30 * 60_000) return Promise.resolve({ rating: title.rating, votes: title.votes, retrievedAt: entry.retrievedAt, stale: false });
    }
    const pending = ratingPending.get(id); if (pending) return pending;
    const query = "query FrameRating($id:ID!){title(id:$id){id ratingsSummary{aggregateRating voteCount}}}";
    const url = `https://api.graphql.imdb.com/?query=${encodeURIComponent(query)}&variables=${encodeURIComponent(JSON.stringify({ id }))}`;
    const promise = request(url).then(payload => {
      const raw = object(payload), title = object(object(raw.data).title), summary = object(title.ratingsSummary);
      if (Array.isArray(raw.errors) && raw.errors.length || title.id !== id) throw invalid();
      const score = summary.aggregateRating ?? 0, votes = summary.voteCount ?? 0;
      if (typeof score !== "number" || !Number.isFinite(score) || score < 0 || score > 10 || !Number.isSafeInteger(votes) || Number(votes) < 0) throw invalid();
      const result = { rating: score, votes: Number(votes), retrievedAt: new Date(now()).toISOString(), stale: false, at: now() };
      ratingCache.delete(id); ratingCache.set(id, result);
      while (ratingCache.size > 250) ratingCache.delete(ratingCache.keys().next().value!);
      return result;
    }).catch(error => {
      if (previous && now() - previous.at < 24 * 60 * 60_000) return { ...previous, stale: true };
      throw error;
    }).finally(() => ratingPending.delete(id));
    ratingPending.set(id, promise); return promise;
  }
  return { chart, rating };
}

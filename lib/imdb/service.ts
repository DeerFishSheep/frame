import type { CatalogResponse, Media, MediaType } from "../types";
import { imageUrl } from "../types";
import { IMDB_PAGE_SIZE, type ImdbFilters } from "./query";
import type { createImdbClient, ImdbTitle } from "./client";

const genres: Record<string, string> = { Action: "动作", Adventure: "冒险", Animation: "动画", Biography: "传记", Comedy: "喜剧", Crime: "犯罪", Documentary: "纪录", Drama: "剧情", Family: "家庭", Fantasy: "奇幻", History: "历史", Horror: "恐怖", Music: "音乐", Musical: "歌舞", Mystery: "悬疑", Romance: "爱情", "Sci-Fi": "科幻", Sport: "运动", Thriller: "惊悚", War: "战争", Western: "西部", "Reality-TV": "真人秀", "Talk-Show": "脱口秀", News: "新闻", Short: "短片", "Game-Show": "游戏节目" };

export function imdbMedia(title: ImdbTitle, mediaType: MediaType, match: Media | null): Media {
  return {
    id: match?.id ?? title.id, imdbId: title.id, mediaType, source: "imdb",
    title: match?.title || title.title, originalTitle: match?.originalTitle || title.title,
    overview: match?.overview || title.overview,
    posterPath: match?.posterPath || (imageUrl(title.poster) ? title.poster : null),
    backdropPath: match?.backdropPath || null,
    releaseDate: match?.releaseDate || title.date, year: match?.year || title.year,
    ...(match?.countryCodes !== undefined ? { countryCodes: match.countryCodes } : {}),
    genreIds: match?.genreIds || [], genres: title.genres.length ? title.genres.map(g => genres[g] || g) : match?.genres || [],
    // Scores and ranks always belong to IMDB, even when metadata is from TMDB.
    voteAverage: title.rating, voteCount: title.votes, popularity: 0, rank: title.rank,
  };
}

export function createImdbService(client: Pick<ReturnType<typeof createImdbClient>, "chart">, find: (id: string, media: MediaType) => Promise<Media | null>) {
  async function catalog(filters: ImdbFilters): Promise<CatalogResponse> {
    const raw = await client.chart(filters), start = (filters.page - 1) * IMDB_PAGE_SIZE;
    const selected = raw.titles.slice(start, start + IMDB_PAGE_SIZE);
    const results: Media[] = new Array(selected.length);
    let next = 0, unmatched = 0;
    await Promise.all(Array.from({ length: Math.min(6, selected.length) }, async () => {
      while (next < selected.length) {
        const index = next++, item = selected[index];
        let match: Media | null = null;
        try { match = await find(item.id, filters.media); } catch { /* Keep the original entry on lookup failure. */ }
        if (!match) unmatched++;
        results[index] = imdbMedia(item, filters.media, match);
      }
    }));
    const notices = [raw.stale ? "IMDB 暂时无法更新，正在显示上次成功获取的榜单。" : "", unmatched ? "部分作品暂未匹配本站详情，仍保留原榜信息，点击可在 IMDB 查看。" : ""].filter(Boolean);
    return { results, page: filters.page, totalPages: Math.ceil(raw.titles.length / IMDB_PAGE_SIZE), totalResults: raw.titles.length, retrievedAt: raw.retrievedAt, source: "imdb", stale: raw.stale, ...(notices.length ? { notice: notices.join(" ") } : {}) };
  }
  return { catalog };
}

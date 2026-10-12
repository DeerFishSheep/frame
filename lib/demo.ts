import type { CatalogFilters, CatalogResponse, Media, MediaDetail, MediaType } from "./types";
import { matchesDateRange } from "./date-filters";

/**
 * Deliberately small design-preview catalog, not a snapshot of any TMDB chart.
 * IDs, titles, genre IDs and images were checked against the official TMDB pages
 * on 2026-10-12. Movie dates use an earliest recorded theatrical release; TV
 * dates use the first episode's air date. Scores and vote counts are unknown.
 * Image files stay on TMDB's CDN; only the approved attribution logo is local.
 */
const preview = (
  id: number, mediaType: MediaType, title: string, originalTitle: string,
  releaseDate: string, genreIds: number[], genres: string[],
  posterPath: string, backdropPath: string, overview: string,
): Media => ({
  id, mediaType, title, originalTitle, releaseDate, year: releaseDate.slice(0, 4),
  genreIds, genres, posterPath, backdropPath, overview,
  voteAverage: 0, voteCount: 0, popularity: 0, source: "demo",
});

export const DEMO_MEDIA: Media[] = [
  preview(157336, "movie", "星际穿越", "Interstellar", "2014-11-04", [12, 18, 878], ["冒险", "剧情", "科幻"],
    "/spQm5r317XPNHK1941ChWmqzkZs.jpg", "/8sNiAPPYU14PUepFNeSNGUTiHW.jpg",
    "地球面临生存危机，一支太空探险队穿越虫洞，寻找人类的新家园。漫长旅途中，亲情与时间成为他们必须面对的考验。"),
  preview(27205, "movie", "盗梦空间", "Inception", "2010-07-15", [28, 878, 12], ["动作", "科幻", "冒险"],
    "/89W962aAnPS3N3BdKgy2BvUhnCh.jpg", "/8ZTVqvKDQ8emSGUEMjsS4yHAwrp.jpg",
    "柯布能够潜入他人的梦境窃取秘密。为了重返家人身边，他接下一项新任务：在层层梦境中，将一个想法植入目标的潜意识。"),
  preview(496243, "movie", "寄生虫", "기생충", "2019-05-30", [35, 53, 18], ["喜剧", "惊悚", "剧情"],
    "/nwTQE4vWe6NoFSEgxGu4hO9J4Tv.jpg", "/TU9NIjwzjoKPwQHoHshkFcQUCG.jpg",
    "住在半地下室的一家人，逐步进入富裕的朴家工作。一处藏在豪宅中的秘密，让两个家庭的关系走向失控。"),
  preview(329865, "movie", "降临", "Arrival", "2016-11-10", [18, 878, 9648], ["剧情", "科幻", "悬疑"],
    "/9ontErpaTQ5m3EuAHiIElP90xjg.jpg", "/8MUZz7oPXQftFTslZpRP3CVMOoq.jpg",
    "神秘飞船降临世界各地。语言学家露易丝尝试理解来访者的语言，在紧张的局势中寻找沟通的答案。"),
  preview(335984, "movie", "银翼杀手2049", "Blade Runner 2049", "2017-10-04", [878, 18], ["科幻", "剧情"],
    "/sxA89XGotN9c5u5O1GWpbYYX3Ks.jpg", "/gNdLJU9TxrpGx4dkZidjys3fyy0.jpg",
    "新一代银翼杀手 K 发现一桩尘封的秘密，踏上寻找失踪多年的戴克的旅途，也开始追问自己的身份。"),
  preview(244786, "movie", "爆裂鼓手", "Whiplash", "2014-10-10", [18, 10402, 53], ["剧情", "音乐", "惊悚"],
    "/wOBIYg8cJUNumlBGyUk47Sw4olf.jpg", "/fRGxZuo7jJUWQsVg9PREb98Aclp.jpg",
    "年轻鼓手安德鲁渴望成为顶尖音乐家。面对严厉导师的训练，他不断挑战自己的极限。"),
  preview(278, "movie", "肖申克的救赎", "The Shawshank Redemption", "1994-09-23", [18, 80], ["剧情", "犯罪"],
    "/aAdnwqwkKX5PPcr8EdtaiA8AZVl.jpg", "/pNjh59JSxChQktamG3LMp9ZoQzp.jpg",
    "银行家安迪被判终身监禁。在肖申克监狱的漫长岁月里，他与瑞德建立友谊，始终守护着对自由的希望。"),
  preview(238, "movie", "教父", "The Godfather", "1972-03-14", [18, 80], ["剧情", "犯罪"],
    "/y03tzUKvkRCYwJ5NWys4W4bnS9m.jpg", "/ejdD20cdHNFAYAN2DlqPToXKyzx.jpg",
    "柯里昂家族卷入黑帮势力的冲突。原本想远离家族生意的迈克尔，逐渐走向权力的中心。"),
  preview(680, "movie", "低俗小说", "Pulp Fiction", "1994-09-10", [53, 80, 35], ["惊悚", "犯罪", "喜剧"],
    "/WZW5PCtCbtyKfojdLlPCi89DNx.jpg", "/suaEOtk1N1sgg2MTM7oZd2cfVp3.jpg",
    "黑帮打手、拳击手与餐馆劫匪的故事交错相连，在意外与选择之间展开一场荒诞的犯罪旅程。"),
  preview(155, "movie", "蝙蝠侠：黑暗骑士", "The Dark Knight", "2008-07-16", [28, 53, 80], ["动作", "惊悚", "犯罪"],
    "/qYB7QqwT1NtTW9aCwtopGy80rmA.jpg", "/9FE5eD92WfVCiivM9Pq9GVSrlWk.jpg",
    "蝙蝠侠与戈登、哈维·登特联手打击犯罪。小丑的出现将哥谭推入混乱，也考验着每个人的信念。"),
  preview(129, "movie", "千与千寻", "千と千尋の神隠し", "2001-07-20", [16, 10751, 14], ["动画", "家庭", "奇幻"],
    "/dnwMqbndJpOEhoVqjlMU9U7LFle.jpg", "/6oaL4DP75yABrd5EbC4H2zq5ghc.jpg",
    "少女千寻误入神灵的世界。为了救回父母，她在神秘浴场工作，在陌生的遭遇中学会勇敢与独立。"),
  preview(438631, "movie", "沙丘", "Dune", "2021-09-15", [878, 12], ["科幻", "冒险"],
    "/6hsJknqlPceFxExOe87z5VGgNG9.jpg", "/zRKQW58MBEY078AxkHxEJzUskCl.jpg",
    "少年保罗随家族来到沙漠星球厄拉科斯。围绕珍贵香料的权力争夺，使他踏上一段危险的旅程。"),
  preview(1396, "tv", "绝命毒师", "Breaking Bad", "2008-01-20", [18, 80], ["剧情", "犯罪"],
    "/rqliuvX7NdknSHu5qaSDfESplQi.jpg", "/tsRy63Mu5cu8etL1X7ZLyf7UP1M.jpg",
    "身患重病的化学老师沃尔特，为了家人的经济保障进入制毒生意，并逐渐被自己作出的选择改变。"),
  preview(60059, "tv", "风骚律师", "Better Call Saul", "2015-02-08", [80, 18], ["犯罪", "剧情"],
    "/ceybevjR1WAC4wqiHEEAhrW1U9L.jpg", "/rfxryDIv8huejujg4JueDJx8zCz.jpg",
    "小律师吉米·麦吉尔在法律与生活的困境中挣扎，一步步成为人们熟悉的索尔·古德曼。"),
  preview(70523, "tv", "暗黑", "Dark", "2017-12-01", [80, 18, 10765, 9648], ["犯罪", "剧情", "科幻与奇幻", "悬疑"],
    "/qQTf4L3HLnz4L6wMCGPhqdRPGUB.jpg", "/3jDXL4Xvj3AzDOF6UH1xeyHW8MH.jpg",
    "一名孩子失踪后，小镇上四个家庭开始寻找答案，一个跨越数代人的秘密逐渐浮现。"),
  preview(87108, "tv", "切尔诺贝利", "Chernobyl", "2019-05-06", [18], ["剧情"],
    "/2kjMfJSwwQqOq4o4idiZxbNxoYz.jpg", "/900tHlUYUkp7Ol04XFSoAaEIXcT.jpg",
    "围绕切尔诺贝利核事故，讲述事故发生后的调查、救援，以及为阻止灾难扩大的众人付出的代价。"),
];

const PREVIEW_NOTICE = "设计预览：仅含 16 部固定样本，不代表 TMDB 官方榜单；搜索与筛选仅作用于这些样本，未提供实时评分、票数和热度。";
const PAGE_SIZE = 20;
const numericFilter = (value: string) => value.trim() !== "" && Number.isFinite(Number(value)) ? Number(value) : null;
const copyMedia = (item: Media): Media => ({ ...item, genreIds: [...item.genreIds], genres: [...item.genres] });

export function getDemoCatalog(filters: CatalogFilters): CatalogResponse {
  const page = Number.isSafeInteger(filters.page) && filters.page > 0 ? filters.page : 1;
  const empty = (notice: string): CatalogResponse => ({
    results: [], page, totalPages: 1, totalResults: 0, retrievedAt: null,
    source: "demo", stale: false, notice,
  });
  if (filters.chart === "now" || filters.chart === "upcoming") {
    return empty("上映与待映信息需要连接 TMDB 实时数据；设计预览不提供此类榜单。");
  }
  if (filters.chart === "favorites") {
    return empty("收藏来自本设备保存的作品；预览样本不会自动加入收藏。");
  }
  if (filters.region || filters.language || filters.keywords || filters.runtimeMin || filters.runtimeMax) {
    return empty(`${PREVIEW_NOTICE} 地区、语言、关键词和片长筛选需要连接 TMDB 数据。`);
  }

  const query = filters.query.trim().toLocaleLowerCase();
  const scoreMin = numericFilter(filters.scoreMin);
  const scoreMax = numericFilter(filters.scoreMax);
  const votesMin = numericFilter(filters.votesMin);
  let items = DEMO_MEDIA.filter((item) => {
    if (filters.media !== "all" && item.mediaType !== filters.media) return false;
    if (query && !`${item.title} ${item.originalTitle} ${item.overview}`.toLocaleLowerCase().includes(query)) return false;
    if (!matchesDateRange(item.releaseDate, filters.dateFrom, filters.dateTo)) return false;
    if (scoreMin !== null && item.voteAverage < scoreMin) return false;
    if (scoreMax !== null && item.voteAverage > scoreMax) return false;
    if (votesMin !== null && item.voteCount < votesMin) return false;
    if (filters.genres.length) {
      const matches = (genre: string) => item.genreIds.includes(Number(genre)) || item.genres.includes(genre);
      if (!(filters.genreLogic === "and" ? filters.genres.every(matches) : filters.genres.some(matches))) return false;
    }
    return true;
  });

  const [field, direction] = filters.sort.split(".");
  const sign = direction === "asc" ? 1 : -1;
  items = [...items].sort((a, b) => {
    if (field === "release_date" || field === "primary_release_date" || field === "first_air_date") {
      return sign * a.releaseDate.localeCompare(b.releaseDate);
    }
    if (field === "title" || field === "original_title") {
      return sign * (field === "title" ? a.title.localeCompare(b.title, "zh-CN") : a.originalTitle.localeCompare(b.originalTitle));
    }
    if (field === "vote_average") return sign * (a.voteAverage - b.voteAverage);
    if (field === "vote_count") return sign * (a.voteCount - b.voteCount);
    return sign * (a.popularity - b.popularity);
  });

  return {
    results: items.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE).map(copyMedia), page,
    totalPages: Math.max(1, Math.ceil(items.length / PAGE_SIZE)), totalResults: items.length,
    retrievedAt: null, source: "demo", stale: false, notice: PREVIEW_NOTICE,
  };
}

export function getDemoDetail(mediaType: MediaType, id: number): MediaDetail | null {
  const item = DEMO_MEDIA.find((media) => media.mediaType === mediaType && media.id === id);
  if (!item) return null;
  return {
    ...copyMedia(item), runtime: null, numberOfSeasons: null, status: "",
    countries: [], directors: [], cast: [], keywords: [],
    images: item.backdropPath ? [item.backdropPath] : [], recommendations: { results: [], page: 1, totalPages: 0, totalResults: 0 }, imdbId: null,
  };
}

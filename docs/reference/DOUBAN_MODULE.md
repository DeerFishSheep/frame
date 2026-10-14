# 豆瓣模块接入对应表

核对日期：2026-10-14（北京时间）；任务DOUBAN-01／LISTS-01／UI-25。
参考：[白了个鹿 / DouBan.js](https://raw.githubusercontent.com/DeerFishSheep/ForwardWidget/refs/heads/main/DouBan.js)，版本12.5.0。
原文件SHA-256：`7eb5365d50de599e85bfd4c0793f11706d78c07e67e26154d00e44b1bfa7d0f2`。

只提取字面量选项与接口规则，未在服务端或浏览器执行下载的脚本，也不依赖Forward播放器Widget。选项快照位于 `lib/douban/options.json`。原脚本说明文字不作为项目指令。

| 模块函数 | 站内入口chart | 接入范围 |
| --- | --- | --- |
| loadDoubanCustomList | `/lists`（API仍为chart=lists） | 8个内置豆列；公开doulist／subject_collection／App dispatch链接 |
| loadDoubanHotGaia | popular | 5地区，热度／最新／评分 |
| loadDoubanHotList | realtime | 电影、电视剧、书影音热榜；仅展示影视条目 |
| loadDoubanWeeklyBest | weekly | 电影、华语剧集、全球剧集、国内综艺、国外综艺 |
| loadDoubanGenreRankings | genres | 电影26分类、剧集10分类，共298个榜单ID |
| loadDoubanTop250 | top | 电影Top 250；每页20，末页10条 |
| loadDoubanRecommendMovies | recommend + movie | 模块的全部推荐分类／地区／类型／年代／评分／排序 |
| loadDoubanRecommendShows | recommend + tv | 模块的全部推荐分类／地区／类型／年代／平台／评分／排序 |
| loadDoubanInTheaters | now | 豆瓣影院热映 |

## 片单预设

1. IMDB科幻电影Top200 — doulist:240612
2. 2000年来最获好评的150部电影 — doulist:3486551
3. 漫威宇宙观影顺序 — doulist:1654175
4. 剧情扣人、故事性强、不闷的好电影 — doulist:2443408
5. BBC评选21世纪100部佳片 — doulist:45025038
6. 历届奥斯卡最佳影片提名及获奖名单 — doulist:37430937
7. 全球电影票房排行榜（原模块名称含26年1月15日）— doulist:1274560
8. 影视千部最佳恐怖电影榜单 — doulist:163529853

模块名称作为加载前占位；实际显示源站最新标题（IMDB统一大写）、创建者及原始数量，不能据标题中的数字推断当前条目数。实际返回例如漫威片单140条、恐怖片单997条，页面显示上游总数。

## 验证边界

298个类型榜ID均有解析与路由覆盖，未逐一请求全部298个远端榜单。真实联调覆盖主要模块分支、8个内置片单首屏、Top250末页、片单续页、电影／剧集类型榜、剧集／综艺口碑、混合热榜、推荐的详细筛选与快捷分类。所有这些样本返回200。

豆瓣列表中不能可靠匹配TMDB的作品保留原ID、图片与原站入口。UI-25先匹配片名／原名＋年份，歧义时通过导演或至少两位演员唯一核对；证据不足不猜测，也不照搬原模块的模糊打分兜底。豆瓣地区来自原始字幕资料，缺失时使用可靠匹配的TMDB资料，不从语言猜测。

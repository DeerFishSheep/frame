# FRAME 帧榜

中文影视榜单与发现网站。顶部分类、统一搜索、影片封面和海报选片，支持桌面和手机。

原始项目资料只有 `PLAN.md`、开发任务书、HTML 原型和预览图。当前工程将原型整理为 Next.js 16 + React 19 + TypeScript 应用，可在自己的服务器运行。

**当前在本地开发和测试；服务器部署尚未开始。** 本地已接通 TMDB 真实数据，逐项验收状态见当前进度。

## 项目状态与交接

| 文档 | 用途 |
| --- | --- |
| [PLAN.md](PLAN.md) | 项目目标、阶段与开发路线 |
| [当前进度](docs/PROGRESS.md) | 已实现、已验证、待联调与未完成项 |
| [开发记录](docs/CHANGELOG.md) | 每次开发的改动、证据和下一步 |
| [本地开发与代码定位](docs/DEVELOPMENT.md) | 本地流程、组件入口和记录更新方式 |

后续 Agent 按 [AGENTS.md](AGENTS.md) 接手。每完成一部分开发，同时更新进度和开发记录。

## 本地运行

需要 Node.js 22 和 npm。

```bash
npm ci
test -e .env.local || cp .env.example .env.local
npm run dev
```

打开 [http://localhost:3000](http://localhost:3000)。在 `.env.local` 配置下面任一种凭证，重启应用即可使用真实数据。

```dotenv
# v3 API Key
TMDB_API_KEY=
# 或 API Read Access Token；两者同时配置时优先使用 Token
TMDB_API_READ_ACCESS_TOKEN=
TMDB_CACHE_SECONDS=1800
```

凭证仅供服务端读取；不使用 `NEXT_PUBLIC_` 前缀，不需要访客输入 Key。`.env.local`、`.env` 已加入 Git 和 Docker 忽略规则。
API Key 由服务端通过 `api_key` 参数认证，Token 使用 Bearer 请求头，参见 [TMDB 官方认证说明](https://developer.themoviedb.org/docs/authentication-application)。

## 当前功能

以下描述已实现的代码能力；验证状态与剩余缺口以 [当前进度](docs/PROGRESS.md) 为准。

- 今日/本周趋势、热门、高分、正在上映/即将上映；电影和剧集独立切换，剧集使用“近期在播”“今日播出”。
- 各主榜单顶部以无边框通栏展示最多 5 部影视，每 6 秒轮换；桌面海报放大铺满、边缘渐变衔接，不再使用模糊衬底；手机保留完整等比图片。支持箭头、指示点、键盘和触摸切换；无暂停／继续按钮，悬停或聚焦暂停、离开恢复，减少动画偏好下关闭自动轮播。
- 找片卡片按当前结果顺序编号，加载更多连续计数；官方榜单保留真实名次。完整上映／首播日期与全部类型放在海报底部，评分在右下角。
- 顶部统一搜索，输入后点击搜索或按 Enter；找片直接展开电影／电视剧全部类型，支持多选；上映／首播日期（精确到日，结束日期默认跟随北京时间的当天）与地区在筛选面板，评分、投票数、语言、关键词和片长放在“更多条件”中；筛选参数保存在 URL。
- 电影/剧集详情、真实海报、TMDB 来源与更新时间；收藏、取消收藏和本地持久化。
- 深浅主题、网格/列表、加载更多；手机端直接显示电影、电视剧、找片和收藏入口，并提供加载中/空结果/失败重试状态。

官方榜单保留接口顺序和分页名次。搜索、探索、收藏不显示官方排名；高级筛选通过 Discover 请求完整数据集，名称搜索与高级筛选分开使用。

## 预览与真实数据

未配置凭证时默认进入**设计预览**。预览作品明确标记为示例，不展示真实评分和名次，不代表当日榜单或全站搜索。

已配置凭证时默认使用真实 TMDB 数据。来源面板可切换模式；真实请求失败会显示错误，不会自动混入预览作品。缺少凭证时切换真实模式会返回配置错误。

真实数据默认缓存 1800 秒，并显示采集时间。收藏使用浏览器 `localStorage`，键为 `frame_favorites_v2`，电影与剧集使用不同的复合 ID。

## 页面与接口

| 页面 | 路由 |
| --- | --- |
| 电影（默认入口） | `/` |
| 找片 | `/discover` |
| 我的收藏 | `/favorites` |
| 电影详情 | `/movie/157336`，通用格式 `/movie/[id]` |
| 剧集详情 | `/tv/1396`，通用格式 `/tv/[id]` |
| 数据来源 | `/about` |

| GET 接口 | 用途 |
| --- | --- |
| `/api/catalog` | 榜单、搜索与探索；例如 `?chart=trending&media=movie&period=day&page=1` |
| `/api/details/[mediaType]/[id]` | 电影或剧集详情；`mediaType` 为 `movie` 或 `tv` |
| `/api/recommendations/[mediaType]/[id]?page=1` | 猜你喜欢，按页获取完整 TMDB 推荐 |
| `/api/keywords?query=时间循环` | 搜索 TMDB 关键词供探索筛选使用 |

浏览器仅访问本站接口。服务端选择 TMDB 路径并验证查询参数，不接收任意上游 URL。

## 后续部署到自己的服务器

当前开发阶段不执行这部分。以下步骤保留作后续服务器部署参考。

服务器需要 Docker 与 Docker Compose。把项目放到服务器后执行：

```bash
cp .env.example .env
# 编辑 .env，填写 TMDB_API_KEY 或 TMDB_API_READ_ACCESS_TOKEN
docker compose up -d --build
docker compose ps
docker compose logs --tail=100 frame
```

镜像采用 [Next.js standalone 输出](https://nextjs.org/docs/app/api-reference/config/next-config-js/output)，以普通用户运行。凭证通过 [Compose 运行时环境变量](https://docs.docker.com/compose/how-tos/environment-variables/set-environment-variables/) 注入，不进入镜像构建。

站点只绑定服务器 `127.0.0.1:3000`。在已有 Nginx、Caddy 或服务器面板中，将域名反向代理到 `http://127.0.0.1:3000`，并配置 HTTPS。

更新代码或修改 `.env` 后，再执行 `docker compose up -d --build`。当前 TMDB 缓存不依赖数据库；容器重启后会重新获取。收藏仍保留在访问者浏览器。

也可直接用 Node 部署：

```bash
npm ci
npm run build
npm run start
```

构建结束会自动把静态资源复制进 standalone 输出。`npm run start` 启动这个生产包；端口用 `PORT` 指定，监听地址用 `FRAME_HOST` 指定。环境变量仍从项目目录的 `.env.local` 读取。

## 复检命令

```bash
npm run typecheck
npm test
npm run build
docker compose --env-file .env.example config --quiet
```

重点检查：手机页面无横向溢出；筛选 URL 刷新可复现；电影/剧集同数字 ID 可分别收藏；收藏刷新保留；缺少令牌和请求失败时显示可恢复状态。

真实接口验收需配置有效 TMDB 凭证。来源署名与声明在 `/about`：`This product uses the TMDB API but is not endorsed or certified by TMDB.`

## 第二阶段

历史榜单快照与名次升降、人工精选片单、个性化推荐、账户同步、IMDb/豆瓣评分聚合尚未实现。当前不生成虚构的排名变化，也不将 TMDB 评分显示为 IMDb 评分。

阶段与优先顺序见 [PLAN.md](PLAN.md)，各项状态在 [当前进度](docs/PROGRESS.md) 持续更新。

### 详情与猜你喜欢

详情桌面为左海报右资料；手机海报与资料并排，评分在右侧日期类型下方保持一行，收藏／TMDB／IMDb 按钮横排；原名用括号紧接片名，不显示相关主题。演员采用紧凑方形头像，剧照保留横向画幅，均可用箭头、键盘或滑动横向浏览。
猜你喜欢复用全站卡片，单行横向滚动，可用箭头或键盘左右键浏览。滑到末尾按需加载下一页，直到 TMDB 提供的最后一页（接口上限 500 页）；失败保留已加载内容并允许重试。
所有卡片的 `#N` 样式一致；榜单保留官方名次，找片、搜索、收藏和推荐显示当前列表顺序。


### 电影上映分类

- 正在上映沿用 TMDB 的 `now_playing` 院线列表和返回顺序；默认热度优先。
- 即将上映按卡片展示的主上映日期筛选，严格晚于北京时间当天（从明天起），限已记录院线发行类型，不包含当天或更早的主上映日期。服务端使用 Discover 完成筛选和分页，保留 `popularity.desc` 返回顺序；`#N` 表示结果序号。
- 两类都没有改为按上映日期先后排序。未指定发行国家，不将日期标作中国大陆上映日期；电视剧的近期在播／今日播出保留原接口。


### 找片筛选标签

- 类型采用固定的常用优先顺序：电影以剧情、动作、喜剧、科幻开头，西部与电视电影靠后；电视剧以剧情、悬疑、喜剧、犯罪开头。主页面与筛选面板一致，保留全部类型 ID，不代表实时热度统计。
- 已选地区显示中文名称，如美国、中国大陆；已选区显示当前排序。只选择非默认排序时也显示标签，并计入筛选数量；默认热度与动态今天不额外计数。
- `vote_count.desc` 的展示文案统一为“评分数量”，数据请求仍按评分数量降序。筛选链接和刷新恢复保留原参数。

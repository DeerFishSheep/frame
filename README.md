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
- 各主榜单顶部展示当前结果中的最多 5 部不同影视，每 6 秒轮换；支持手动切换、暂停与键盘操作，减少动画偏好下默认关闭自动轮播。
- 找片卡片按当前结果顺序编号，加载更多连续计数；官方榜单保留真实名次。完整上映／首播日期与全部类型放在海报底部，评分在右下角。
- 顶部统一搜索，输入后点击搜索或按 Enter；找片提供类型、年份与地区筛选，评分、投票数、语言、关键词和片长放在“更多条件”中；筛选参数保存在 URL。
- 电影/剧集详情、真实海报、TMDB 来源与更新时间；收藏、取消收藏和本地持久化。
- 深浅主题、网格/列表、加载更多；手机端直接显示首页、电影、电视剧、找片和收藏入口，并提供加载中/空结果/失败重试状态。

官方榜单保留接口顺序和分页名次。搜索、探索、收藏不显示官方排名；高级筛选通过 Discover 请求完整数据集，名称搜索与高级筛选分开使用。

## 预览与真实数据

未配置凭证时默认进入**设计预览**。预览作品明确标记为示例，不展示真实评分和名次，不代表当日榜单或全站搜索。

已配置凭证时默认使用真实 TMDB 数据。来源面板可切换模式；真实请求失败会显示错误，不会自动混入预览作品。缺少凭证时切换真实模式会返回配置错误。

真实数据默认缓存 1800 秒，并显示采集时间。收藏使用浏览器 `localStorage`，键为 `frame_favorites_v2`，电影与剧集使用不同的复合 ID。

## 页面与接口

| 页面 | 路由 |
| --- | --- |
| 榜单首页 | `/` |
| 探索 | `/discover` |
| 我的收藏 | `/favorites` |
| 电影详情 | `/movie/157336`，通用格式 `/movie/[id]` |
| 剧集详情 | `/tv/1396`，通用格式 `/tv/[id]` |
| 数据来源 | `/about` |

| GET 接口 | 用途 |
| --- | --- |
| `/api/catalog` | 榜单、搜索与探索；例如 `?chart=trending&media=movie&period=day&page=1` |
| `/api/details/[mediaType]/[id]` | 电影或剧集详情；`mediaType` 为 `movie` 或 `tv` |
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

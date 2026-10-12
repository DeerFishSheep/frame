# FRAME｜本地开发与 Agent 交接

## 当前工作方式

**开发阶段只在本地运行项目和测试。**

日常使用 `npm run dev`。`npm run build` 和 `npm run start` 用于本地生产包验收。
Docker 和服务器步骤目前是后续参考，不默认执行远程操作或部署。

## 接手前的阅读顺序

1. 根目录 `AGENTS.md`：开发、Git 和文档维护规则。
2. `PLAN.md`：产品目标、阶段和当前优先顺序。
3. `docs/PROGRESS.md`：真实状态、待办与验证边界。
4. `docs/CHANGELOG.md`：末尾最新记录。
5. `README.md`：实际命令；再阅读本次相关代码。

旧 PRD 和记忆用于解释背景。当前状态必须结合进度文档、Git 与实际代码核对。

## 本地启动

```bash
npm ci
npm run dev
```

打开 `http://localhost:3000`，以终端实际打印的地址为准。
先检查现有本地服务，避免重复启动多个进程或误停其他项目。

没有凭证也可体验设计预览。需要真实联调时：

1. 本地 `.env.local` 不存在时，复制 `.env.example`。
2. 在 `.env.local` 配置 `TMDB_API_KEY`（v3 Key）或 `TMDB_API_READ_ACCESS_TOKEN`；两者都有时优先使用 Token。
3. 重启本地应用，再检查真实数据模式。

已有 `.env.local` 时不要覆盖；只检查是否配置，不向日志、聊天或 Git 输出凭证内容。
本地 Next.js API 就是开发阶段的服务端，不需要先部署远程服务器。

## 本地验证

```bash
npm run typecheck
npm test
```

涉及应用构建、路由或运行方式时，再执行本地生产构建：

```bash
npm run build
npm run start
```

构建与开发服务共用 `.next`，不要一边运行 `next dev` 一边在同一输出目录构建。
先有序停止本任务管理的服务，再构建；验证后按需要恢复本地预览。

只改文档时检查文件链接、内容和 Git diff；应用检查结果不能记成重新执行。

## 代码快速定位

| 要改什么 | 入口 | 搜索关键词 |
| --- | --- | --- |
| 页面布局、顶部导航、统一搜索、主题 | `app/globals.css`、`components/shell.tsx`、`lib/navigation.ts`、`components/providers.tsx` | `FrameShell`、`buildSearchHref`、`toggleTheme` |
| 各主榜单焦点轮播 | `components/featured-film.tsx`、`lib/media-presentation.ts` | `FeaturedFilm`、`FEATURED_INTERVAL_MS`、`selectFeaturedMedia` |
| 榜单、搜索、分页、收藏页 | `components/workspace.tsx` | `Workspace`、`loadMore` |
| 找片全部类型 | `components/workspace.tsx`、`lib/ui.ts` | `quick-genres`、`GENRES` |
| 筛选弹层、主题搜索 | `components/filter-panel.tsx` | `FilterPanel`、`KeywordPicker` |
| 海报卡片、完整日期、全部类型、序号 | `components/media-card.tsx`、`lib/media-presentation.ts` | `MediaCard`、`formatMediaDate`、`cardNumber` |
| 详情、演员、剧照 | `components/detail-view.tsx`、`lib/tmdb/normalize.ts` | `DetailView`、`normalizeDetail` |
| 猜你喜欢横向分页 | `components/recommendations-rail.tsx`、`app/api/recommendations/[mediaType]/[id]/route.ts`、`lib/tmdb/service.ts` | `RecommendationsRail`、`recommendations`、`normalizeRecommendations` |
| 参数白名单与上游接口选择 | `lib/query.ts` | `parseFilters`、`buildCatalogRequest` |
| 缓存、超时、重试 | `lib/tmdb/client.ts` | `createTmdbClient` |
| 真实数据路由 | `app/api/`、`lib/tmdb/server.ts`、`lib/tmdb/service.ts` | `createTmdbService`、`TMDB_NOT_CONFIGURED` |
| 预览样本 | `lib/demo.ts` | `DEMO_MEDIA`、`getDemoCatalog` |
| 收藏校验与持久化 | `lib/favorites.ts` | `frame_favorites_v2`、`parseFavorites` |
| 构建与本地生产包启动 | `scripts/`、`next.config.ts` | `prepare-standalone`、`loadEnvConfig` |
| 自动测试 | `tests/` | `favorites.test.ts`、`navigation.test.ts`、`media-presentation.test.ts`、`query.test.ts`、`tmdb.test.ts` |

## 目录职责与文件生命周期

| 位置 | 放什么 | 保留方式 |
| --- | --- | --- |
| 根目录 | 入口说明、配置、依赖清单、项目总览 | 控制数量，其他文件按用途归位 |
| `app/`、`components/`、`lib/` | 路由、界面、业务与数据逻辑 | 按模块职责维护 |
| `tests/` | 可重复运行的正式测试 | 随功能维护与提交 |
| `scripts/` | 可复用的构建、启动和维护脚本 | 保留明确用途与入口 |
| `docs/`、`docs/reference/` | 持续维护文档与原始参考资料 | 文档更新，原始资料留存 |
| `public/` | 应用使用的正式静态资源 | 与引用组件一起维护 |
| 系统临时目录／`.tmp/` | 一次性探针、接口响应、调试日志和试验 | 使用后清理；`.tmp/` 不进 Git |
| `artifacts/` | 有交付、复检用途的预览图和报告 | 保留正在使用的产物；过期且无引用的及时清理 |
| `.next/`、`node_modules/` | 构建输出、开发依赖 | 不进 Git；运行中保持可用 |

不要往根目录不断追加临时脚本和试验版本。废弃实现确认无引用后清理，不保留无用途副本。
现有原始任务书、原型和截图有追溯用途；整理路径前同步更新引用。

## 交付前清理

1. 检查本任务创建的临时文件和输出，确认哪些仍有交付或复检用途。
2. 删除自己生成且已用完的一次性文件；用途不明或属于用户的文件先核对。
3. 确认可复用脚本、正式测试、参考资料和被引用的产物位于正确目录。
4. 检查 Git 状态及文档链接，记录清理范围，再提交本次改动。

把临时文件加入忽略规则不等于完成清理。后续开发每次交付都执行此检查。

## 每完成一部分，立即更新记录

1. **开发前**：执行 `git status --short`，读进度及最新日志；有用户改动则保留并绕行。
2. **开发时**：按用户授权范围实现；未开始的任务不要提前标完成。
3. **验证后**：更新 `docs/PROGRESS.md` 的状态、代码位置、验证环境与缺口。
4. **同次交付**：在 `docs/CHANGELOG.md` 末尾追加一条记录；阶段改变时同步 `PLAN.md`。
5. **提交前**：清理本任务已用完的临时文件，检查目录与 diff，把本次代码和相关进度记录放在同一个 commit；不纳入无关用户改动。
6. **交付时**：说明结果、未通过或未执行的验证，并给可复制的复检交接。

日志每条必须有：日期、关联任务 ID、具体改动、文件入口、实际验证、遗留事项和下一步。
能确认的提交号写入记录；当前记录对应的 commit 尚未生成时，用记录标题定位 Git，不为补自己的提交号无限追加提交。

## 判断可以标完成的证据

- 页面能用预览样本：记为“本地预览验证”。
- fake fetch 的测试通过：记为“模拟验证”。
- 有效凭证请求 TMDB 成功且交互验收通过：才记为“真实联调通过”。
- 本地 build／start 通过：记为“本地生产包验收”。
- 服务器实际运行并验证：才记为“服务器部署通过”。

单元测试不代替浏览器检查，预览不代替真实联调，部署文件不代替部署验收。

## UI-03 复检路径

1. `/` 默认电影，主导航只有电影／电视剧／找片／收藏；兼容已有 `?media=movie` 链接。
2. `/discover` 的 `#N`、前三项颜色、海报标签和交互与榜单卡片一致；搜索、收藏、推荐也复用 `MediaCard`。
3. `/movie/969681` 顶部没有横幅；左海报右名称与资料；演员区域位于 `detail-content` 之后。
4. “猜你喜欢”首屏保留完整推荐页；滚动到末尾触发 `/api/recommendations/movie/969681?page=2`。分页按复合 ID 去重，最后一页禁用继续向右按钮，空结果和失败分别显示状态。
5. `MediaDetail.recommendations` 现在是 `MediaPage`（`results/page/totalPages/totalResults`），缺失追加资源时以 `page: 0` 重试第一推荐页。

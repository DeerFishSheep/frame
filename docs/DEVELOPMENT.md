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
| 各主榜单通栏轮播 | `components/featured-film.tsx`、`app/globals.css`、`lib/media-presentation.ts` | `FeaturedCarousel`、`featured-image`、`workspace--featured`、`FEATURED_INTERVAL_MS` |
| 榜单、搜索、分页、收藏页 | `components/workspace.tsx` | `Workspace`、`loadMore` |
| 找片全部类型 | `components/workspace.tsx`、`lib/ui.ts` | `quick-genres`、`GENRES` |
| 筛选弹层、主题搜索 | `components/filter-panel.tsx` | `FilterPanel`、`KeywordPicker` |
| 海报卡片、完整日期、全部类型、序号 | `components/media-card.tsx`、`lib/media-presentation.ts` | `MediaCard`、`formatMediaDate`、`cardNumber` |
| 详情、演员、剧照 | `components/detail-view.tsx`、`components/detail-media-strip.tsx`、`lib/tmdb/normalize.ts` | `DetailView`、`DetailMediaStrip`、`StillPhoto` |
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

## 轮播显示规则（UI-07 更新）

- `Workspace` 的 `workspace--featured` 只用于主榜单；CSS 让外层铺满页面，榜单卡片内容仍限制在 1440px 内。
- 桌面 `featured-image img` 使用 `cover` 放大铺满，允许适度裁切；900px 以下以及无背景图的竖海报回退使用 `contain`。`featured-ambient` 模糊层已在 UI-07 移除。
- 页顶上下渐变、图片边缘蒙版匹配深浅主题；900px 以下图文上下排列。轮播外框用 `overflow: clip`，避免按钮聚焦时产生内部滚动偏移。
- 移除暂停／继续按钮和永久暂停状态；`hovered`、`focused`、页面可见性、减少动画偏好共同控制自动切换。手动切换重置计时，离开交互区域恢复。
- 复检 `/`、`/?media=tv`：调整窗口宽高，核对手机主图完整、桌面图片铺满、十部桌面切换高度稳定、无横向溢出；聚焦后应暂停，离开后等待 6 秒应继续。

- UI-06：900px 以下不再为 `.featured-copy` 设置 300px 最低高度，`.featured-actions` 使用固定 `margin-top: 18px`，禁止用自动外边距撑开简介与按钮。手机文字区随内容自然变高，复检 320／390／486／762px 下的长短简介。

## UI-07 详情布局复检

1. `/movie/969681`：700px 以下 `detail-aside`／`detail-main` 通过 `display: contents` 进入同一 Grid；`detail-summary` 保持完整资料块，在海报右侧依次显示片名、日期类型和评分，操作横跨两列，避免三枚按钮撑高海报侧栏。701px 以上恢复桌面两栏。
2. `detail-rating` 禁止换行；人数不再使用 `flex-basis: 100%`。手机外链显示简短的 TMDB／IMDb，完整含义保留在无障碍名称。
3. `DetailMediaStrip` 负责演员与剧照的单行、箭头、键盘、边界状态；演员显示已返回的最多 18 位，剧照显示已返回的最多 12 张，未增加上游取数范围。
4. “相关主题”区域与专属 CSS 已删除；找片中的关键词筛选继续保留。


## UI-10 日期筛选复检

1. `/discover` 打开筛选：电影显示“上映日期”，电视剧显示“首播日期”；两个原生日期框精确到年月日，结束默认北京时间当天。
2. 选择范围并查看结果，URL 保存 `dateFrom=YYYY-MM-DD` 和 `dateTo=YYYY-MM-DD`；刷新后日期复现。默认结束值用 `dateTo=today` 保持动态，手动日期固定，可用“使用今天”恢复。
3. `lib/query.ts` 的 `parseFilters` 保留旧 `yearFrom/yearTo` 链接：起始年转 01-01，结束年转 12-31，当年结束转动态今天；新日期字段优先。`buildCatalogRequest` 分别使用电影 `primary_release_date.gte/lte`、剧集 `first_air_date.gte/lte`，不再扩成年范围。
4. `lib/date-filters.ts` 负责日期合法性、北京时间今天及含首尾的区间；`lib/use-today-date.ts` 在北京午夜、回到页面或窗口聚焦时更新。`Workspace` 续页请求使用同一条件；默认今天不改变主榜单或名称搜索的接口。
5. `tests/date-filters.test.ts` 覆盖闰年、非法日、反向范围、旧链接、动态/固定日期和预览范围。收藏也用 `matchesDateRange`，有范围时缺日期不会补造为满足条件。手机 400px 以下日期框上下排列。


## UI-11 即将上映复检

1. `/?chart=upcoming` 的电影卡片和精选日期都必须晚于北京时间当天；2026-10-12 当天从 10-13 起，不包含今天和早前日期。`lib/query.ts` 的 `buildCatalogRequest` 使用 `/discover/movie`、`primary_release_date.gte=getTomorrowDate()`、`with_release_type=2|3`、`sort_by=popularity.desc`，不限定人为未来上限。
2. 正在上映仍是 `/movie/now_playing`；电视剧“近期在播／今日播出”仍是 `/tv/on_the_air`、`/tv/airing_today`。电影两类都保留上游默认热度顺序，没有在本地按日期重排。
3. `ranked:false` 防止把新的自定义范围标成原官方榜单名次，`MediaCard` 自动显示结果序号。筛选在上游完成后分页，不在浏览器仅剔除当前页。
4. `Workspace` 的 `strictUpcoming` 让请求标识包含北京当天；沿用 `useTodayDate` 午夜及页面恢复更新，取消旧分页、重载第一页并隐藏旧请求内容。上游缓存因明天日期参数不同而换键。
5. 正式测试 `tests/upcoming.test.ts` 覆盖午夜、月末、闰年、年末、分页、路径隔离、跨日缓存与编号含义。真实分页复检 `/api/catalog?chart=upcoming&media=movie&page=2`；预览模式仍明确不提供上映榜样本。


## UI-12 找片类型与已选标签复检

1. `lib/ui.ts` 的 `GENRES` 为常用优先的固定界面顺序，电影19／剧集16种完整保留，不据此声称实时热门排名。`Workspace` 快捷类型与 `FilterPanel` 使用同一列表。
2. `getRegionLabel` 复用 `REGIONS` 中文名称，其他有效地区码用 `Intl.DisplayNames` 解析；`getSortLabel` 复用 `getSortOptions`，日期排序先按电影／剧集归一，旧升序等链接有字段中文回退。
3. `activeFilterCount` 仅为非默认排序加1，默认热度与 `dateTo=today` 不计。`Workspace.applied-filters` 因此在只选排序时出现；主榜单和全局名称搜索不添加排序标签。
4. 复检 `/discover?media=movie&genres=28&region=US&sort=vote_count.desc`：已选区显示“动作／美国／评分数量”；刷新复现；清空后仅选评分数量仍有标签。电视剧显示最近开播，筛选面板选项也叫评分数量。
5. 本次包括已选标签所需的地区／排序共享元数据。原有未提交的分页、找片轮播与关键词移除保留在工作树，不随此任务提交。


## UI-13 已选条件移除复检

1. `components/applied-filters.tsx` 的 `AppliedFilters` 把所有已选条件统一渲染为带小叉、明确无障碍名称的按钮。`Workspace` 将 `updateFilters`／`clearFilters` 传入；不要再把部分已选条件写成不可移除的 span。
2. 点击单项仅合并该项的 reset，并设 `page:1`。日期清除 dateFrom/dateTo 后由找片解析器恢复 today；评分清除上下限，时长清除上下限；排序恢复 DEFAULT_FILTERS.sort，标签随后消失。默认排序和默认日期不生成无效按钮。
3. 地区、语言、评分数量和搜索词分别清除自己的参数，收藏模式继续保留 chart/media 及其他条件。旧含 keywords 的筛选对象可移除主题，但不重新添加关键词入口。
4. `tests/applied-filters.test.ts` 使用真实组件生成的按钮回调，检查其余条件不丢失、分页重置、URL往返、所有标签有小叉、默认标签隐藏、收藏搜索与全清分开。该检查不驱动浏览器；浏览器工具本轮因协议安全策略拒绝读取页面。


## LOCAL-07 局域网开发访问

- `npm run dev` 监听0.0.0.0；手机用Mac实际局域网IP访问。`next.config.ts` 的 `allowedDevOrigins` 调用 `lib/dev-origins.ts/getLocalDevOrigins`，启动时获取本机非回环、RFC1918私有IPv4地址，去重后按具体主机名放行。
- 地址只接受本机接口记录，排除公网、无效、IPv6及通配符；不以手机的客户端IP或任意网段设置白名单。DHCP或Wi-Fi更换后重启即可重新获取。
- Next.js 16.4的开发资源来源检查可造成HTML/API成功但JS脚本403，客户端无法启动后一直显示加载骨架。复检首页中实际script src，分别携带localhost、局域网IP和无关Origin：前两者应200，后者应403。
- `tests/dev-origins.test.ts` 检查私有地址边界、重复、失效接口和地址更换。实体iPhone刷新另行确认，不能把Mac模拟Origin请求写成手机浏览器验收。


## UI-14 手机海报网格至少三列

1. `app/globals.css` 搜索 `Mobile poster grids`：480px以下通过 `.media-grid:not(.list-layout)` 固定3列，350px以下间距6px；移除原480px断点的2列覆盖。加载骨架也使用同一网格规则。
2. 窄屏卡片标题最多两行；保留全部类型、完整日期和评分，底部空间不足时换行。收藏按钮保留30×36px最小触达区域。详细列表和详情横向推荐不套用该规则。
3. 浏览器视口验证320／350／375／390／430／480／600／760px均3列、1440px为6列；页面无横向溢出，已加载卡片日期和评分无重叠。320px切换详细列表为1列，切回恢复3列。这是本机浏览器模拟尺寸，不是实体iPhone验收。
4. 复检首页并切换到上述宽度；本机截图位于 `artifacts/previews/frame-mobile-three-columns.jpg`。


## LOCAL-08 macOS 双击启停

- 根目录 `启动.command`／`停止.command` 为可执行Bash入口，按自身路径定位项目，支持中文／空格目录，从任意工作目录启动。交互终端保留中文结果，按回车退出；非交互调用直接返回退出码。
- `scripts/dev-control.sh` 的 `start_dev`／`stop_dev` 统一控制。启动调用 `npm run dev -- --port 3000`，Node detached进程组与重定向标准流使其独立于终端；探测首页HTTP 200后才提示就绪。PATH补充Apple Silicon／Intel Homebrew目录，缺Node／npm或依赖时明确报错，不自动安装。
- `dev_parent` 同时检查实际3000监听进程的cwd、next-server命令、父进程cwd和next dev命令，再向开发父进程发送SIGTERM；不按端口直接杀进程，不用陈旧PID文件，也不自动升级SIGKILL。生产服务或无关进程不会被停止。
- `.tmp/dev.log` 是当前运行日志，每次启动覆盖，权限0600；启动超时保留日志并明确告知后台状态。快捷停止处理已经监听3000端口的开发服务。
- 复检：`bash -n 启动.command 停止.command scripts/dev-control.sh`；依次启动→重复启动→停止→重复停止→恢复启动；再用临时HTTP服务占用3000验证两个入口均退出1且临时服务存活。不要停止用户其他服务来抢占端口。
- 本轮直接执行实际.command文件并使用PTY验证回车退出后服务持续运行、最小系统PATH仍能找到Homebrew Node；未驱动Finder实际双击。真实API返回HTTP 200、source=tmdb、20条。


## IMDB-01 四榜与四种排序

1. `app/page.tsx` → `CatalogEntry` 根据source选择原 `Workspace` 或 `ImdbWorkspace`，来源独立于TMDB筛选词表。`FrameShell.mediaNavigation` 保留IMDB来源／榜单／排序切换媒介；URL恢复状态，换条件回第一页并取消旧请求。
2. `lib/imdb/query.ts` 的 `parseImdbFilters` 校验media／chart／sort／page及重复、未知参数；`imdbChart` 映射四个GraphQL chartType。模块范围只有四榜、四排序与分页，不宣称已接入自定义片单或高级筛选。可见品牌文案统一IMDB。
3. `buildImdbRequest` 请求完整有限榜单（Top250=250、热门=100），用encodeURIComponent编码GraphQL，避免空格转加号导致上游解析失败。`parseImdbChart` 拒绝GraphQL错误、缺页、重复ID、非法评分和人数；不把错误当空榜。日期缺日月则留空，不补造完整日期。
4. `createImdbClient` 缓存16种媒介／榜单／排序组合30分钟，并发去重，短暂失败重试一次；上游失败时可用24小时内旧榜，时间戳仍为原获取时间。没有定时预取或持久数据库。
5. `createImdbService.catalog` 先按完整榜单切页，再以最多6个并发调用 `tmdb.findByImdbId` 补充当前页资料；通过固定 `/find/tt...` 和 `external_source=imdb_id` 查找，仅采用当前媒介结果。IMDB评分／人数／原rank始终保留，匹配失败不丢条目。
6. `Media.id` 支持数字TMDB ID或原始tt ID。`mediaHref`／`mediaKey` 对未匹配IMDB生成独立键和原站外链，已匹配作品沿用TMDB复合键与本站详情。`imageUrl` 只额外允许IMDB海报的固定Amazon图片域；收藏恢复校验并保存imdbId。
7. `ImdbWorkspace` 复用 `CatalogPager` 自动续页；generation、AbortController、observer active与completedPage共同避免旧条件或重复请求回写。加载失败保留手动重试。旧收藏面板的评分标签改为“评分（按卡片来源）”。
8. CSS搜索 `IMDB provider navigation`：平台来源由UI-22移到榜单标题右侧；分类与排序位置由UI-15统一放到轮播下方、榜单标题下方，取消原轮播的负外边距遮挡；卡片小屏也显示评分来源。320／390／760px三列、1440px六列，未见横向溢出或日期评分重叠。
9. 复检 `tests/imdb.test.ts`、`tests/catalog-pager.test.ts`，再检查四榜×四排序、Top250第13页与热门第5页。真实热门剧集中的Monster（tt13207736）验证未匹配仍保留第9位，点击链接在IMDB打开。


## UI-15 统一平台榜单区域

- `components/catalog-section.tsx` 的 `CatalogSection` 固定渲染标题／操作、`charts` 分类栏、可选 `sort` 排序、children内容。`Workspace` 与 `ImdbWorkspace` 在轮播后调用同一组件；新增平台也走此入口，不再自行放置分类区。
- `charts` 仅提供ID、标签、选中态和回调；`chartAction` 提供原榜／全部影片链接；排序按钮通过 `sort` 提供。数据加载、取消请求、URL与分页仍由各平台原逻辑负责。
- 删除 `imdb-controls` 顶部容器及其宽度、留白、窄屏分类样式；排序使用共用 `catalog-sort-row`。分类链接在共同的横向分类栏中保持可访问，长分类栏沿用横向滚动。
- 复检两个平台DOM顺序：`.featured-film` 后是 `.catalog`，内部为 `.catalog-heading` → `.chart-tabs` → 可选 `.catalog-sort-row` → `.catalog-status` → `.media-grid`。649px下两平台标题到分类间距均15px、按钮高40px；IMDB在320／390／649／1440px顺序正确且无横向溢出，前三个宽度三列。
- 本轮为位置／组件复用修正，没有新增机械重复测试。浏览器已点选热门电影与评分数量并刷新验证保留；本机截图 `artifacts/previews/frame-unified-chart-controls.jpg`。


## UI-16 全站统一更新机制

- **统一入口**：所有请求区域使用 `useAsyncResource`，所有分页区域使用 `usePagedResource`；平台只提供key／分组／取数函数／标签，不再各自编写清空响应、加载和错误生命周期。榜单、搜索、找片、详情、精选、推荐均已接入。
- `AsyncResource` 保留最后成功的data及dataKey，单独记录requestKey、pending和error；更新成功原子替换，失败不清空。版本号与AbortController拦截旧响应，16项浏览器资源缓存支持返回与跨来源切换，缓存命中不延长原新鲜期。SSR单独实例，不使用浏览器会话数据。
- `usePagedResource` 复用泛型 `CatalogPager`，续页锁、取消和去重共用；`refreshMediaPages` 重取已经加载的页范围后整体替换，不能只刷新第一页把40部变回20部。推荐列表使用同一分页机制，保留横向位置。
- `CatalogView.context` 与结果一同保存标题、轮播标签、排名语义和起始页。UI-17覆盖原更新反馈：`ResourceRegion`／`resourceLoadingProps` 给更新区域设置data-loading／aria-busy／inert，`data-skeleton` 标记块、文字行、正文；CSS保留盒子并在原位绘制骨架。`ResourceFeedback` 只提示错误，不显示更新横幅。
- `useStableUpdate` 在数据提交前捕获可见控件／内容锚点，布局提交后恢复视口；`usePageContinuity` 在站点外壳统一记录历史位置，后退／前进在内容就绪后按锚点恢复，用户滚轮／触摸／方向键会取消等待恢复。移除详情更新中的强制scrollTo(0)。
- `useViewState`／`useScrollMemory` 共用最多64项界面状态，覆盖布局、轮播、收藏展示数量、横向分类栏、演员、剧照、推荐。浏览器内存缓存通过版本化的浏览器单例跨路由块／开发热更新复用；不宣称硬刷新、关闭浏览器或缓存淘汰后仍有离线恢复。
- 轮播不再以整组影片ID作为React key重建；`featuredIndex` 优先保留当前影片，否则保留原位置并按新长度收敛。请求更新时暂停轮换；同一影片的详情重取不重建推荐组件。
- 标题栏来源与同页媒介链接、搜索更新使用scroll:false。来源切换复用该来源／媒介上次URL，点击已选来源沿用当前URL，避免把排序重置到默认。
- **复检**：`tests/resource-state.test.ts` 的12项回归覆盖各区域保留旧内容、失败重试、乱序／取消、缓存页数恢复、整段分页刷新失败、缓存边界、来源切换和轮播位置；既有7项分页测试继续覆盖真实共用分页器。浏览器检查IMDB排序、找片科幻筛选、搜索、40部列表返回、推荐横向返回。
- **UI-16历史证据（更新画面已被UI-17覆盖）**：排序／筛选更新期间20张卡片、0骨架；搜索从“星际穿越”改为“哈利·波特”时保留5条，高度1200、标题y=186.195及scrollY=0均不变；返回40部列表前后scrollY=2595、同一遗传厄运卡片top=353.477一致；推荐横向返回前后scrollLeft=415.5。网络失败／旧响应等为自动模拟验证。


## UI-17 原位骨架加载

- **定位**：`components/resource-feedback.tsx` → `resourceLoadingProps`、`ResourceRegion`、`ResourceFeedback`；`app/globals.css` → `[data-loading=true] [data-skeleton]`。所有来源共用，不新增平台生命周期。
- **接入**：`MediaCard` 标记海报与文字；`FeaturedFilm`、详情资料、演员／剧照、`RecommendationsRail` 使用同一属性与样式。图片包在保留画幅的容器中，使骨架可用伪元素显示；更新时阻止点击被遮盖的旧内容。
- **状态区别**：普通刷新只遮盖当前请求的数据区域；加载下一页仅保留原尾部加载器。首次无数据仍用原骨架。更新失败移除骨架，原内容恢复可用并提供重试。DOM、数据缓存、滚动恢复及页数机制保持。
- **本轮检查**：当前工作树类型检查、102 / 102既有测试通过；独立提交快照webpack生产编译及102 / 102测试通过。快照符号链接依赖导致standalone追踪警告，未把该临时包记为独立启动验收。开发服务持续运行，首页／找片／详情HTTP 200。
- **待复检**：内置浏览器停在连接失败页，重新加载被URL安全策略阻止；本轮未取得新截图，也未验证像素位置或手机实机。恢复预览后，切换排序／筛选、刷新详情，观察原位骨架、无横幅和原滚动位置；再确认续页不遮盖旧卡片。


## UI-18 统一影片地区

- `Media.countryCodes` 是可选ISO代码数组；undefined表示列表没有提供，空数组表示已知无资料。`mediaCountryCodes` 优先使用作品origin_country，再用production_countries的ISO代码，不能使用语言或当前筛选国家推断。
- `lib/media-regions.ts` 统一中文命名、去重和格式；轮播用“地区 · 类型”，卡片右上角用“地区 · 电影／剧集”，详情标签行显示作品地区，基本资料“制片地区”保留production_countries的含义，同样转为中文。已知类型ID也统一使用已有中文字典，避免详情与卡片同类名称不一致。
- `useMediaRegions` 复用useAsyncResource；缺少地区且已匹配TMDB数字ID的条目，独立请求 `/api/regions/[mediaType]/[id]`。附加信息不阻塞榜单；专用500项元数据缓存不淘汰用于历史恢复的16项榜单缓存；切换影片依据dataKey防止旧地区串入新轮播。
- `tmdb.regions` 最多4个并发，复用服务端TMDB请求去重和缓存；成功响应浏览器私有缓存30分钟，旧缓存回退60秒。字段缺失／请求失败不造地区，不让附加信息错误清空卡片；未匹配TMDB的IMDB条目及无地区的预览样本不猜测。
- 新收藏保留补齐后的countryCodes；旧收藏仍可恢复，重新显示时按需补齐。卡片长地区在小屏省略，完整地区保存在title，详情显示完整列表。
- 复检：先跑 `tests/media-regions.test.ts` 的中文映射、来源回退、无推断、收藏兼容、卡片顺序、缓存／参数验证和并发释放，再看 `tv/288673` 与电影／剧集榜单。


## UI-19 手机轮播与回顶部

- `FeaturedCarousel` 保持一套控件DOM和轮播状态；900px及以下用容器宽度定位到16:9图片的下缘，距底14px，网格上排计数、下排箭头与横条。移除手机文案区末尾为旧控件预留的空间；961px以上桌面原定位不变。
- 海报与片名使用同一组 `detailLink`，共用mediaHref的本站详情／未匹配IMDB外链规则。层级调整保证图片可点击，装饰渐变不拦截点击。触摸横滑后抑制同次点击，保留点击、按钮、键盘及原轮播逻辑；实体触控未在本轮验收。
- `formatFeaturedLabel` 共用“来源·榜单名”；Workspace使用chartMeta，IMDB使用原榜名称，找片标识其来源。预览仍标“预览”，不冒充实时榜单。
- `BackToTop` 放在FrameShell，始终显示44px圆形按钮，兼容安全区；点按先通知usePageContinuity中止等待中的历史位置恢复，然后平滑回顶，减少动画模式直接回顶。
- 验证：108项既有测试与类型检查；真实页面320／390／649／900／961／1440px无横向溢出；手机居中、数字上置，桌面位置不变；标题及海报跳转到正确详情，回顶scrollY由804变为0。截图：`artifacts/previews/frame-mobile-hero-controls.png`。本轮不改路由或构建配置，开发服务持续运行，未重跑生产构建。


## UI-20 十部轮播与五个指示横条

- `lib/media-presentation.ts`：FEATURED_LIMIT=10，featuredIndicatorPositions按每5部固定分页，1–5属于第一页，6–10属于第二页（UI-21覆盖原移动窗口）。短列表按实际数量显示，不补造作品。
- `FeaturedCarousel` 共用分页指示轨道，数字显示实际总数。IMDB移除额外slice(0,5)，主榜单与找片沿用同一个selectFeaturedMedia。
- 手机counter累计translateY(14px)：UI-21在原4px基础上再下移10px；不移动箭头或横条，桌面不变。
- 检查：110项测试与类型检查通过；新增指示窗口首尾／所有10个位置／短列表测试，选片测试核验10部去重保序。浏览器实测05→10→01→02始终5条且高亮正确；390px数字下移4px、横条宽127px且无横向溢出。


## UI-21 固定分页指示条

- `.carousel-dots` 是5条宽的裁切窗口，`.carousel-dot-track` 包含两页，跨5／6边界时translateX在0与-100%之间过渡，时长280ms；同页切片不移动整组横条。反向跨页与10→1循环回到第一页。
- 每页独立容器，非当前页aria-hidden和inert，不能误点或Tab进入；键盘跨页后在下一动画帧将焦点移到新的当前指示按钮，防止inert更新清掉焦点。沿用减少动画的CSS规则。
- 手机序号再下移10px，总偏移14px，并设置pointer-events:none，避免遮住横条点击区域。
- 实测：05/10为第一页第五条，06/10为第二页第一条；左移终点-127px，反向过渡捕获中间位置；前后键盘焦点均跟随当前影片。类型检查及110项测试通过，固定页映射及不足5项的尾页已有回归。


## UI-22 共用标题栏平台选择

- **入口与扩展**：`CatalogEntry` 提供 `CatalogSourceContext`，`CatalogSection` 统一放置 `SourcePicker`，来源按钮在视图按钮之前。`lib/catalog-sources.ts` 集中维护已接入平台名称、图标与来源URL规则；新增平台仍需实现数据工作区并在CatalogEntry接入，共用标题栏和选择面板自动复用。
- **标题**：CatalogSection接收dataSource，统一formatCatalogTitle；兼容原有内存标题前缀，避免重复平台名。轮播formatFeaturedLabel也调用相同规则。预览保留“预览”，找片、搜索、收藏沿用自己的页面标题。
- **浮层**：复用已有Radix Dialog。760px及以下用底部模态面板，桌面用触发按钮旁的非模态浮层；支持Esc、焦点归还、方向键选择和局部滚动。选择即关闭，同一平台不重新导航；没有平台搜索框。
- **连续浏览**：保留movie／tv；每个来源与媒介分别恢复catalog-location条件。导航scroll:false并保留可见内容；吸顶标题用data-sticky-heading标记，`isPinnedAnchor` 让两个共用位置机制忽略固定标题。用户／历史已移动视口后，旧的渲染锚点不再覆盖它；URL先变化时不把新页滚动写入旧页记录。
- **图标**：`public/platforms/tmdb.ico` 与 `imdb.png` 均为原始官方站点图标，UI只通过圆形容器显示；来源和校验值见 `docs/reference/PLATFORM_ICONS.md`。
- **验证**：115项测试与类型检查通过；实测TMDB本周趋势→IMDB热门电影／人气优先→TMDB恢复本周趋势，电视剧切换保留tv。320px标题与按钮间距10px且无横向溢出；两图标均加载成功，面板输入框0个；Esc关闭后焦点回到触发按钮。桌面浮层宽320px，距按钮下缘8px，无遮罩。滚动到y=1058时标题top=0；一次来源切换前后scrollY=254、标题top=401.75一致。
- **返回验证**：站内详情返回后仍定位到同一影片；记录的一组位置为scrollY 1901.5→1892.5、影片top 351.867→360.867，未标为像素完全一致。自动化聚焦会先将目标滚至视区中间，比较时需要使用聚焦后的坐标。
- **复检**：`tests/catalog-sources.test.ts`，再检查手机与桌面面板、来源条件和粘性标题。截图放artifacts/previews；本轮保持开发服务运行，未重跑生产构建或部署。

## UI-23 平台切换定位到榜单开头

- **触发范围**：`CatalogEntry.select` 仅在选择另一来源时记录本次意图；source提交后调用 `lib/catalog-scroll.ts` 的 `alignCatalogStart`。当前来源重复选择、初次加载、筛选／排序和历史返回不会触发该意图，原有平台／媒介条件继续恢复。
- **落点**：`CatalogSection` 的普通文档流哨兵增加 `data-catalog-start`。用该锚点的文档坐标将标题行对齐视口顶部；不可用粘性标题的top=0判断是否到达榜单开头，否则深处卡片仍会留在视口中。
- **加载与让位**：MutationObserver／ResizeObserver跟随本次加载及海报高度变化，内容不再aria-busy且连续3帧位置稳定后释放。wheel、touchmove、pointerdown、滚动键、历史导航、回顶部以及路由effect清理会立即取消。显式平台事件 `frame:catalog-source-change` 先终止尚未结束的历史恢复，其他滚动机制保持。
- **IMDB顺序**：`ImdbWorkspace` 共用电影／剧集分类数组改为popular、top；仅交换按钮位置，不改默认榜单、排序或接口。
- **验证**：`tests/catalog-scroll.test.ts` 9项模拟回归覆盖非吸顶锚点、慢加载导致的多次位移、结束后释放、6类用户中断与路由清理；工作树及独立提交快照的124 / 124与类型检查通过。390／690／1440px真实页面切换后，标题距视口顶部小于1px，分类和第一排紧接其下；继续下滑和重复选择当前平台不会定位到开头。
- **复检**：打开电影／电视剧榜单，下滑后从标题右侧切换TMDB／IMDB；读 `[data-catalog-start]` 与 `.catalog-heading` 的top，两者都应约0，不能只检查吸顶标题。再确认分类顺序、普通详情返回和继续滚动。截图 `artifacts/previews/frame-source-switch-alignment.png`；本轮开发服务持续运行，未重跑生产构建或部署。

- **本轮详情返回复检**：1440px从IMDB热门电影的“大学炸弹客”进入详情，再用站内“返回榜单”；前后scrollY均1081.5、片名top均497.594，没有回到榜单开头。电影／剧集分类分别实测为“热门电影、Top 250 电影”和“热门剧集、Top 250 剧集”。

## UI-24 详情演员重复记录

- **原因与样本**：movie/450519《速度与激战》的credits将Joe Chambrello（1792850）分别以JC、J.C.返回。原normalizeDetail直接保留两条，DetailView以actor.id作为key，真实浏览器复现两次相同key警告。
- **共用处理**：`lib/media-cast.ts` 的 `mergeCastMembers` 按有效人员ID合并，同名不同ID不合并；保留首次出现顺序及每个不重复角色，用“ / ”连接。重复记录可以补齐空姓名／头像，不改原数组。
- **接入**：`normalizeDetail` 先合并完整演员记录，再应用既有18位显示上限，避免重复记录占名额或丢失后面的角色；`DetailView` 在渲染前调用相同函数，覆盖修复前的浏览器详情快照，不要求用户清空缓存。仍以唯一actor.id作为key，未改成下标规避。
- **验证**：`tests/media-cast.test.ts` 4项覆盖电影／剧集、真实重复样本、多角色、同名不同人、稳定顺序、缺资料补齐、不修改快照、重复调用、合并后上限和无效ID；工作树和独立提交快照的128 / 128与类型检查通过。真实接口和页面从14条变为13位，Joe只显示一次且角色为JC / J.C.。浏览器旧数据热更新与重新加载均显示13张卡，刷新后没有新增控制台错误，横向浏览正常。
- **复检入口**：`/movie/450519` → 主要演员 → Joe Chambrello；接口 `/api/details/movie/450519`，检查cast的ID唯一。截图 `artifacts/previews/frame-cast-duplicates-fixed.png`。本轮未改API请求、未重启开发服务，未运行生产构建／部署。

## DOUBAN-01 豆瓣榜单与片单

- **入口与共用层**：`CatalogEntry` 注册DoubanWorkspace，标题右侧SourcePicker自动显示豆瓣。IMDB与豆瓣统一使用 `ProviderCatalog`，包括原位骨架、自动分页、失败重试、视图切换、轮播、计数和原站入口；底层仍是usePagedResource／ResourceRegion／CatalogSection，不引入单独刷新流程。
- **控制与选项**：`lib/douban/options.json` 保存参考模块12.5.0的8片单与298类型榜ID，及推荐筛选选项。`query.ts` 统一枚举、媒介隔离、页码、URL与上游请求构造。类型榜为分类→具体榜单；片单支持预设与输入链接；更多推荐条件默认折叠。
- **数据获取**：`/api/douban` → server → service → client。只请求固定的m.douban.com/rexxar/api/v2路径，超时12秒、不跟随重定向；10分钟缓存、同请求合并、最多120页缓存、24小时内失败回退并标注旧时间。分页20条，最高500页；超限会显示范围，未知总数只显示已加载，不编造总数。
- **身份与原始数据**：豆列条目id不是作品id，优先target_id／subject URL／uri。normalize保留豆瓣评分、票数、排名、中文名和类型；非影视与重复主体跳过，仍按上游start推进。未匹配使用douban:<id>，匹配后用TMDB详情ID；mediaKey始终优先doubanId，避免分季对应同一TMDB剧集导致卡片丢失。收藏允许两类身份并保存doubanId。
- **资料匹配**：四个并发调用tmdb.findByTitle；唯一的片名／原名＋年份精确匹配才接入本站详情，重名／缺年份／不同年份不猜测。原始评分不会被TMDB值覆盖；匹配失败仍保留豆瓣海报与原站链接。日期只使用真实完整日期或明确年份＋月日，不能按年份补1月1日。
- **图片与图标**：可靠匹配优先使用TMDB图片，否则允许固定doubanio照片域名；图片／轮播预加载不发送页面Referer。豆瓣本地SVG来自Simple Icons，来源见PLATFORM_ICONS.md。关于页、卡片评分、外链与页脚来源同步支持豆瓣。
- **真实验证**：主要模块分支、8内置片单、Top250末页、剧集／综艺口碑、推荐详细筛选及快捷分类均200；所有298类型榜只做了路由与选项静态回归，没有声称逐一远端验收。浏览器自定义subject_collection链接打开成功，自动20→40且40个唯一键，收藏刷新保留后撤销测试收藏；320px三列、选择器无溢出，切换IMDB再回豆瓣恢复喜剧类型榜且起点top=0.18。
- **自动检查**：新增18项 `tests/douban.test.ts` 覆盖完整选项矩阵、参数／链接边界、混合条目、ID、日期、评分与匹配、缓存旧数据、收藏和4并发上限；全量146 / 146与类型检查通过。
- **复检入口**：`/?source=douban&media=movie&chart=popular`；类型榜、片单、推荐及电视剧各选一项，切换来源、收藏刷新、列表续页。能力对应表与真实验收边界见 `docs/reference/DOUBAN_MODULE.md`。未进行服务器部署。

- **独立提交验证**：仅导出本次暂存代码到临时目录，146 / 146测试通过；webpack生产编译、TypeScript和静态页面生成成功。依赖通过符号链接引用原工作区，standalone文件追踪有目录边界提示；没有据此宣称独立生产包已验收，也未重启本地开发服务。
- **补充页面验证**：电视剧导航保留豆瓣来源，全球剧集口碑榜显示10部剧集；无效媒介榜单／外部片单地址／错误类型榜ID由接口返回400。截图：`artifacts/previews/frame-douban-source-mobile.png`、`artifacts/previews/frame-douban-lists-desktop.png`。

- **收藏身份补充**：榜单条目继续以豆瓣ID区分，但可靠匹配的同一TMDB影片在不同来源及详情页共用sameFavorite规则，收藏恢复也按别名去重；未匹配豆瓣条目仍以原ID保存。新增跨来源收藏回归。

- **收藏端到端验收**：豆瓣片单收藏《钢铁侠》后进入本站详情，按钮显示“已收藏”；从详情取消后，返回豆瓣恢复“收藏钢铁侠”，测试收藏已撤销。最终146项测试与独立版本生产编译通过；页面控制台未出现新增错误。

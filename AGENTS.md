# FRAME 项目开发与记录规则

## 开始工作前

1. 执行 `git status --short`，保护未提交的用户改动。
2. 先读 `PLAN.md` → `docs/PROGRESS.md` → `docs/CHANGELOG.md` 末尾最新记录。
3. 再读 `docs/DEVELOPMENT.md` 和本次相关代码，不把原始 PRD 或旧记忆当成当前完成状态。

## 当前环境

- 当前是本地开发阶段。默认 `npm run dev`，开发、运行和测试在本地完成。
- `npm run build`／`npm run start` 仅用于本地生产包验收。
- 服务器部署未开始。除用户明确要求进入该阶段，不执行远程部署、发布或服务器操作。
- TMDB 凭证由本地 Next.js 服务端读取 `.env.local`；不暴露给浏览器，不输出或提交凭证。

## 当前界面方向

- 按用户最新反馈采用直观的影视站布局：顶部电影／电视剧／找片／收藏和统一搜索；根路径默认电影，不设独立首页。
- 常用流程围绕选片、详情和收藏；找片直接展开对应媒介的全部类型，详细条件放进已有筛选按钮，默认收起更多条件。
- 主榜单顶部使用当前分类的最多 5 部不同影视轮播；所有卡片复用 `MediaCard`，编号统一为 `#N` 和同一颜色／位置；官方名次与列表序号仅在无障碍标签中说明。
- 详情采用左竖海报、右作品资料；演员与剧照独立分区。猜你喜欢使用单行横向推荐列表，按 TMDB 分页继续加载，不截取固定前几部。
- 卡片在海报内展示完整上映／首播日期及全部类型；缺日期如实显示待定，不能补造年月日。
- 控制介绍文案、英文装饰与重复控件数量；后续改动沿用此方向，原始杂志版原型仅作历史参考。

## 项目结构与临时文件清理

- 保持专业、职责清晰的目录结构。根目录放项目入口、配置和总览；代码、文档、测试和资源按用途归位。
- 沿用现有分层：`app/` 路由、`components/` 界面、`lib/` 业务与数据、`tests/` 正式测试、`scripts/` 可复用脚本、`docs/` 项目文档、`public/` 正式静态资源。
- 新增原始参考资料放 `docs/reference/`。现有用户资料先核对用途及引用再整理，不因为未跟踪就判为垃圾。
- 一次性探针、抓取响应、调试日志和试验文件优先放系统临时目录，用完及时删除；确需放项目内时集中到 `.tmp/` 并忽略提交。
- `artifacts/` 只保留有交付或复检用途的产物；其他一次性产物在使用后清理，过期产物清理前核对引用。
- 本任务自行生成且已确认无用的临时文件可直接清理；用途不明、用户改动、凭证及被引用的交付文件先核对，避免误删。
- 正式回归测试、构建／启动脚本和项目文档按各自目录维护；开发依赖与构建目录遵循运行生命周期，运行中的 `.next/` 等不作为杂物清除。
- 每次交付前检查本任务新增文件、临时输出和 Git 状态，完成清理后再提交；不能只靠 `.gitignore` 掩盖堆积。

## 每次完成实现、修复或优化后

1. 运行与改动相关的本地检查。
2. 同步 `docs/PROGRESS.md`：任务状态、实现位置、实际验证、未完成项和下一步。
3. 在 `docs/CHANGELOG.md` 末尾追加记录；日期用北京时间。
4. 目标、范围或阶段变化时同步 `PLAN.md`；使用方式变化时同步 `README.md`／`docs/DEVELOPMENT.md`。
5. 文档更新与临时文件清理属于完成标准。检查目录和 diff，把本次代码与相关记录一起提交，不把无关用户改动纳入 commit。
6. 最终回复附简短、具体、可复制的【复检交接】，说明改动位置与复检入口。

纯文档整理也追加开发记录；不虚构没有运行的检查。
记录保留任务 ID、关联代码入口和验证证据，方便另一个 Agent 快速定位。

## 进度记录的真实性

- 分开写“已实现”“本地预览验证”“模拟验证”“真实 TMDB 联调”“服务器验收”。
- 不把固定样本筛选写成全站筛选，不把模拟请求写成真实 API 成功。
- 不把部署文件准备完成写成已经部署，不把请求触发缓存写成定时预取。
- 没有真实历史快照，不显示或记录虚构名次升降。
- `docs/reference/ORIGINAL_PLAN.md` 是原始资料存档，不继续修改。
- 发现文档与代码不符时，核对后修正进度，并在开发记录中写明更正。

## Git 工作方式

- 编辑前检查状态；干净基线已有 commit 时用现有提交作检查点，有需保留的本次内容时先做独立检查点。
- 完成并验证后检查 `git status --short` 和 diff，按本次范围提交；用户明确禁止提交时除外。
- 不使用 `git reset --hard`、`git checkout --` 或强制清理覆盖用户文件。

以下 Next.js 自动维护区保留原样。

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

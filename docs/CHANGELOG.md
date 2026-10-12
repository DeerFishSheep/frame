# FRAME｜开发记录

按时间顺序追加，最新记录在文件末尾。保留旧记录；发现旧结论错误时追加更正。
当前功能状态以 [PROGRESS.md](PROGRESS.md) 为准，阶段与目标见 [PLAN.md](../PLAN.md)。

## 2026-10-12 — 第一版应用基线

- **关联任务**：MVP-01～MVP-15。
- **代码提交**：`500ea76`，`feat: build FRAME cinematic discovery frontend and server API`。
- **改动**：从 HTML 原型建立 Next.js 应用；实现响应式界面、双主题、榜单、搜索、Discover 筛选、详情、收藏及服务端 TMDB 数据层。
- **入口**：`components/workspace.tsx`、`components/filter-panel.tsx`、`components/detail-view.tsx`、`lib/tmdb/`、`app/api/`。
- **运行准备**：提供 `.env.example`、本地生产包启动脚本、Docker／Compose 和 README。
- **当时验证**：本地类型检查、21 项自动测试、生产构建与启动通过；设计预览的桌面／手机交互经过检查。
- **修复记录**：主题 OR／AND、收藏热度排序、禁用存储时的初始化、剧集导航保留媒介参数、收藏初始化的 hydration 问题。
- **遗留事项**：没有有效 TMDB 联调证据；`similar` 未接入；没有定时预取、持久缓存、历史快照或服务器部署。
- **下一步**：按 LOCAL-01～LOCAL-06 在本地完成真实数据验收与剩余缺口。

这是第一版开发期间的历史记录；后续重复检查必须另记日期和实际结果。

## 2026-10-12 — 原始需求归档

- **关联任务**：DOC-01。
- **提交**：`4c7f02f`，`docs: preserve original FRAME project brief`。
- **改动**：将修改前的 `PLAN.md` 完整复制到 `docs/reference/ORIGINAL_PLAN.md` 并纳入 Git。
- **目的**：让原始需求可追溯，同时将根目录 PLAN 改成持续维护的项目入口。
- **其他原始资料**：开发任务书、HTML 原型、参考截图继续保留原路径，不纳入本次无关提交。

## 2026-10-12 — 建立项目进度与 Agent 交接文档

- **关联任务**：DOC-01、S1、S2。
- **用户确定**：当前是本地开发阶段，开发、运行和测试在本地完成；服务器部署属于后续阶段。
- **改动文件**：`PLAN.md`、`AGENTS.md`、`README.md`、`docs/PROGRESS.md`、`docs/DEVELOPMENT.md`、本开发记录。
- **改动内容**：分开管理目标、当前状态、历史记录和开发流程；在 AGENTS 中要求每完成一部分就更新进度及日志，并随本次变更提交。
- **状态核对**：第一版代码存在；真实接口返回 `503 TMDB_NOT_CONFIGURED`；`similar` 和定时预取未实现；部署文件存在但未部署。
- **本次验证**：本地 `npm run typecheck` 通过；`npm test` 为 21 / 21 通过；6 份项目文档、21 个本地链接、28 个任务 ID 复核通过，原始归档和 Next.js 自动维护区不变。
- **未重跑**：浏览器交互、应用生产构建与 Docker 镜像构建；本次没有改应用代码。
- **遗留事项**：LOCAL-01～LOCAL-06 待继续；服务器不操作。
- **下一步**：后续 Agent 先读 AGENTS → PLAN → PROGRESS → 本日志末尾，再按用户任务开发。

# 资源渠道品牌图标来源

任务：RES-04。下载及本地验证日期：2026-10-15（北京时间）。

图标存放于 `public/icons/resource-channels/`，由浏览器直接读取本地文件，不运行时请求第三方图标服务。不用文字徽记或自行绘制的图形替代品牌。

## 来源清单

| 渠道 | 本地文件 | 下载来源 |
| --- | --- | --- |
| 百度网盘 | `baidu.svg` | https://raw.githubusercontent.com/fish2018/pansou-web/main/public/pan-icons/baidu.svg |
| 阿里云盘 | `aliyun.svg` | https://raw.githubusercontent.com/fish2018/pansou-web/main/public/pan-icons/ali.svg |
| 夸克网盘 | `quark.svg` | https://raw.githubusercontent.com/fish2018/pansou-web/main/public/pan-icons/kuake.svg |
| 光鸭云盘 | `guangya.svg` | https://raw.githubusercontent.com/fish2018/pansou-web/main/public/pan-icons/guangya.svg |
| 天翼云盘 | `tianyi.svg` | https://raw.githubusercontent.com/fish2018/pansou-web/main/public/pan-icons/tianyi.svg |
| UC网盘 | `uc.svg` | https://raw.githubusercontent.com/fish2018/pansou-web/main/public/pan-icons/uc.svg |
| 移动云盘 | `mobile.svg` | https://raw.githubusercontent.com/fish2018/pansou-web/main/public/pan-icons/yidong.svg |
| 115网盘 | `115.svg` | https://raw.githubusercontent.com/fish2018/pansou-web/main/public/pan-icons/115.svg |
| 迅雷网盘 | `xunlei.svg` | https://raw.githubusercontent.com/fish2018/pansou-web/main/public/pan-icons/xunlei.svg |
| 123网盘 | `123.svg` | https://raw.githubusercontent.com/fish2018/pansou-web/main/public/pan-icons/123.svg |
| PikPak | `pikpak.png` | https://mypikpak.com/apple-touch-icon.png |

## 来源与归属说明

- 前十项来自 Pansou Web 公开源码的 `public/pan-icons/` 品牌资产目录。下载时上游 `main` 提交为 `4429f9f585ecd2a43327970c198c59dc66a9d222`；可用该提交替换来源 URL 中的 `main` 复查。
- PikPak 来自其官方网站首页明确引用的 Apple Touch 图标，原文件为 180×180 PNG。
- 115 图标另外与 https://115.com/favicon.ico 视觉核对，确认同为该品牌的“5”形标志；本站使用上游可缩放 SVG。
- 品牌名称与标志归各自品牌权利人所有。此次未查得 Pansou Web 仓库声明的许可证（GitHub 仓库元数据 `license` 为 null），也未查得这些图标单独的授权说明；不将公开可下载视为公共领域或 MIT 授权。
- 上游 SVG 作为公开项目既有品牌资产使用，不能据此声称各文件均从品牌官网原始导出。PikPak 为官网直接来源，115 另有官网图形核对。

## 文件检查

- 十个 SVG 均经过 XML 解析、安全检查和本地渲染：不含脚本、事件处理属性、外部资源引用或 `foreignObject`。天翼 SVG 仅有内部渐变引用。
- `mobile.svg` 仅移除了上游外部 DTD 声明，图形路径、颜色及 viewBox 保持不变；其余下载图标内容未修改。
- 使用本地 Sharp 解码全部文件并渲染预览，逐个查看确认是品牌图形而非 HTML 错误页。SVG 原始尺寸为 128×128；PikPak PNG 为 180×180。
- 磁力、电驴为协议入口，由界面使用通用磁力／链接图标。本站按用户截图展示13项，不显示“其他”入口。

# 平台图标来源

获取日期：2026-10-14（北京时间）。用于UI-22及DOUBAN-01榜单来源选择器。

| 平台 | 本地文件 | 原始资源 |
| --- | --- | --- |
| TMDB | `public/platforms/tmdb.ico` | [TMDB 原始图标](https://www.themoviedb.org/favicon.ico) |
| IMDB | `public/platforms/imdb.png` | [IMDB 原始图标](https://m.media-amazon.com/images/G/01/imdb/images-ANDW73HA/favicon_iPhone_retina_180x180._CB1582158069_.png) |
| 豆瓣 | `public/platforms/douban.svg` | [Simple Icons 豆瓣标识](https://raw.githubusercontent.com/simple-icons/simple-icons/develop/icons/douban.svg) |

- TMDB图标为官网favicon，含48／32／16px图像；IMDB图标为其官网页面声明的180px图标。
- 原图文件保留；界面通过CSS圆形容器显示，旁边名称使用TMDB／IMDB／豆瓣。图标从本站加载，不依赖访客直接连接平台网站。
- 图标仅标识数据来源；原有TMDB完整署名Logo与来源说明继续保留。

## 文件校验

- `public/platforms/tmdb.ico`：SHA-256 `139d4f59002104e9b74781d439f4accb22449d7c36001f023a3db8ffdbde642d`
- `public/platforms/imdb.png`：SHA-256 `18dc6c76031d38d29763be5964abd4c20315bd0f746cd496851b9f2451c38a79`

- 豆瓣标识使用Simple Icons维护的矢量路径，原文件保留，CSS显示为绿色圆底白色标识。
- `public/platforms/douban.svg`：SHA-256 `d937acabda395264eca5bd85ad27606cd212c2c4cd29cfccd89a5b3077ec66a8`

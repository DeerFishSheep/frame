# Soeasy 落地页（可选）

把静态文件放进这两个目录，然后执行 `../filmsou.sh up soeasy`：

- `html/index.html` —— 落地页本体
- `conf/default.conf` —— nginx 配置（可选，不提供就用镜像默认配置）

容器只监听 `127.0.0.1:${SOEASY_PORT:-8080}`，对外请交给反向代理。

页面里调用 Pansou 时，容器内地址是 `http://pansou:80`（同一 compose 网络）。

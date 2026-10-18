#!/usr/bin/env bash
# filmsou.sh — 帧榜 / Pansou / Soeasy 统一部署管理
#
# 用法：
#   ./filmsou.sh              交互菜单
#   ./filmsou.sh up frame     只部署帧榜
#   ./filmsou.sh up full      联合部署（帧榜 + Pansou）
#   ./filmsou.sh update frame v1.0.1
#   ./filmsou.sh rollback frame
#   ./filmsou.sh doctor
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEPLOY_DIR="${SCRIPT_DIR}/deploy"
COMPOSE_FILE="${DEPLOY_DIR}/compose.yaml"
ENV_FILE="${DEPLOY_DIR}/.env"
ENV_EXAMPLE="${DEPLOY_DIR}/.env.example"

info() { printf '==> %s\n' "$*"; }
ok()   { printf '[ok] %s\n' "$*"; }
warn() { printf '[!!] %s\n' "$*"; }
die()  { printf '[xx] %s\n' "$*" >&2; exit 1; }

need_docker() {
  command -v docker >/dev/null 2>&1 || die "未安装 Docker。请先执行: curl -fsSL https://get.docker.com | sh"
  docker compose version >/dev/null 2>&1 || die "缺少 docker compose 插件（Docker 20.10+ 自带）"
  [ -f "${COMPOSE_FILE}" ] || die "找不到 ${COMPOSE_FILE}，请在仓库根目录运行本脚本"
}

compose() { docker compose -f "${COMPOSE_FILE}" --env-file "${ENV_FILE}" "$@"; }

ensure_env() {
  if [ ! -f "${ENV_FILE}" ]; then
    [ -f "${ENV_EXAMPLE}" ] || die "缺少 ${ENV_EXAMPLE}"
    cp "${ENV_EXAMPLE}" "${ENV_FILE}"
    chmod 600 "${ENV_FILE}"
    ok "已生成 ${ENV_FILE}（请按需填写 TMDB 密钥）"
  fi
}

env_get() {
  [ -f "${ENV_FILE}" ] || return 0
  awk -F= -v k="$1" '$1==k { sub(/^[^=]*=/, ""); print; exit }' "${ENV_FILE}"
}

env_set() {
  local k="$1" v="$2" tmp
  tmp="$(mktemp)"
  if grep -q "^$k=" "${ENV_FILE}" 2>/dev/null; then
    awk -F= -v k="$k" -v v="$v" 'BEGIN{ OFS="=" } $1==k { print k, v; next } { print }' "${ENV_FILE}" > "$tmp"
  else
    cp "${ENV_FILE}" "$tmp"
    printf '%s=%s\n' "$k" "$v" >> "$tmp"
  fi
  mv "$tmp" "${ENV_FILE}"
  chmod 600 "${ENV_FILE}"
}

env_backup() {
  local stamp
  stamp="$(date +%Y%m%d-%H%M%S)"
  cp "${ENV_FILE}" "${ENV_FILE}.bak-${stamp}"
  ok "已备份配置到 ${ENV_FILE}.bak-${stamp}"
}

# 帧榜怎么找到 Pansou：容器内网用服务名，宿主机用 docker 网关，外部的让用户填。
resolve_pansou_url() {
  local mode="$1" port choice url
  port="$(env_get PANSOU_PORT)"; port="${port:-23456}"
  if [ "$mode" = "codeploy" ]; then
    env_set PANSOU_BASE_URL "http://pansou:80"
    ok "帧榜 -> Pansou: http://pansou:80（同一容器网络）"
    return 0
  fi
  printf 'Pansou 在哪里？\n'
  printf '  1) 本机 Docker（端口 %s）\n' "$port"
  printf '  2) 另一台机器 / 域名\n'
  read -r -p '选择 [1]: ' choice
  case "${choice:-1}" in
    1) url="http://172.17.0.1:${port}";;
    2) read -r -p '完整地址（含协议和端口）: ' url;;
    *) die "无效选择";;
  esac
  [ -n "$url" ] || die "地址不能为空"
  env_set PANSOU_BASE_URL "$url"
  ok "帧榜 -> Pansou: $url"
}

wait_healthy() {
  local name="$1" limit="${2:-90}" waited=0 st
  while [ "$waited" -lt "$limit" ]; do
    st="$(docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "$name" 2>/dev/null || echo missing)"
    case "$st" in
      healthy|running) ok "$name == $st"; return 0;;
      unhealthy|exited|dead|missing) warn "$name == $st"; return 1;;
    esac
    sleep 3
    waited=$((waited + 3))
  done
  warn "$name 健康检查超时（${limit}s）"
  return 1
}

profile_of() {
  case "$1" in
    frame|pansou|soeasy) printf '%s' "$1";;
    *) die "未知项目: $1（可选 frame / pansou / soeasy）";;
  esac
}

deploy_project() {
  local target="$1"
  ensure_env
  case "$target" in
    frame)
      resolve_pansou_url query
      info "启动帧榜"
      compose --profile frame up -d frame
      wait_healthy frame && ok "帧榜已启动，端口 ${FRAME_PORT:-3000}"
      ;;
    pansou)
      info "启动 Pansou"
      compose --profile pansou up -d pansou
      wait_healthy pansou && ok "Pansou 已启动，端口 ${PANSOU_PORT:-23456}"
      ;;
    soeasy)
      [ -f "${DEPLOY_DIR}/soeasy/index.html" ] || warn "缺少 deploy/soeasy/index.html，Soeasy 页面会是 404"
      compose --profile soeasy up -d soeasy
      ok "Soeasy 已启动"
      ;;
    full)
      resolve_pansou_url codeploy
      info "联合启动帧榜 + Pansou"
      compose --profile frame --profile pansou up -d frame pansou
      if wait_healthy pansou && wait_healthy frame; then
        ok "联合部署完成：帧榜 ${FRAME_PORT:-3000} / Pansou ${PANSOU_PORT:-23456}"
      else
        warn "有服务未通过健康检查，执行 ./filmsou.sh logs 查看"
        return 1
      fi
      ;;
    *) die "未知部署目标: $target（frame / pansou / soeasy / full）";;
  esac
}

version_var_of() {
  case "$1" in
    frame) printf 'FRAME_VERSION';;
    pansou) printf 'PANSOU_VERSION';;
    *) die "该项目不支持版本管理: $1";;
  esac
}

image_of() {
  case "$1" in
    frame) env_get FRAME_IMAGE;;
    pansou) env_get PANSOU_IMAGE;;
    *) printf '';;
  esac
}

# 更新 = 记旧版本 -> 备份配置 -> 拉新镜像 -> 重启 -> 自检 -> 失败自动回退
update_project() {
  local svc="$1" wanted="${2:-}" var image old
  ensure_env
  svc="$(profile_of "$svc")"
  var="$(version_var_of "$svc")"
  image="$(image_of "$svc")"
  old="$(env_get "$var")"; old="${old:-latest}"
  if [ -z "$wanted" ]; then
    read -r -p "目标版本（当前 $old，直接回车取消）: " wanted
  fi
  [ -n "$wanted" ] || { warn "已取消"; return 0; }
  [ "$wanted" = "$old" ] && { warn "已经是 $old，无需更新"; return 0; }

  info "更新 $svc: $old -> $wanted"
  env_backup
  env_set "$var" "$wanted"
  if compose --profile "$svc" pull "$svc" \
     && compose --profile "$svc" up -d "$svc" \
     && wait_healthy "$svc" "${HEALTH_TIMEOUT:-120}"; then
    ok "$svc 已更新到 $wanted"
  else
    warn "$svc 更新失败，自动回退到 $old"
    env_set "$var" "$old"
    compose --profile "$svc" pull "$svc" || warn "旧镜像拉取失败，尝试用本地缓存"
    compose --profile "$svc" up -d "$svc" || true
    wait_healthy "$svc" "${HEALTH_TIMEOUT:-120}" || warn "回退后仍不健康，请检查 logs"
    return 1
  fi
}

rollback_project() {
  local svc="$1" wanted="${2:-}" var image old
  ensure_env
  svc="$(profile_of "$svc")"
  var="$(version_var_of "$svc")"
  image="$(image_of "$svc")"
  old="$(env_get "$var")"
  printf '本地已有版本（%s）：\n' "$image"
  docker image ls "$image" --format '  {{.Tag}}  ({{.CreatedSince}})' | head -20 || true
  if [ -z "$wanted" ]; then
    read -r -p "回退到哪个 tag（当前 $old，直接回车取消）: " wanted
  fi
  [ -n "$wanted" ] || { warn "已取消"; return 0; }
  env_backup
  env_set "$var" "$wanted"
  compose --profile "$svc" pull "$svc" || warn "镜像不在本地或拉取失败，尝试启动已有镜像"
  compose --profile "$svc" up -d "$svc"
  wait_healthy "$svc" "${HEALTH_TIMEOUT:-120}" && ok "$svc 已回退到 $wanted"
}

show_status() {
  ensure_env
  info "帧榜 : http://127.0.0.1:${FRAME_PORT:-3000}   版本 $(env_get FRAME_VERSION)"
  info "Pansou: http://127.0.0.1:${PANSOU_PORT:-23456}   版本 $(env_get PANSOU_VERSION)"
  info "Pansou 地址: $(env_get PANSOU_BASE_URL)"
  printf '\n'
  compose ps
}

show_logs() {
  ensure_env
  local svc="${1:-}"
  if [ -n "$svc" ]; then compose logs -f --tail=200 "$(profile_of "$svc")"; else compose logs -f --tail=100; fi
}

restart_project() {
  ensure_env
  local svc="${1:-}"
  if [ -n "$svc" ]; then
    svc="$(profile_of "$svc")"
    compose --profile "$svc" restart "$svc"
    wait_healthy "$svc" && ok "$svc 已重启"
  else
    compose restart
  fi
}

stop_project() {
  ensure_env
  local svc="${1:-}"
  if [ -n "$svc" ]; then compose --profile "$(profile_of "$svc")" stop "$(profile_of "$svc")"; else compose stop; fi
  ok "已停止"
}

# 真实验收：不只看容器活着，要看页面和搜索能不能用
doctor() {
  ensure_env
  local port pansou_port code failed=0
  port="${FRAME_PORT:-$(env_get FRAME_PORT)}"; port="${port:-3000}"
  pansou_port="$(env_get PANSOU_PORT)"; pansou_port="${pansou_port:-23456}"

  info "1/7 环境"
  docker --version || failed=1
  docker compose version || failed=1
  printf '     架构: %s\n' "$(uname -m)"

  info "2/7 配置"
  if [ -n "$(env_get TMDB_API_KEY)$(env_get TMDB_API_READ_ACCESS_TOKEN)" ]; then ok "TMDB 密钥已配置"; else warn "TMDB 密钥为空，页面会显示预览模式"; failed=1; fi
  if [ -n "$(env_get PANSOU_BASE_URL)" ]; then ok "Pansou 地址: $(env_get PANSOU_BASE_URL)"; else warn "PANSOU_BASE_URL 为空，资源搜索不可用"; fi

  info "3/7 容器"
  compose ps

  info "4/7 帧榜首页"
  code="$(curl -s -o /dev/null -w '%{http_code}' -m 10 "http://127.0.0.1:${port}/about" || echo 000)"
  if [ "$code" = "200" ]; then ok "HTTP 200"; else warn "HTTP $code"; failed=1; fi

  info "5/7 帧榜接口"
  code="$(curl -s -o /dev/null -w '%{http_code}' -m 20 "http://127.0.0.1:${port}/api/douban?source=douban&media=tv&chart=weekly&collection=tv_weekly_best&page=1" || echo 000)"
  if [ "$code" = "200" ]; then ok "榜单接口 HTTP 200"; else warn "榜单接口 HTTP $code"; failed=1; fi

  info "6/7 Pansou 存活"
  code="$(curl -s -o /dev/null -w '%{http_code}' -m 10 "http://127.0.0.1:${pansou_port}/" || echo 000)"
  if [ "$code" = "200" ] || [ "$code" = "404" ]; then ok "Pansou 端口有响应（HTTP $code）"; else warn "Pansou 无响应（HTTP $code）"; failed=1; fi

  info "7/7 真实资源搜索（帧榜 -> Pansou）"
  code="$(curl -s -o /tmp/filmsou-doctor-search.json -w '%{http_code}' -m 45 \
    -X POST -H 'Content-Type: application/json' \
    -d '{"keyword":"测试","channels":["quark"]}' \
    "http://127.0.0.1:${port}/api/resources/search" || echo 000)"
  if [ "$code" = "200" ]; then
    ok "搜索接口 200（返回 $(wc -c < /tmp/filmsou-doctor-search.json) 字节）"
  else
    warn "搜索接口 HTTP $code"; head -c 200 /tmp/filmsou-doctor-search.json 2>/dev/null || true; printf '\n'; failed=1
  fi
  rm -f /tmp/filmsou-doctor-search.json

  printf '\n'
  if [ "$failed" = "0" ]; then ok "全部通过"; else warn "有检查项未通过，见上面 [!!]"; return 1; fi
}


pick_project() {
  printf '选择项目：\n  1) 帧榜\n  2) Pansou\n'
  read -r -p '选择 [1]: ' c
  case "${c:-1}" in 1) printf 'frame';; 2) printf 'pansou';; *) die "无效选择";; esac
}

manage_menu() {
  while true; do
    printf '\n管理操作：\n'
    printf '  1) 查看状态\n  2) 跟踪日志\n  3) 重启\n  4) 停止\n  5) 返回\n'
    read -r -p '选择 [1]: ' c
    case "${c:-1}" in
      1) show_status;;
      2) printf '  1) 帧榜  2) Pansou  3) 全部\n'; read -r -p '选择 [3]: ' s
         case "${s:-3}" in 1) show_logs frame;; 2) show_logs pansou;; *) show_logs;; esac;;
      3) printf '  1) 帧榜  2) Pansou  3) 全部\n'; read -r -p '选择 [3]: ' s
         case "${s:-3}" in 1) restart_project frame;; 2) restart_project pansou;; *) restart_project;; esac;;
      4) printf '  1) 帧榜  2) Pansou  3) 全部\n'; read -r -p '选择 [3]: ' s
         case "${s:-3}" in 1) stop_project frame;; 2) stop_project pansou;; *) stop_project;; esac;;
      5) return 0;;
      *) warn "无效选择";;
    esac
  done
}

menu() {
  need_docker
  while true; do
    printf '\n==============================================\n'
    printf '  filmsou — 帧榜 / Pansou / Soeasy 部署管理\n'
    printf '==============================================\n'
    printf '  1) 部署 / 配置 帧榜\n'
    printf '  2) 部署 / 配置 Pansou\n'
    printf '  3) 部署 / 配置 Soeasy（可选）\n'
    printf '  4) 联合部署（帧榜 + Pansou）\n'
    printf '  5) 更新指定项目\n'
    printf '  6) 状态 / 日志 / 重启 / 停止\n'
    printf '  7) 回退指定项目版本\n'
    printf '  8) 环境自检（页面 + 真实搜索）\n'
    printf '  0) 退出\n'
    read -r -p '选择: ' choice
    case "${choice:-}" in
      1) deploy_project frame;;
      2) deploy_project pansou;;
      3) deploy_project soeasy;;
      4) deploy_project full;;
      5) update_project "$(pick_project)";;
      6) manage_menu;;
      7) rollback_project "$(pick_project)";;
      8) doctor || true;;
      0) ok "再见"; exit 0;;
      *) warn "无效选择";;
    esac
  done
}

usage() {
  printf '用法: ./filmsou.sh [命令] [参数]\n\n'
  printf '  (无参数)                    交互菜单\n'
  printf '  up frame|pansou|soeasy|full 部署\n'
  printf '  update <frame|pansou> [版本] 更新并自检，失败自动回退\n'
  printf '  rollback <frame|pansou> [版本] 回退到指定版本\n'
  printf '  status                      查看状态\n'
  printf '  logs [frame|pansou]         跟踪日志\n'
  printf '  restart [frame|pansou]      重启\n'
  printf '  stop [frame|pansou]         停止\n'
  printf '  doctor                      环境自检（页面 + 真实搜索）\n'
}

main() {
  if [ "$#" -eq 0 ]; then menu; return 0; fi
  need_docker
  local cmd="$1"; shift || true
  case "$cmd" in
    up) deploy_project "${1:-frame}";;
    update) [ "$#" -ge 1 ] || die "update 需要项目名"; update_project "$1" "${2:-}";;
    rollback) [ "$#" -ge 1 ] || die "rollback 需要项目名"; rollback_project "$1" "${2:-}";;
    status) show_status;;
    logs) show_logs "${1:-}";;
    restart) restart_project "${1:-}";;
    stop) stop_project "${1:-}";;
    doctor) doctor;;
    help|-h|--help) usage;;
    *) usage; die "未知命令: $cmd";;
  esac
}

main "$@"


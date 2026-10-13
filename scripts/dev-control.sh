#!/bin/bash
# FRAME local dev control: identify the live listener, never trust a stale PID file.
set -u
export PATH="/opt/homebrew/bin:/usr/local/bin:${PATH:-/usr/bin:/bin}:/usr/sbin:/sbin"
project_dir="$(cd -- "$(dirname -- "$0")/.." && pwd -P)" || exit 1
cd -- "$project_dir" || exit 1
port=3000
url="http://localhost:$port"
log_file="$project_dir/.tmp/dev.log"

listeners() {
  /usr/sbin/lsof -nP -t -iTCP:"$port" -sTCP:LISTEN 2>/dev/null | sort -u
}

process_cwd() {
  /usr/sbin/lsof -a -p "$1" -d cwd -Fn 2>/dev/null | sed -n 's/^n//p'
}

# Check the listener AND its Next dev parent against this exact project folder.
# A production server or another project's process must not be stopped.
dev_parent() {
  local pid="$1" parent command
  [ "$(process_cwd "$pid")" = "$project_dir" ] || return 1
  command="$(/bin/ps -p "$pid" -o command=)"
  case "$command" in next-server*) ;; *) return 1 ;; esac
  parent="$(/bin/ps -p "$pid" -o ppid= | tr -d ' ')"
  [[ "$parent" =~ ^[0-9]+$ ]] && [ "$parent" -gt 1 ] || return 1
  [ "$(process_cwd "$parent")" = "$project_dir" ] || return 1
  command="$(/bin/ps -p "$parent" -o command=)"
  case "$command" in *"/next dev"*) printf '%s\n' "$parent" ;; *) return 1 ;; esac
}

ready() {
  [ "$(/usr/bin/curl --noproxy '*' -s -o /dev/null -w '%{http_code}' --max-time 2 "$url/")" = 200 ]
}

start_dev() {
  local pid current launcher attempt
  current="$(listeners)"
  if [ -n "$current" ]; then
    for pid in $current; do
      if ! dev_parent "$pid" >/dev/null; then
        printf '启动失败：3000端口被其他服务占用，未修改或停止它。\n'
        return 1
      fi
    done
    if ready; then
      printf 'FRAME 已在运行，无需重复启动：%s\n' "$url"
      return 0
    fi
    printf 'FRAME 进程已在运行，但页面暂未就绪。请查看：%s\n' "$log_file"
    return 1
  fi

  if ! command -v node >/dev/null || ! command -v npm >/dev/null; then
    printf '未找到 Node.js 或 npm，请先安装 Node.js，并确认终端能运行 npm。\n'
    return 1
  fi
  if [ ! -f node_modules/next/dist/bin/next ]; then
    printf '缺少项目依赖。请在项目目录运行 npm ci，然后重新双击启动。\n'
    return 1
  fi
  mkdir -p "$project_dir/.tmp" || return 1
  # Explicit port prevents Next from silently selecting 3001 on a collision.
  # A separate process group and redirected streams survive Terminal closure.
  launcher="$(node - "$log_file" "$port" <<'NODE'
const { spawn } = require('node:child_process');
const { openSync, closeSync, fchmodSync } = require('node:fs');
const log = openSync(process.argv[2], 'w', 0o600);
fchmodSync(log, 0o600);
const child = spawn('npm', ['run', 'dev', '--', '--port', process.argv[3]], {
  cwd: process.cwd(), detached: true, stdio: ['ignore', log, log],
});
closeSync(log);
child.on('error', () => { console.error('无法启动 npm。'); process.exitCode = 1; });
child.on('spawn', () => { console.log(child.pid); child.unref(); });
NODE
)" || return 1
  printf '正在启动 FRAME…\n'
  for ((attempt=0; attempt<30; attempt++)); do
    if ! kill -0 "$launcher" 2>/dev/null; then
      printf '启动失败，请查看日志：%s\n' "$log_file"
      return 1
    fi
    current="$(listeners)"
    if [ -n "$current" ]; then
      for pid in $current; do
        dev_parent "$pid" >/dev/null || {
          printf '3000端口被其他服务占用，请查看日志：%s\n' "$log_file"
          return 1
        }
      done
      if ready; then
        printf 'FRAME 已启动：%s\n日志：%s\n关闭此窗口不影响运行；双击“停止.command”停止。\n' "$url" "$log_file"
        return 0
      fi
    fi
    sleep 1
  done
  printf '启动等待超时，进程仍在后台。请查看日志：%s\n可用“停止.command”停止已监听的开发服务。\n' "$log_file"
  return 1
}

stop_dev() {
  local current pid parent attempt
  current="$(listeners)"
  if [ -z "$current" ]; then
    printf 'FRAME 当前没有在3000端口运行。\n'
    return 0
  fi
  # Validate every listener before sending any signal.
  for pid in $current; do
    dev_parent "$pid" >/dev/null || {
      printf '3000端口属于其他服务，未停止任何进程。\n'
      return 1
    }
  done
  for pid in $current; do
    parent="$(dev_parent "$pid")" || continue
    kill -TERM "$parent" 2>/dev/null || true
  done
  for ((attempt=0; attempt<30; attempt++)); do
    if [ -z "$(listeners)" ]; then
      printf 'FRAME 已停止。\n'
      return 0
    fi
    sleep 1
  done
  printf '服务未能在30秒内退出，未强制结束进程。请查看：%s\n' "$log_file"
  return 1
}

case "${1:-}" in
  start) start_dev ;;
  stop) stop_dev ;;
  *) printf '用法：bash scripts/dev-control.sh start|stop\n'; exit 1 ;;
esac

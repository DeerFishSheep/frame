#!/bin/bash
# Finder 双击入口；具体启停逻辑统一放在 scripts/。
project_dir="$(cd -- "$(dirname -- "$0")" && pwd -P)" || exit 1
/bin/bash "$project_dir/scripts/dev-control.sh" start
result=$?
if [ -t 0 ]; then
  printf '\n按回车关闭此窗口。'
  read -r _
fi
exit "$result"

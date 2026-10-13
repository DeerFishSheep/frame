#!/bin/bash
project_dir="$(cd -- "$(dirname -- "$0")" && pwd -P)" || exit 1
/bin/bash "$project_dir/scripts/dev-control.sh" stop
result=$?
if [ -t 0 ]; then
  printf '\n按回车关闭此窗口。'
  read -r _
fi
exit "$result"

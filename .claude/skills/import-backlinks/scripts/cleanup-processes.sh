#!/usr/bin/env bash
# 清理本 skill 结束后的残留。
# - 释放 opencli 常见 site session tab lease（勿 stop daemon、勿杀正式 Chrome）
# - 仅杀掉已孤儿化（PPID=1）的 chrome-headless-shell，避免误伤并行 agent-browser 任务
set -euo pipefail

# 1) 释放 opencli adapter tab lease（persistent 名；ephemeral 正常已自行释放）
if command -v opencli >/dev/null 2>&1; then
  for s in site:sim site:sem site:ahrefs; do
    opencli browser "$s" close 2>/dev/null || true
  done
fi

# 2) 仅清理孤儿 chrome-headless-shell（父进程已死 → PPID=1）
#    带 --type= 的是子进程，随主进程退出；不要动仍挂在 agent-browser daemon 下的实例
orphans=0
while IFS= read -r pid; do
  [[ -z "$pid" ]] && continue
  cmd=$(ps -o command= -p "$pid" 2>/dev/null || true)
  [[ "$cmd" == *"--type="* ]] && continue
  ppid=$(ps -o ppid= -p "$pid" 2>/dev/null | tr -d ' ')
  if [[ "$ppid" == "1" ]]; then
    kill "$pid" 2>/dev/null || true
    orphans=$((orphans + 1))
  fi
done < <(pgrep -f 'Library/Caches/ms-playwright/.*/chrome-headless-shell' 2>/dev/null || true)

if [[ "$orphans" -gt 0 ]]; then
  sleep 1
  while IFS= read -r pid; do
    [[ -z "$pid" ]] && continue
    cmd=$(ps -o command= -p "$pid" 2>/dev/null || true)
    [[ "$cmd" == *"--type="* ]] && continue
    ppid=$(ps -o ppid= -p "$pid" 2>/dev/null | tr -d ' ')
    if [[ "$ppid" == "1" ]]; then
      kill -9 "$pid" 2>/dev/null || true
    fi
  done < <(pgrep -f 'Library/Caches/ms-playwright/.*/chrome-headless-shell' 2>/dev/null || true)
fi

# 3) 清理已无主进程占用的 Playwright 临时 profile（忽略仍在用的）
find /var/folders -type d -name 'playwright_chromiumdev_profile-*' -exec rm -rf {} + 2>/dev/null || true

orphan_left=0
while IFS= read -r pid; do
  [[ -z "$pid" ]] && continue
  cmd=$(ps -o command= -p "$pid" 2>/dev/null || true)
  [[ "$cmd" == *"--type="* ]] && continue
  ppid=$(ps -o ppid= -p "$pid" 2>/dev/null | tr -d ' ')
  if [[ "$ppid" == "1" ]]; then
    orphan_left=$((orphan_left + 1))
  fi
done < <(pgrep -f 'Library/Caches/ms-playwright/.*/chrome-headless-shell' 2>/dev/null || true)

if [[ "$orphan_left" -gt 0 ]]; then
  echo "warning: orphan chrome-headless-shell still running ($orphan_left)"
  pgrep -lf chrome-headless-shell || true
  exit 1
fi

echo "cleanup ok: opencli site sessions closed; orphan chrome-headless-shell: none"

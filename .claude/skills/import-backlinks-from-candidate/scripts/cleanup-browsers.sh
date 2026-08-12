#!/usr/bin/env bash
# 清理本 skill 产生的 agent-browser / chrome-headless-shell 残留进程
set -euo pipefail

agent-browser close 2>/dev/null || true

if command -v agent-browser >/dev/null 2>&1; then
  while IFS= read -r line; do
    s=$(echo "$line" | sed 's/→//g' | awk '{print $1}')
    [[ -z "${s:-}" || "$s" == "Active" ]] && continue
    agent-browser --session "$s" close 2>/dev/null || true
  done < <(agent-browser session list 2>/dev/null || true)
fi

pkill -f 'Library/Caches/ms-playwright/.*/chrome-headless-shell' 2>/dev/null || true
sleep 1
pkill -9 -f 'Library/Caches/ms-playwright/.*/chrome-headless-shell' 2>/dev/null || true

find /var/folders -type d -name 'playwright_chromiumdev_profile-*' -exec rm -rf {} + 2>/dev/null || true

if pgrep -f chrome-headless-shell >/dev/null 2>&1; then
  echo "warning: chrome-headless-shell still running:"
  pgrep -lf chrome-headless-shell || true
  exit 1
fi

echo "chrome-headless-shell: none"

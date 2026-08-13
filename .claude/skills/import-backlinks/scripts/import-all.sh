#!/usr/bin/env bash
# Import backlinks for one domain from all three sources in sequence:
#   1. sim    --limit 200
#   2. sem    --limit 200
#   3. ahrefs (no limit; returns all visible on page)
# ahrefs is failure-prone: on failure SKIP without retry (do not re-run).
# sim/sem failures are reported but do not block later steps.
#
# Usage: import-all.sh <website> [--dry-run]
# Env:   OPENCLI_BROWSER_COMMAND_TIMEOUT (default 180)
set -uo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if [ "$#" -lt 1 ]; then
  echo "Usage: $0 <website> [--dry-run]" >&2
  exit 2
fi

website="$1"; shift
dry_run=0
for arg in "$@"; do
  case "$arg" in
    --dry-run) dry_run=1 ;;
    *) echo "unknown arg: $arg" >&2; exit 2 ;;
  esac
done

cd /Users/coderlim/Projects/link-master || { echo "link-master not found" >&2; exit 1; }
export OPENCLI_BROWSER_COMMAND_TIMEOUT="${OPENCLI_BROWSER_COMMAND_TIMEOUT:-180}"

candidate_snapshot="$(mktemp "${TMPDIR:-/tmp}/import-backlinks-candidates.XXXXXX")" || exit 1
on_exit() {
  rm -f "$candidate_snapshot"
  # 无论成功 / 失败 / 中断，都清理残留进程（清理失败不覆盖导入 exit 码）
  bash "$script_dir/cleanup-processes.sh" || true
}
trap on_exit EXIT
cp data/json/backlink-candidates.json "$candidate_snapshot" || exit 1

# run_source <source> [extra flags...]  -- passes --dry-run when set
run_source() {
  local src="$1"; shift
  if [ "$dry_run" -eq 1 ]; then
    node scripts/import-backlink-candidates.js "$website" --source "$src" "$@" --dry-run
  else
    node scripts/import-backlink-candidates.js "$website" --source "$src" "$@"
  fi
}

status=0

echo "=== [1/3] sim --limit 200 ==="
run_source sim --limit 200 || { echo ">> sim FAILED"; status=1; }

echo "=== [2/3] sem --limit 200 ==="
run_source sem --limit 200 || { echo ">> sem FAILED"; status=1; }

echo "=== [3/3] ahrefs (all; skip on failure, NO retry) ==="
run_source ahrefs || echo ">> ahrefs failed, skipping (no retry)"

if [ "$dry_run" -eq 1 ]; then
  echo ">> dry-run: search.yahoo candidate cleanup skipped"
elif ! node "$script_dir/filter-new-search-yahoo.js" \
  "$candidate_snapshot" data/json/backlink-candidates.json; then
  echo ">> search.yahoo candidate cleanup FAILED" >&2
  status=1
fi

echo "=== done ==="
exit $status

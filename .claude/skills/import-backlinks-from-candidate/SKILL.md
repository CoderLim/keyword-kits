---
name: import-backlinks-from-candidate
description: >-
  把 backlink-candidates.json 中 deleted_at 非空的候选记录核验后迁移到 backlinks.json。
  流程：逐条用 agent-browser 打开链接判定「可发外链 + dofollow/nofollow」，确认可发的导入
  （dofollow 标 Dofollow、nofollow 标 Nofollow），不确定的直接从 candidate 移除，
  结束后在对话中输出导入报告，并清理残留的 agent-browser / chrome-headless-shell 进程。
  支持指定导入条数，不指定则默认处理全部 deleted_at 非空记录。
  在用户提到导入候选外链、迁移 candidate 到 backlinks、处理 deletedAt/deleted_at 候选、
  核验外链可发性、import backlinks from candidate 时使用。
  必须使用 agent-browser（不要改用直连 Playwright），任务结束必须做进程清理。
---

# import-backlinks-from-candidate

把 link-master 的 `data/json/backlink-candidates.json` 中 `deleted_at` 非空的记录，核验后迁移到 `data/json/backlinks.json`。数据文件在 **link-master** 仓库：`/Users/coderlim/Projects/link-master`。

## 流程

### 1. 确定要处理的记录

```bash
cd /Users/coderlim/Projects/link-master
node -e "const fs=require('fs');const c=JSON.parse(fs.readFileSync('data/json/backlink-candidates.json','utf8'));const d=c.filter(r=>r.deleted_at);console.log('deleted_at records:',d.length)"
```

- 支持用户指定导入条数 N：取前 N 条。
- 不指定：处理全部 `deleted_at` 非空记录。
- 注意字段是 snake_case 的 `deleted_at`，不是 `deletedAt`。

### 2. 逐条核验

用 agent-browser 打开每个链接，判定「可发外链？」「dofollow/nofollow？」和「link_category？」，判定标准与方法见 [references/link-check-guide.md](references/link-check-guide.md)。

- **明确可发**（评论区开放 / 有投稿入口 / 站点外链 dofollow 等）→ 归入 `import`，并记录 link_type（Dofollow 或 Nofollow）与 link_category（有限取值，见核验指南）。
- **不确定**（404、需登录、无评论区、无任何外链入口等）→ 归入 `remove`。
- 判定存疑时一律归 `remove`，不硬猜。

### 3. 批量写入

把判定结果写到临时 verified.json：

```json
[
  { "link": "https://...", "action": "import", "link_type": "Dofollow", "link_category": "Technology", "type": "Text Link" },
  { "link": "https://...", "action": "import", "link_type": "Nofollow", "link_category": "Education", "type": "HTML Link" },
  { "link": "https://...", "action": "remove" }
]
```

- `link_category` 可省，省略则沿用 candidate 原值（通常是 Unknown）。

执行脚本（一次性完成：导入 → 写 backlinks.json；移除 → 从 candidates 删除）：

```bash
cd /Users/coderlim/Projects/link-master
node /Users/coderlim/.claude/skills/import-backlinks-from-candidate/scripts/import-verified.js /tmp/verified.json
```

### 4. 输出导入报告（仅对话，不写文件）

按以下格式汇报：

```
导入报告（共处理 N 条）
- 导入: A 条（Dofollow: a1，Nofollow: a2）
- 移除: B 条（不确定）
- 跳过: 不在 candidates / 已在 backlinks
- 明细：
  | 链接 | 判定 | link_type | link_category | 结果 |
```

### 5. 任务结束后清理无用进程（必须）

agent-browser 底层是 Playwright Chromium；会话中断或未 `close` 时，`chrome-headless-shell` 会残留并占满 CPU 导致发热。**无论成功、失败还是中途取消，收尾都必须清理。**

```bash
# 1) 关闭本任务用到的 session（含 default 与并行 --session）
agent-browser close
# 若用了命名 session，逐个关闭，例如：
# agent-browser --session v0 close
# agent-browser --session v1 close

# 2) 关闭仍挂着的全部 agent-browser session
for s in $(agent-browser session list 2>/dev/null | awk 'NF && !/Active sessions/ {gsub(/→/,""); print $1}'); do
  agent-browser --session "$s" close 2>/dev/null || true
done

# 3) 杀掉仍残留的无头 Chromium（仅 ms-playwright 缓存里的 headless shell）
pkill -f 'Library/Caches/ms-playwright/.*/chrome-headless-shell' 2>/dev/null || true
sleep 1
pkill -9 -f 'Library/Caches/ms-playwright/.*/chrome-headless-shell' 2>/dev/null || true

# 4) 可选：清理 Playwright 临时 profile
find /var/folders -type d -name 'playwright_chromiumdev_profile-*' -exec rm -rf {} + 2>/dev/null || true

# 5) 确认已清干净
pgrep -lf chrome-headless-shell || echo 'chrome-headless-shell: none'
```

约束：

- **必须用 agent-browser** 做页面核验，不要改用直连 Playwright 绕过 CLI（判定流程与 skill 一致）。
- 并行时限制 `--session` 数量（建议 ≤2），每条核验后对该 session 执行 `close`，不要只依赖进程退出。
- 不要 `pkill` 用户正在用的正式 Chrome / Cursor；只针对 `ms-playwright` 下的 `chrome-headless-shell`。
- 也可直接跑辅助脚本：`bash /Users/coderlim/.claude/skills/import-backlinks-from-candidate/scripts/cleanup-browsers.sh`

## 写入约定（必须遵守）

- `created_at` / `updated_at` 用**当前写入时间**（UTC ISO），不沿用 candidate 原值（见 link-master 仓库 AGENTS.md）。
- 其他字段（dr、organic_traffic、language、link_category、update_date 等）沿用 candidate 原值。
- 导入记录 `status: "normal"`，不保留 `deleted_at`。
- 用 `fs.readFileSync` + `JSON.parse` 核对数据，勿用 `require()`（Node 22 JSON require 有缓存）。

## 前置

1. link-master 数据文件在位：`data/json/backlink-candidates.json`、`data/json/backlinks.json`。
2. agent-browser 可用（`agent-browser open <url>`）。

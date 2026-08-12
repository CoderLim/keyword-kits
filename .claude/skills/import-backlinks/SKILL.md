---
name: import-backlinks
description: >-
  通过 link-master 的 import-backlink-candidates.js 把指定网站的反向链接导入 backlink-candidates.json。
  标准流程：对一个域名依次导入 sim（100 条）、sem（100 条）、ahrefs（返回多少导入多少）；
  ahrefs 易失败，失败不重试直接跳过。底层经 DR 过滤与 hostname 去重。
  标准三源导入结束后，移除本次新增且 hostname 包含 search.yahoo 的候选。
  任务结束必须清理残留（opencli site session；孤儿 chrome-headless-shell）。
  在用户提到导入外链、import backlinks、import candidate backlinks、给某域名导入外链时使用。
---

# import-backlinks

把指定网站的反向链接导入 LinkMaster 候选库。底层脚本在 **link-master** 仓库（非当前仓库）：

`/Users/coderlim/Projects/link-master/scripts/import-backlink-candidates.js`

## 标准流程（一个域名，三源依次导入）

一个域名默认依次导入 sim、sem、ahrefs，用本 skill 自带脚本一次跑完：

```bash
bash /Users/coderlim/.claude/skills/import-backlinks/scripts/import-all.sh <website>
# 先看会导入多少、不写盘：
bash /Users/coderlim/.claude/skills/import-backlinks/scripts/import-all.sh <website> --dry-run
```

`scripts/import-all.sh` 行为：

| 步骤 | source | limit | 失败处理 |
|------|--------|-------|----------|
| 1 | sim | 100 | 报错但不阻塞后续；exit 码反映其成败 |
| 2 | sem | 100 | 同上 |
| 3 | ahrefs | 无（返回多少导入多少） | **易失败：失败不重试，直接跳过** |
| 4 | search.yahoo 过滤 | - | 仅清理本次新增候选；失败时脚本 exit 非 0 |

- ahrefs 失败时脚本打印 `>> ahrefs failed, skipping (no retry)` 并继续；**不要手动重试 ahrefs**。
- sim/sem 任一失败不阻塞后续；脚本 exit 非 0 提示 sim/sem 有失败（这两个可酌情重试，ahrefs 不重试）。
- `OPENCLI_BROWSER_COMMAND_TIMEOUT` 默认 180，可外部覆盖。
- 非 dry-run 时，脚本在三源导入后按导入前的 candidate ID 快照清理本次新增数据：URL hostname 只要包含 `search.yahoo` 就移除，例如 `gr.search.yahoo.com`、`search.yahoo.co.jp`。历史候选不受影响；仅 URL path/query 含 `search.yahoo` 不过滤。
- dry-run 不写候选文件，因此跳过上述落盘清理。
- **EXIT trap 总会跑进程清理**（成功 / 失败 / Ctrl-C 都一样）：调用 `scripts/cleanup-processes.sh`。

以下三条底层命令仅用于单源调试，不包含本 skill 的导入后 `search.yahoo` 清理；标准导入必须使用 `import-all.sh`：

```bash
cd /Users/coderlim/Projects/link-master
OPENCLI_BROWSER_COMMAND_TIMEOUT=180 node scripts/import-backlink-candidates.js <website> --source sim --limit 100
OPENCLI_BROWSER_COMMAND_TIMEOUT=180 node scripts/import-backlink-candidates.js <website> --source sem --limit 100
OPENCLI_BROWSER_COMMAND_TIMEOUT=180 node scripts/import-backlink-candidates.js <website> --source ahrefs || echo "ahrefs failed, skip"
```

## 各 source 行为（单源参考）

| source | opencli 命令 | limit | 需 Chrome |
|--------|--------------|-------|-----------|
| sim | `opencli sim backlinks <d> --limit <N> -f json` | 1–100 | 是，登录 sim.3ue.com |
| sem | `opencli sem backlinks <d> --limit <N> --dofollow true -f json` | 1–100 | 是，登录 sem.3ue.com |
| ahrefs | `opencli ahrefs backlinks <d> -f json` | 无 | 是，Chrome Bridge 免登录 |
| google | `opencli --profile clean google search '<q>' --limit 100 --lang en -f json` | 固定 100 | 是，clean profile |

- `sem` 固定 `--dofollow true`；返回条数可能少于 `--limit`。
- `google` 不针对网站，按固定 query 拉博客评论页；无 website、不做 DR 过滤（标准流程不含 google）。

## 前置

1. `opencli doctor` 通过；sim/sem/ahrefs 子插件已装
2. sim/sem/ahrefs 需 Chrome + OpenCLI 扩展；sim 登录 sim.3ue.com，sem 登录 sem.3ue.com
3. link-master 数据文件在位：`data/json/backlink-candidates.json`、`backlinks.json`、`backlink-import-history.json`

## 过滤与去重（决定 Imported 数）

每条 link 先经过底层 importer：URL 非法 -> `invalid`；根 URL（path 为 `/`）-> `root`；DR<10 或缺失 -> `low_dr`（google 源跳过）；hostname 已存在于现有 candidates+backlinks -> `duplicate`。通过者追加为新候选（含 UUID、dr、import_source、import_target、时间戳）。

标准三源流程随后执行 skill 层过滤：只检查本次新增候选的 URL hostname；包含 `search.yahoo` 的候选从 `backlink-candidates.json` 移除。该判断不检查 URL path、query 或其他字段。

## 输出

每个 source 打印：`Fetched / Imported / Duplicates / Root URLs filtered / Invalid rows filtered / Low/missing DR filtered`。

三源结束后另打印 `Filtered new search.yahoo candidates: <N>`；`N` 是从候选文件移除的本次新增记录数。

- `Fetched`：opencli 实际拉到数；`Imported`：过滤+去重后**新增写入**数（通常 < Fetched）。
- 新候选原子写入 `backlink-candidates.json`；历史（按 domain **覆盖**）写入 `backlink-import-history.json`。

## 任务结束后清理无用进程（必须）

opencli 走 Chrome Bridge（真实 Chrome）；中断或未 `close` 时可能残留 site tab lease。孤儿化的 `chrome-headless-shell`（父进程已死）会空转占 CPU。**无论成功、失败还是中途取消，收尾都必须清理。** `import-all.sh` 已在 EXIT trap 自动执行；若手动跑单源命令，结束后也要清一次。

```bash
bash /Users/coderlim/.claude/skills/import-backlinks/scripts/cleanup-processes.sh
```

脚本行为：

1. `opencli browser site:{sim,sem,ahrefs} close` — 释放常见 site session tab lease  
2. 仅 `kill` **PPID=1** 的孤儿 `chrome-headless-shell`（不碰仍挂在 agent-browser daemon 下的实例）  
3. 尝试删除无主的 `playwright_chromiumdev_profile-*`  

约束：

- **不要** `opencli daemon stop`（daemon 低占用、下次命令还会自启；扩展重连更慢）。
- **不要** `pkill` 用户正在用的正式 Chrome / Cursor。
- **不要** 全量 `pkill chrome-headless-shell`：并行的 `import-backlinks-from-candidate` / agent-browser 会话会被误杀。全量清理用兄弟 skill 的 `cleanup-browsers.sh`。
- 不要手动重试 ahrefs；进程清理与 ahrefs 跳过策略无关。

## 注意

- 底层命令须先 `cd /Users/coderlim/Projects/link-master`（`import-all.sh` 已自动 cd）。
- 重复导入同 domain：`WARN ... continuing anyway`，照常跑，只新增未见 hostname；历史覆盖不累积。
- 核对结果用 `fs.readFileSync`+`JSON.parse`，**勿用 `require()`**（Node 22 对 JSON require 有缓存，读到旧值）。
- 去重是跨 candidates+backlinks 的全局 hostname 去重，无法强制凑满 N 条新增。

## 示例

```bash
# 标准三源导入 flappybird.org
bash /Users/coderlim/.claude/skills/import-backlinks/scripts/import-all.sh https://flappybird.org
```

核对：

```bash
cd /Users/coderlim/Projects/link-master
node -e "const fs=require('fs');const c=JSON.parse(fs.readFileSync('data/json/backlink-candidates.json','utf8'));console.log('candidates:',c.length);const h=JSON.parse(fs.readFileSync('data/json/backlink-import-history.json','utf8'));console.log('history:',JSON.stringify(h.domains['flappybird.org']));"
```

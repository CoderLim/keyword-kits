---
name: keywords-daily-report
description: >-
  生成关键词日报：汇总 huggingface.co 着陆页新点击量前 10，以及 subdomain-keywords
  （托管子域名平台新词），并在文末输出合并后的 Google Trends URLs。
  支持增量（默认，仅新出现或相对昨天点击上涨）与全量两种模式。
  在用户提到日报、daily report、/keywords-daily-report、/daily-report、HF+子域名关键词汇总或每日 Trends 对比时使用。
---

# keywords-daily-report

汇总两路「新点击量」关键词，输出一份日报，并在底部追加 Google Trends URLs。

1. **HuggingFace**：`huggingface.co` 着陆页新点击量前 10  
2. **Subdomain Keywords**：托管子域名平台关键词（复用 `subdomain-keywords` 规则）  
3. **Google Trends URLs**：两路关键词合并去重后，按点击量降序，每 5 个一组拼链接  
4. **本地快照**：每次拉取后写入本地（只保留昨天 + 今天）  
5. **模式**：增量（默认）或全量

## 0. 选模式（必须先问）

用户未指定模式时，用 **AskUserQuestion**（Cursor 用 **AskQuestion**）二选一；**默认选项为增量**：

| 选项 | `--mode` | 行为 |
|------|----------|------|
| 增量（默认） | `incremental` | 只返回相对昨天**新出现**或**点击量上涨**的关键词 |
| 全量 | `full` | 返回本次拉取的全部条目（线上 / 旧行为） |

用户已写明「全量 / full / 增量 / incremental」则跳过提问，直接用对应模式。

增量过滤仅作用于带**单个关键词 + 点击量**的 item：

- **新出现**：昨天快照里没有该 keyword（大小写不敏感）  
- **上涨**：昨天有同 keyword，且今天 `clicks` 数值更大  
- 无可用 keyword/clicks 的行在增量模式下丢弃  
- 若本地没有昨天快照：全部有 keyword+clicks 的条目视为 **new**，并在输出里注明

## 前置

1. `opencli doctor` 通过  
2. 已安装 **sim** 子插件：`opencli plugin install file://$(pwd)/packages/sim` 或 `github:CoderLim/keyword-kits/sim`  
3. Chrome 已登录 `https://sim.3ue.com`

## 执行步骤

优先跑仓库脚本（推荐）：

```bash
# 增量（默认）
OPENCLI_BROWSER_COMMAND_TIMEOUT=180 node scripts/keywords-daily-report.mjs --mode incremental
# 全量
OPENCLI_BROWSER_COMMAND_TIMEOUT=180 node scripts/keywords-daily-report.mjs --mode full
# JSON：
OPENCLI_BROWSER_COMMAND_TIMEOUT=180 node scripts/keywords-daily-report.mjs --mode incremental --json
```

脚本内部会：

1. `opencli sim landing-pages huggingface.co --limit 10 -f json`（默认 Change=New）  
2. 调用 `scripts/subdomain-keywords.mjs --json`（含其域名列表与后处理）  
3. 将本次完整拉取结果写入 `.claude/skills/keywords-daily-report/data/snapshots.json`（只保留昨天 + 今天）  
4. 按 `--mode` 过滤后合并两路关键词生成 Trends URLs

### 手工等价流程

若脚本不可用，可按序执行后自行汇总（无本地快照 / 增量对比）：

```bash
OPENCLI_BROWSER_COMMAND_TIMEOUT=180 opencli sim landing-pages huggingface.co --limit 10 -f json
OPENCLI_BROWSER_COMMAND_TIMEOUT=180 node scripts/subdomain-keywords.mjs --json
```

HuggingFace 字段映射：`topKeyword` → `keyword`，`clicks` → `clicks`，`url` → `url`。  
Subdomain 侧规则见 [subdomain-keywords](../subdomain-keywords/SKILL.md)（去重、≥2K、仅英文）。

## 本地快照

路径：`.claude/skills/keywords-daily-report/data/snapshots.json`（已 gitignore，勿提交）。

结构示例：

```json
{
  "2026-08-21": {
    "fetchedAt": "2026-08-21T16:00:00.000Z",
    "huggingface": [{ "keyword": "...", "clicks": "...", "url": "..." }],
    "subdomain": [{ "keyword": "...", "clicks": "...", "url": "..." }]
  },
  "2026-08-22": { "...": "..." }
}
```

每次成功拉取后覆盖写入：只保留 **昨天日期键** 与 **今天日期键**；更早的键删除。

## Trends 合并规则

1. 合并 HuggingFace 段与 Subdomain Keywords 段（增量模式下为过滤后的列表）  
2. 按 `keyword` 大小写不敏感去重；冲突保留点击量更高的一条（及其 `url`）  
3. 按点击量降序；**每 5 个一组**生成 Trends URL；最后一组不足 5 个也生成

## 输出格式

### 默认（markdown）

增量模式表头含 `prev` / `change`（`new` | `up`）：

```markdown
# Keywords daily report (incremental vs 2026-08-21)

## HuggingFace (new or up vs yesterday)

| keyword | clicks | prev | change | url |
|---------|--------|------|--------|-----|
| kimi k3 | 93.8K | 80K | up | huggingface.co/moonshotai/Kimi-K3 |

## Subdomain Keywords (new or up vs yesterday)

| keyword | clicks | prev | change | url |
|---------|--------|------|--------|-----|
| youtube to mp3 | 50.5K | — | new | melamrahul.github.io/yt-ai/en |

N keywords (new or clicks up; of M fetched)

## Google Trends URLs

1. keywords 1-5
   https://trends.google.com/trends/explore?q=...
```

全量模式表头与旧版一致（无 `prev` / `change`）。

### JSON（`--json`）

```json
{
  "mode": "incremental",
  "date": "2026-08-22",
  "comparedTo": "2026-08-21",
  "baselineNote": null,
  "huggingface": [{ "keyword": "...", "clicks": "...", "url": "...", "change": "up", "previousClicks": "80K" }],
  "subdomain": [{ "keyword": "...", "clicks": "...", "url": "...", "change": "new", "previousClicks": null }],
  "combined": [{ "keyword": "...", "clicks": "...", "url": "..." }],
  "trendsUrls": ["https://trends.google.com/trends/explore?q=..."],
  "counts": {
    "huggingface": 3,
    "subdomain": 5,
    "combined": 8,
    "huggingfaceRaw": 10,
    "subdomainRaw": 27
  },
  "failures": []
}
```

## 注意

- 整批约需数分钟（HF 一次 + 各子域名平台各一次浏览器打开）。  
- 失败记入 `failures` / Failures 节，不要静默吞掉。  
- 不要改默认 `--change`；本 skill 要「新点击量」。  
- HuggingFace 段取官方排名前 10，不做 ≥2K / 英文过滤；Subdomain 段沿用 subdomain-keywords 过滤。  
- 全量模式下仍会写本地快照，便于下次增量对比。  
- 把脚本 stdout 原样给用户；stderr 进度与快照路径不用贴。

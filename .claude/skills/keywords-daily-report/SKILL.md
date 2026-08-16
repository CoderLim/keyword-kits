---
name: keywords-daily-report
description: >-
  生成关键词日报：汇总 huggingface.co 着陆页新点击量前 10，以及 subdomain-keywords
  （托管子域名平台新词），并在文末输出合并后的 Google Trends URLs。
  在用户提到日报、daily report、/keywords-daily-report、/daily-report、HF+子域名关键词汇总或每日 Trends 对比时使用。
---

# keywords-daily-report

汇总两路「新点击量」关键词，输出一份日报，并在底部追加 Google Trends URLs。

1. **HuggingFace**：`huggingface.co` 着陆页新点击量前 10  
2. **Subdomain Keywords**：托管子域名平台关键词（复用 `subdomain-keywords` 规则）  
3. **Google Trends URLs**：两路关键词合并去重后，按点击量降序，每 5 个一组拼链接

## 前置

1. `opencli doctor` 通过  
2. 已安装 **sim** 子插件：`opencli plugin install file://$(pwd)/packages/sim` 或 `github:CoderLim/keyword-kits/sim`  
3. Chrome 已登录 `https://sim.3ue.com`

## 执行步骤

优先跑仓库脚本（推荐）：

```bash
OPENCLI_BROWSER_COMMAND_TIMEOUT=180 node scripts/keywords-daily-report.mjs
# JSON：
OPENCLI_BROWSER_COMMAND_TIMEOUT=180 node scripts/keywords-daily-report.mjs --json
```

脚本内部会：

1. `opencli sim landing-pages huggingface.co --limit 10 -f json`（默认 Change=New）  
2. 调用 `scripts/subdomain-keywords.mjs --json`（含其域名列表与后处理）  
3. 合并两路关键词生成 Trends URLs

### 手工等价流程

若脚本不可用，可按序执行后自行汇总：

```bash
OPENCLI_BROWSER_COMMAND_TIMEOUT=180 opencli sim landing-pages huggingface.co --limit 10 -f json
OPENCLI_BROWSER_COMMAND_TIMEOUT=180 node scripts/subdomain-keywords.mjs --json
```

HuggingFace 字段映射：`topKeyword` → `keyword`，`clicks` → `clicks`，`url` → `url`。  
Subdomain 侧规则见 [subdomain-keywords](../subdomain-keywords/SKILL.md)（去重、≥2K、仅英文）。

## Trends 合并规则

1. 合并 HuggingFace 前 10 与 Subdomain Keywords 全部条目  
2. 按 `keyword` 大小写不敏感去重；冲突保留点击量更高的一条（及其 `url`）  
3. 按点击量降序；**每 5 个一组**生成 Trends URL；最后一组不足 5 个也生成

## 输出格式

### 默认（markdown）

```markdown
## HuggingFace (new clicks top 10)

| keyword | clicks | url |
|---------|--------|-----|
| kimi k3 | 93.8K | huggingface.co/moonshotai/Kimi-K3 |

## Subdomain Keywords

| keyword | clicks | url |
|---------|--------|-----|
| youtube to mp3 | 50.5K | melamrahul.github.io/yt-ai/en |

N keywords (clicks ≥ 2K, English, deduped)

## Google Trends URLs

1. keywords 1-5
   https://trends.google.com/trends/explore?q=...
```

### JSON（`--json`）

```json
{
  "huggingface": [{ "keyword": "...", "clicks": "...", "url": "..." }],
  "subdomain": [{ "keyword": "...", "clicks": "...", "url": "..." }],
  "combined": [{ "keyword": "...", "clicks": "...", "url": "..." }],
  "trendsUrls": ["https://trends.google.com/trends/explore?q=..."],
  "counts": { "huggingface": 10, "subdomain": 27, "combined": 35 },
  "failures": []
}
```

## 注意

- 整批约需数分钟（HF 一次 + 各子域名平台各一次浏览器打开）。  
- 失败记入 `failures` / Failures 节，不要静默吞掉。  
- 不要改默认 `--change`；本 skill 要「新点击量」。  
- HuggingFace 段取官方排名前 10，不做 ≥2K / 英文过滤；Subdomain 段沿用 subdomain-keywords 过滤。

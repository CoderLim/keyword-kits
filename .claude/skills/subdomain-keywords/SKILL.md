---
name: subdomain-keywords
description: >-
  通过 opencli sim landing-pages 批量拉取托管子域名平台的新点击着陆页，
  提取并去重英文关键词（点击量≥2K），再按每 5 个关键词生成 Google Trends URL。
  在用户提到子域名关键词、subdomain keywords、vercel.app/pages.dev/github.io/workers.dev
  等平台新词发现或 Google Trends 对比时使用。
---

# subdomain-keywords

从若干托管子域名平台拉取「新点击量」着陆页，输出：

1. 去重后的英文关键词列表（含 url、clicks）  
2. Google Trends URL 列表（关键词按每 5 个一组拼链接）

## 前置

1. `opencli doctor` 通过  
2. 已安装 **sim** 子插件：`opencli plugin install file://$(pwd)/packages/sim` 或 `github:CoderLim/keyword-kits/sim`  
3. Chrome 已登录 `https://sim.3ue.com`

## 目标域名（固定）

每个域名调用 `opencli sim landing-pages`，**只取前 10 条**（命令默认已是新点击量 `Change=New`）：

- `vercel.app`
- `pages.dev`
- `github.io`
- `netlify.app`
- `web.app`
- `firebaseapp.com`
- `lovable.app`
- `onrender.com`
- `workers.dev`
- `neocities.org`
- `carrd.co`

## 执行步骤

优先跑仓库脚本（推荐）：

```bash
OPENCLI_BROWSER_COMMAND_TIMEOUT=180 node scripts/subdomain-keywords.mjs
# JSON：
OPENCLI_BROWSER_COMMAND_TIMEOUT=180 node scripts/subdomain-keywords.mjs --json
```

若需手工跑，按域名顺序执行：

```bash
OPENCLI_BROWSER_COMMAND_TIMEOUT=180 opencli sim landing-pages <domain> --limit 10 -f json
```

从每条结果只保留字段：

| 源字段 | 输出字段 |
|--------|----------|
| `url` | `url` |
| `topKeyword` | `keyword` |
| `clicks` | `clicks` |

## 后处理规则（必须全部应用）

1. **关键词去重**：按 `keyword` 大小写不敏感去重；冲突时保留点击量数值更大的一条（并保留其 `url`）。  
2. **点击量门槛**：剔除点击量 **低于 2K** 的数据（`2K` = 2000；`1.9K` 丢弃，`2K` / `2.1K` 保留）。  
3. **仅英文关键词**：只保留关键词主体为英文的条目。判定：去掉空格与常见英文标点 `- ' & . ! ?` 后，剩余字符均为 ASCII 字母/数字；若含中日韩、西里尔、阿拉伯、韩文等非拉丁字母则丢弃。空关键词、`-`、纯符号丢弃。  
4. **Google Trends URL**：取最终关键词列表（已按点击量降序），**每 5 个一组**拼成 Trends 链接；不足 5 个的最后一组也生成一条。形如：  
   `https://trends.google.com/trends/explore?q=Keyword1,Keyword2,Keyword3,Keyword4,Keyword5`

## 输出格式

### 默认（markdown）

先输出关键词表，再输出 Trends URL 列表：

```markdown
## Keywords

| keyword | clicks | url |
|---------|--------|-----|
| youtube to mp3 | 33.9K | melamrahul.github.io/yt-ai |

## Google Trends URLs

1. keywords 1-5
   https://trends.google.com/trends/explore?q=...
2. keywords 6-10
   https://trends.google.com/trends/explore?q=...
```

### JSON（`--json`）

```json
{
  "keywords": [
    { "keyword": "youtube to mp3", "clicks": "33.9K", "url": "melamrahul.github.io/yt-ai" }
  ],
  "trendsUrls": [
    "https://trends.google.com/trends/explore?q=youtube%20to%20mp3,..."
  ],
  "count": 1,
  "failures": []
}
```

## 注意

- 整批约需数分钟（每域名一次浏览器打开）。  
- 失败域名记入 `failures` / Failures 节，不要静默吞掉。  
- 不要改默认 `--change`；本 skill 明确要「新点击量」。

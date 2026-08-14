---
name: web-ranking
description: >-
  用 opencli sim web-ranking 拉 Category Leaders（搜索+自然）前 100 个站点，
  再查 WHOIS，按域名创建时间倒序取前 20。
  在用户提到站点排名、web-ranking、新注册域名、行业龙头站、
  AI/游戏/全部行业 SimilarWeb 排名谁最新时使用。
---

# web-ranking

拉 sim 站点排名 → WHOIS → 按注册时间取最新 20 个域名。

## 1. 选行业（必须先问）

用户未指定行业时，用 **AskUserQuestion**（Cursor 用 AskQuestion）让用户三选一，不要默认替选：

| 选项 | `--industry` | sim 行业 id |
|------|----------------|-------------|
| 全部 | `all` | `All` |
| AI | `ai` | `AI_Chatbots_and_Tools` |
| 游戏 | `games` | `Games` |

对应市场页（仅作对照，拉数走 `sim web-ranking`，不是 mapping 页）：

- AI: https://sim.3ue.com/#/digitalsuite/markets/webmarketanalysis/mapping/AI_Chatbots_and_Tools/999/1m?webSource=Total
- 游戏: https://sim.3ue.com/#/digitalsuite/markets/webmarketanalysis/mapping/Games/999/1m?webSource=Total

用户已写明行业则跳过提问。

## 2. 跑脚本

解析本 `SKILL.md` 所在目录为 `<skill-directory>`：

```bash
OPENCLI_BROWSER_COMMAND_TIMEOUT=180 node "<skill-directory>/scripts/web-ranking.mjs" --industry <all|ai|games>
# JSON：
OPENCLI_BROWSER_COMMAND_TIMEOUT=180 node "<skill-directory>/scripts/web-ranking.mjs" --industry <all|ai|games> --json
```

脚本会：

1. `opencli sim web-ranking --industry <id> --limit 100 -f json`（固定搜索+自然、1m、按变动排序）
2. 对全部域名调用 `scripts/whois.mjs`（`whois.freeaiapi.xyz`，每批 3 个、间隔 800ms）
3. 有创建时间的按时间倒序，输出前 20

不要自己重写 WHOIS 或改 ranking 的搜索/自然筛选。

## 前置

1. `opencli doctor` 通过  
2. 已装 **sim** 子插件  
3. Chrome 已登录 https://sim.3ue.com

## WHOIS 复用

只查接口时：

```bash
node "<skill-directory>/scripts/whois.mjs" --json example.com foo.io
printf 'example.com\nfoo.io\n' | node "<skill-directory>/scripts/whois.mjs" --json --top 20
```

`lookupWhois` / `lookupWhoisMany` 可从 `scripts/whois.mjs` import。不支持的后缀标 `unsupported`，请求失败标 `error`，无日期排在后面且不进前 20。

## 输出

把脚本 stdout 原样给用户（markdown 表或 JSON）。stderr 的进度不用贴。失败（未登录、超时、WHOIS 全挂）直接报错，不要编造创建日期。

# ahrefs backlinks — Design Spec

**Date:** 2026-07-23  
**Status:** Draft for review  
**Scope:** 第一期 — 免费 Backlink Checker，单域名查询（mode 固定 subdomains）

## 1. Goal

在现有 `packages/ahrefs` 新增 opencli 命令，对接 Ahrefs 免费 [Backlink Checker](https://ahrefs.com/backlink-checker/)，提供：

```bash
opencli ahrefs backlinks <domain>
```

返回结构化对象 `{ summary, links }`：摘要含 DR、外链站点数（含 dofollow 占比）、外链数（含 dofollow 占比）；`links` 为页上可见的外链行列表。尽量免登录。

## 2. Decisions (locked)

| 决策 | 选择 |
|------|------|
| 交付形态 | 扩展现有 `packages/ahrefs`（与 `kd` 并列），不新建插件包 |
| 命令 | `site: ahrefs`，`name: backlinks` → `opencli ahrefs backlinks` |
| 数据源 | 仅免费 Backlink Checker；不依赖 Ahrefs 付费账号 |
| 鉴权 | 一期免登录；若变为必须登录才出结果 → 明确报错，不静默失败 |
| 输入 | 单域名位置参数必填；规范化同 `sim backlinks`（去协议/路径，保留 host） |
| mode | 固定 `subdomains`，不暴露 `--mode` |
| limit | **无** `--limit`；返回页上当前可见的全部外链行 |
| 输出形态 | 单个对象 `{ summary, links }`（推荐 `-f json`） |
| 列表列 | 尽量抓页上可见列；列名以侦察为准锁定 |
| 策略路径 | **方案 1**：侦察后优先 PUBLIC；不可用（含 captcha）则固定 UI；一期只落地一种策略 |

## 3. Architecture

```
packages/ahrefs/
├── opencli-plugin.json
├── package.json                 # build 增加 backlinks.ts
├── src/
│   ├── kd.ts                    # 已有
│   ├── lib.ts                   # 已有；可复用或新增 normalizeDomain
│   └── backlinks.ts             # 新命令
├── lib.js / kd.js / backlinks.js
└── …
```

安装 / 验证（插件已装则 update）：

```bash
npm run build -w opencli-plugin-ahrefs
opencli plugin update ahrefs
OPENCLI_BROWSER_COMMAND_TIMEOUT=180 \
  opencli ahrefs backlinks ahrefs.com -f json
```

### 3.1 Strategy note（实现前强制写入 `backlinks.ts`）

对 deep-link 做现场侦察后**选定一种**策略：

| 条件 | Strategy |
|------|----------|
| 存在无需登录、可稳定复放的 JSON 接口 | `PUBLIC`（`browser: false`） |
| 无可用公开 API / captcha / 强依赖前端 | `UI`（Chrome Bridge） |

Strategy note 至少包含：Strategy / Contract / Evidence / Auth。  
预期 deep-link：

```
https://ahrefs.com/backlink-checker/?input={domain}&mode=subdomains
```

### 3.2 Output contract

`-f json` 返回**单个对象**（不是行数组）：

```json
{
  "summary": {
    "domain": "ahrefs.com",
    "dr": 91,
    "refDomains": 12345,
    "refDomainsDofollowPct": 67.8,
    "backlinks": 67890,
    "backlinksDofollowPct": 72.1
  },
  "links": [
    {
      "sourceUrl": "https://example.com/page",
      "anchor": "…",
      "dofollow": true
    }
  ]
}
```

说明：

- `summary` 字段名以侦察后页上/API 真实语义锁定；上表为目标形状，若页上只有整数百分比则存 number（0–100），不强制带 `%` 字符串。
- `links` 列以侦察锁定；上表示例仅为示意。缺失的可选列可省略或为 `null`，但同一命令内列集合应稳定。
- `-f table` 对嵌套对象支持可能较差；README 明确推荐 `-f json`。

### 3.3 Runtime data flow

```
args(domain)
  → normalizeDomain
  → fetch via locked strategy (deep-link / API)
  → parse summary + links
  → if none of dr / refDomains / backlinks can be parsed → EmptyResultError
  → if summary ok and links empty → { summary, links: [] }
  → return object
```


## 4. Command contract

### 4.1 Args

| Arg | Type | Required | Default | Notes |
|-----|------|----------|---------|-------|
| `domain` | string | yes | — | 域名或 URL；规范化为 lowercase host |

第一期 **不** 支持：`--mode`、`--limit`、批量、付费 API、登录会话增强。

### 4.2 Errors

| 情况 | 行为 |
|------|------|
| 缺域名 / 非法域名 | `ArgumentError` |
| 摘要关键指标全部取不到 | `EmptyResultError` |
| 限流 / 挑战页 / 反爬 | `CommandExecutionError` |
| 意外登录墙 | `CommandExecutionError` |
| UI 超时 | `TimeoutError`；建议加大 `OPENCLI_BROWSER_COMMAND_TIMEOUT` |

## 5. Out of scope（第一期）

- `mode=exact` 或其他 mode
- `--limit` / 翻页凑满 N 条
- Ahrefs Site Explorer 付费数据
- 运行时 PUBLIC↔UI 双路径切换
- 与 `sim backlinks` 字段强制一一对齐

## 6. Verification

1. `npm run build -w opencli-plugin-ahrefs`（含 `backlinks.js`）
2. `opencli plugin update ahrefs`（或 install）
3. `opencli ahrefs backlinks --help` 可见 positional `domain`
4. `OPENCLI_BROWSER_COMMAND_TIMEOUT=180 opencli ahrefs backlinks ahrefs.com -f json` → 含 `summary` 与 `links`
5. 非法域名触发 `ArgumentError`
6. README：命令表 + `## ahrefs backlinks` 专节 + 故障排查

## 7. Docs touchpoints

- 根 `README.md`
- 本设计文档；实现计划另写 `docs/superpowers/plans/2026-07-23-ahrefs-backlinks.md`

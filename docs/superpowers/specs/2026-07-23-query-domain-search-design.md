# queryDomain search — Design Spec

**Date:** 2026-07-23  
**Status:** Implemented  
**Scope:** 第一期 — 按关键词查询 query.domains 域名列表（固定默认 TLD）

## 1. Goal

在本仓库新增 opencli 插件，提供：

```bash
opencli queryDomain search <keyword> [-f json]
```

根据关键词生成候选域名（与 [query.domains](https://query.domains/) 首页一致），拉取列表数据并返回结构化行。

参考行为：在首页输入 `ai image` 后出现的结果列表（如 `aiimage.com`、`aiimage.ai` …）。

## 2. Decisions (locked)

| 决策 | 选择 |
|------|------|
| 交付形态 | 新插件 `packages/query-domain`（不做 HTTP API 包装） |
| 命令 | site=`queryDomain`，name=`search` → `opencli queryDomain search` |
| 策略 | **方案 1**：`Strategy.PUBLIC`，Node 直连上游 SSE / DR API（无需 Chrome） |
| 关键词 | 位置参数必填 `keyword` |
| 前缀规则 | trim → 按空白拆词 → 拼接（`ai image` → `aiimage`）；大小写不敏感，输出域名小写 |
| TLD | **固定**站点默认 14 个，不暴露 `--tlds` |
| 输出字段 | `domain`, `year`, `dr`, `forSale`, `registered`, `expires`, `existed` |
| 鉴权 | 无；公开接口。遇 429 抛 typed error |

说明：opencli 站点适配器为两段式 `site command`，无法实现字面单段 `opencli queryDomain <keyword>`；已与用户确认采用 `queryDomain search`。

## 3. Architecture

```
packages/query-domain/
├── src/
│   └── search.ts              # Strategy.PUBLIC 命令
├── package.json
├── opencli-plugin.json
└── search.js                  # esbuild 产物（不入库，与现有插件一致）

# monorepo 根
opencli-plugin.json            # 增加 query-domain 条目
package.json                   # workspaces + build 脚本
README.md                      # 安装与用法
```

安装：

```bash
npm install && npm run build
opencli plugin install file://$(pwd)/packages/query-domain
opencli queryDomain search "ai image" -f json
```

### 3.1 Strategy note（实现前写入源码注释）

| 项 | 内容 |
|----|------|
| Strategy | PUBLIC |
| Contract | upstream-json / SSE |
| Evidence | 首页将关键词拼成 `label.tld` 后请求 `/api/upstream/check?...&sse=true&return_dates=true&return-prices=true`；DR 来自 `/api/dr?domain=...` |
| Auth | 无（Node `fetch` 已验证可返回 SSE） |
| Browser | `false` |

### 3.2 Domain generation

```
label = keyword.trim().split(/\s+/).join('').toLowerCase()
domains = DEFAULT_TLDS.map(tld => `${label}.${tld}`)
```

`DEFAULT_TLDS`（与站点首页默认一致，写死）：

```
com, ai, org, net, cn, info, app, io, xyz, co, run, me, pro, top
```

空关键词 / 规范化后 `label` 为空 → opencli `ArgumentError` → `ARGUMENT`（exit 2）。

### 3.3 Upstream APIs

**Check（SSE）**

```
GET https://query.domains/api/upstream/check
  ?domain={comma-separated}
  &sse=true
  &return_dates=true
  &return-prices=true
```

关注事件：

| event | 用途 |
|-------|------|
| `shallow-checked` | `meta.existed`；`meta.market` 存在则视为待售 |
| `whois-cache-checked` | `meta.registered` / `meta.expires` / `meta.existed` |
| `[DONE]` | 流结束 |

合并同一 `domain` 的多次事件（后者覆盖/补全字段）。`forSale = Boolean(meta.market) || meta.for_sale === true`。

**DR**

```
GET https://query.domains/api/dr?domain={comma-separated}
→ { data: { "aiimage.app": 24, ... }, refreshed: number }
```

无 DR 时字段为 `null`（统一用 `null`，不用空串）。

## 4. Command contract

### 4.1 Args

| Arg | Type | Required | Default | Notes |
|-----|------|----------|---------|-------|
| `keyword` | string | yes | — | 位置参数；多词按空格拆后拼接 |

一期 **不** 暴露 `--tlds` / `--limit`（固定 14 条量级）。

### 4.2 Output columns

| Column | Type | Meaning |
|--------|------|---------|
| `domain` | string | 完整域名 |
| `year` | string \| '' | 注册年（从 `registered` 取 YYYY）；未知为空串 |
| `dr` | number \| null | Domain Rating；未知为 `null` |
| `forSale` | boolean | 是否待售 |
| `registered` | string \| '' | `YYYY-MM-DD`（UTC 日期部分） |
| `expires` | string \| '' | `YYYY-MM-DD` |
| `existed` | string | 上游值，预期 `yes` / `no` / `--` 等；规范化为小写字符串 |

行顺序：与 `DEFAULT_TLDS` 顺序一致。

### 4.3 Errors（typed）

| Code | When |
|------|------|
| `ARGUMENT`（exit 2） | keyword 为空或规范化后 label 为空（opencli `ArgumentError`） |
| `FETCH_ERROR` | 网络失败 / 非预期 HTTP（非 429） |
| `CliError`（如 `RATE_LIMITED` / `FETCH_ERROR`） | HTTP 429；文案提示稍后重试或登录 Pro |

## 5. Data flow

```
CLI keyword
  → normalize label + build 14 domains
  → fetch SSE /api/upstream/check
  → merge per-domain meta (existed, registered, expires, forSale)
  → fetch /api/dr for all domains
  → map rows (year from registered)
  → return rows in TLD order
```

## 6. Verification

1. `opencli doctor`（本命令不依赖浏览器，doctor 通过即可）
2. `npm run build` + `opencli plugin install/update` 指向 `packages/query-domain`
3. `opencli queryDomain search "ai image" -f json` 非空，含 `aiimage.com` 等，字段齐全
4. 与网页列表肉眼对照：域名集合、待售标记、年份大致一致（DR 以 API 为准）

## 7. Out of scope (一期)

- `--tlds` / 自定义后缀  
- `--limit` / 分页  
- 浏览器 UI 刮表降级  
- Turnstile / 登录态绕过（仅对 429 报错提示）  
- 关键词变体生成（连字符、词序置换等）— 仅对齐首页「去空格拼接」  
- 单域名深挖（WHOIS 原文、定价、截图）  
- 上游贡献到 `@jackwener/opencli` 官方 clis  

## 8. Risks

| Risk | Mitigation |
|------|------------|
| SSE 事件字段变更 | strategy note + 宽松 merge；缺字段留空 |
| 公开接口限流（429） | typed error，文档注明稍后重试 / 登录 Pro |
| 默认 TLD 列表站点变更 | 写死当前 14 个；变更时改常量并更新 README |
| 插件名 / site 大小写 | site 固定 `queryDomain`；包名 `opencli-plugin-query-domain` |

## 9. Success criteria

- [ ] `opencli list` / `opencli queryDomain --help` 可见 `search`
- [ ] `opencli queryDomain search "ai image" -f json` 返回 14 行级结果，列与 §4.2 一致
- [ ] 无需 Chrome / 扩展即可运行
- [ ] README 写明安装与用法

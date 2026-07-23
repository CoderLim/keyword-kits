# sim backlinks — Design Spec

**Date:** 2026-07-23  
**Status:** Draft for review  
**Scope:** 第一期 — 仅实现查看某网站反向链接

## 1. Goal

在本仓库交付一个 **opencli plugin**（site 名 `sim`），复用 Chrome 已登录的 `sim.3ue.com` 会话，提供：

```bash
opencli sim backlinks <domain> [--limit N]
```

返回结构化反向链接列表（JSON / table），作为后续 SimilarWeb 功能套件的首个命令。

## 2. Decisions (locked)

| 决策 | 选择 |
|------|------|
| 交付形态 | opencli plugin / adapter（不做 HTTP API） |
| 命令前缀 | `sim`（对应 sim.3ue.com） |
| 首个命令 | `backlinks` |
| 参数 | 必填 `domain`；可选 `--limit`（默认建议 50） |
| 固定默认筛选 | `duration=28d`，`sort=DomainScore`，`status=Active` |
| 鉴权 | 复用用户 Chrome 已登录会话（doctor 已通） |

## 3. Architecture

```
keyword-kits (repo)
├── opencli-plugin.json      # plugin manifest, name: sim
├── package.json             # peer: @jackwener/opencli
├── backlinks.ts             # Strategy: COOKIE / PAGE_FETCH（侦察后定稿）
├── README.md
└── docs/superpowers/specs/  # 本设计与后续计划
```

安装：

```bash
opencli plugin install file:///Users/coderlim/Projects/keyword-kits
opencli sim backlinks example.com -f json
```

### 3.1 Strategy（实现前强制产出 strategy note）

按 opencli-adapter-author 决策树：

1. **首选** `COOKIE_API` / 页面内 `PAGE_FETCH`：侦察反向链接页 XHR/JSON，用 session 复放。
2. **降级** `INTERCEPT`：签名复杂时，打开页面截获自然发出的 response。
3. **再降级** `UI_SELECTOR` / `DOM_STATE`：仅当无可用 JSON 时刮表格。

写 `backlinks.ts` 前必须在 notes / PR 描述中留下 strategy note（Strategy / Contract / Evidence）。

### 3.2 Target page

```
https://sim.3ue.com/#/digitalsuite/acquisition/backlinks/table/999/?duration=28d&key={domain}&sort=DomainScore&status=Active
```

来源：[SimilarWeb 常用功能.md](/Users/coderlim/Documents/ObsidianVault/00-IndieHacker/04-Tool/SimilarWeb%20常用功能.md)

## 4. Command contract

### 4.1 Args

| Arg | Type | Required | Default | Notes |
|-----|------|----------|---------|-------|
| `domain` | string | yes | — | 域名或 URL；实现时规范化（去协议、路径，保留 host） |
| `limit` | int | no | 50 | 返回条数上限；若 API 分页则只取前 N 条 |

第一期 **不** 暴露 `--duration` / `--sort` / `--status`。

### 4.2 Output columns

列名以侦察后的真实字段为准，设计目标对齐页面可见信息，建议至少包含：

| Column | Meaning |
|--------|---------|
| `sourceDomain` | 来源站点 |
| `domainScore` | Domain Score |
| `sourceUrl` | 反向链接 URL |
| `targetUrl` | 指向的目标 URL |
| `anchor` | 锚文本 |
| `status` | 链接状态（预期 Active） |

侦察后可增删列；`columns` 与映射在 verify fixture 中固化。

### 4.3 Errors（typed）

| Code | When |
|------|------|
| `INVALID_ARGUMENT` | domain 为空或无法解析 |
| `AUTH_REQUIRED` | 未登录 / session 失效 |
| `NO_DATA` | 接口成功但无反向链接 |
| `API_ERROR` | 接口非预期状态 / HTML 登录页 |

## 5. Data flow

```
CLI args → normalize domain
       → ensure browser session on sim.3ue.com
       → fetch/intercept backlinks JSON
       → map rows → slice(limit)
       → return rows
```

站点记忆落盘（verify 通过后）：

- `~/.opencli/sites/sim/endpoints.json`
- `~/.opencli/sites/sim/field-map.json`
- `~/.opencli/sites/sim/notes.md`
- `~/.opencli/sites/sim/verify/backlinks.json`
- `~/.opencli/sites/sim/fixtures/...`

## 6. Verification

1. `opencli doctor` — Everything looks good  
2. `opencli browser analyze <backlinks-url>` — pattern + 候选 API  
3. 手工 replay endpoint，确认 200 + 非空 JSON  
4. `opencli browser verify sim/backlinks`（或 plugin 等价验证）  
5. `--write-fixture` + 肉眼对照网页表格字段  

## 7. Out of scope (一期)

- HTTP API 包装层  
- 其它 SimilarWeb 功能（类似网站、出站流量、关键词等）  
- duration / sort / status 可配置参数  
- 上游贡献到 `@jackwener/opencli` 官方 clis（可后续再提 PR）  
- 自动登录 / 绕过风控  

## 8. Risks

| Risk | Mitigation |
|------|------------|
| 站内 API 无文档、易改版 | strategy note + site memory；失败走 autofix |
| SPA hash 路由导致 network 难抓 | analyze → wait xhr → intercept 降级 |
| 账号权限不足（升级提示） | typed error，文档注明需有效订阅 |
| Plugin 热更新/缓存 | `opencli plugin install file://...` 开发期 symlink |

## 9. Success criteria

- [ ] `opencli list` 可见 `sim backlinks`  
- [ ] `opencli sim backlinks <已知有外链的域名> -f json` 返回非空、字段与页面一致  
- [ ] `verify` 通过且有 fixture  
- [ ] README 写明安装与用法  

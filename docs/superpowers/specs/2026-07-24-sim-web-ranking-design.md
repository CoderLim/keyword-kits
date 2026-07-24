# sim web-ranking — Design Spec

**Date:** 2026-07-24  
**Status:** Draft for review  
**Scope:** 第一期 — Category Leaders 搜索自然流量站点排名（固定 Organic + 1m）

## 1. Goal

在现有 `packages/sim` opencli 插件中新增命令 `web-ranking`，复用 Chrome 已登录的 `sim.3ue.com` 会话，拉取站点排名表（Category Leaders → Search → Organic），返回结构化列表（JSON / table）。

```bash
opencli sim web-ranking [--sort change|visits] [--industry <name|All>] [--limit N]
```

参考页：

```
https://sim.3ue.com/#/digitalsuite/markets/webmarketanalysis/rankings/All/999/1m?webSource=Total&selectedTab=CategoryLeadersSearch
```

## 2. Decisions (locked)

| 决策 | 选择 |
|------|------|
| 交付形态 | 现有 `packages/sim` 插件内新命令（不做独立 HTTP API） |
| 命令名 | `web-ranking` |
| 流量筛选 | **固定** Search → Organic（自然）；CLI 不暴露切换 |
| 时长 | **固定** `1m`（最近 1 个自然月，非 1 分钟；与 `landing-pages` 的 `28d` 不同） |
| 地区 / webSource | **固定** 全球 + `webSource=Total` |
| 默认排序 | `change`（变动降序，对齐页面「变动」列） |
| 可选排序 | `--sort visits`（每月访问量降序） |
| 行业 | 默认 `All`；可选 `--industry` |
| 实现策略 | **方案 A**：深链参数驱动排序/行业 + UI scrape（与 `landing-pages` 同模式） |
| 鉴权 | 复用用户 Chrome 已登录会话 |

## 3. Architecture

```
packages/sim/
├── src/
│   ├── web-ranking.ts              # 新命令
│   └── lib/
│       ├── utils.ts                # 复用 openDeepLink / waitForPageStatus / normalizeLimit
│       └── web-ranking-industry.ts # 行业名 → URL path id 映射（可单测）
├── package.json                    # build 增加 web-ranking.js
└── ...
```

### 3.1 Strategy

与现有 sim 命令一致：

1. **首选** 深链 query/path 写入 Organic、sort、industry；`Strategy.UI` DOM 抓表。
2. **局部降级** 若 Organic 无法写进 URL，打开后最小点击一次「自然」标签。
3. **不首选** 独立 PAGE_FETCH / 外部 HTTP（历史 GMITM 常挡）；侦察若发现可用且稳定的 JSON，可在实现计划中升级，但一期交付不以 API 为阻塞。

写 `web-ranking.ts` 前须留下 strategy note（Strategy / Contract / Evidence：目标 URL、表格 DOM、sort/Organic query 名）。

### 3.2 Target page（基底，实现前侦察定稿 query）

```
https://sim.3ue.com/#/digitalsuite/markets/webmarketanalysis/rankings/{industryId}/999/1m
  ?webSource=Total
  &selectedTab=CategoryLeadersSearch
  + Organic 固定筛选（侦察后写入真实 param）
  + sort（change / visits → 站点真实 sort key）
```

- `{industryId}`：`All` 或映射表中的分类 id  
- 必须 `page.newTab` 打开深链（同域 hash `goto` 不 remount SPA）

### 3.3 Data flow

```
CLI args
  → normalizeSort / normalizeIndustry / normalizeLimit
  → buildWebRankingUrl(...)
  → openDeepLink(page, url)
  → [optional] ensure Organic filter via one click if URL alone insufficient
  → waitForPageStatus(...)
  → page.evaluate(EXTRACT_ROWS_JS)  # return JSON.stringify(rows)
  → parseJsonRows → slice(0, limit)
  → return rows
```

## 4. Command contract

### 4.1 Args

| Arg | Type | Required | Default | Notes |
|-----|------|----------|---------|-------|
| `sort` | string | no | `change` | `change` = 变动降序；`visits` = 每月访问量降序。非法值 → `ArgumentError` |
| `industry` | string | no | `All` | `All` = 全行业；其它值经映射表解析为 URL id；无法解析 → `ArgumentError`（提示可用值） |
| `limit` | int | no | `50` | `1..MAX_LIMIT`（现有 `100`） |

第一期 **不** 暴露：`--duration`、地区、Paid/Organic 切换、`webSource`、行业排名列。

### 4.2 Output columns

| Column | Meaning |
|--------|---------|
| `rank` | 站点排名序号（页面「域」列旁数字） |
| `domain` | 域名 |
| `trafficShare` | 流量份额 |
| `change` | 变动（含涨跌方向与百分比文案，如实抓取） |
| `industry` | 行业分类名 |
| `monthlyVisits` | 每月访问量 |
| `adsense` | 是否使用 AdSense（布尔或页面可见文案；侦察后定类型） |

**不包含** 行业排名（`industryRank`）。列识别以表格 DOM / `data-automation` 为准，侦察后固化。

### 4.3 Errors（typed）

| Error | When |
|-------|------|
| `ArgumentError` | 非法 `sort` / `industry` / `limit` |
| `AuthRequiredError` | 未登录 / session 失效 |
| `CommandExecutionError` | 页加载失败（可点刷新重试一次） |
| `TimeoutError` | 超过 `LOAD_TIMEOUT_SEC` 仍未 ready |
| `EmptyResultError` | 页面 ready 但无数据行 |

## 5. Industry mapping（一期）

- 默认 `All` → 路径段 `All`。  
- 非 `All`：`lib/web-ranking-industry.ts` 维护「CLI 名 / 别名 → path id」。  
- 第一期：至少支持 `All`；再按侦察结果加入少量高频行业（映射可单测）。  
- 未收录行业：明确报错，不静默回退到 `All`。

## 6. Verification

1. `npm run build:sim` 产出 `packages/sim/web-ranking.js`  
2. `opencli plugin update sim`（或等价安装）后 `opencli list` 可见 `sim web-ranking`  
3. `OPENCLI_BROWSER_COMMAND_TIMEOUT=180 opencli sim web-ranking -f json`  
   - 默认按变动降序  
   - 7 列齐全  
   - 结果对应 Organic（非 Paid）  
4. `--sort visits` 切换为月访问量排序  
5. `--industry All` 与至少一个已映射具体行业均可出数  
6. 未登录时抛出鉴权错误  
7. `normalizeSort` / 行业映射单测通过  

## 7. Out of scope (一期)

- `--duration` / 地区 / Paid 搜索切换  
- 输出 `industryRank`  
- 完整行业目录穷举（仅映射表内支持）  
- 翻页凑满超大 limit（一期仅当前页可视行 + `slice`；若侦察发现简单分页且必要，实现计划可加，但不阻塞 MVP）  
- 自动登录 / 绕过风控  
- 独立 skill（可后续按需加，类似 subdomain-keywords）

## 8. Risks

| Risk | Mitigation |
|------|------------|
| Organic / sort query 名未知 | 实现前浏览器侦察；必要时一次 UI 点击降级 |
| SPA 表格 DOM 改版 | 列探测偏 class/`data-automation`；strategy note 固化选择器 |
| 行业 id 与展示名不一致 | 映射表 + ArgumentError；文档列出已支持项 |
| 排序后 `rank` 仍为全站位次而非行号 | 按页面「域」列旁数字如实输出，不在 CLI 重算 |

## 9. Success criteria

- [ ] `opencli sim web-ranking` 可用，默认 `--sort change`、`--industry All`、`1m`、Organic  
- [ ] `--sort visits` / `--industry` / `--limit` 行为符合契约  
- [ ] 输出列为约定 7 列，无行业排名  
- [ ] README（或插件说明）写明用法与固定筛选  
- [ ] 行业映射与 sort 规范化有单测  

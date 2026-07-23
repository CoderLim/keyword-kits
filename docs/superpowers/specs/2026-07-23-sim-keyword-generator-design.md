# sim keyword-generator — Design Spec

**Date:** 2026-07-23  
**Status:** Draft for review  
**Scope:** 第一期 — SimilarWeb 关键词生成器（phrase match + 下限/上限筛选 + 自动翻页）

## 1. Goal

在 `packages/sim` 新增 opencli 命令，复用 Chrome 已登录的 `sim.3ue.com` 会话，提供：

```bash
opencli sim keyword-generator <keyword> \
  [--engine google] \
  [--min-volume N] \
  [--min-cpc N] \
  [--max-difficulty N] \
  [--limit 50]
```

返回结构化关键词列表（JSON / table），支持按 CPC、搜索量、难度筛选，并自动翻页直到凑满 `--limit`。

参考页：

```
https://sim.3ue.com/#/digitalsuite/acquisition/findkeywords/keyword-generator-tool/999/28d
  ?searchEngine=google&keyword=dice&webSource=Total&isWWW=*&tab=phraseMatch&volumeFromValue=0
```

## 2. Decisions (locked)

| 决策 | 选择 |
|------|------|
| 交付形态 | `packages/sim` 内新命令（不做独立 HTTP API） |
| 命令名 | `keyword-generator` → `opencli sim keyword-generator` |
| 策略 | **方案 1**：Deep link + DOM 刮表；筛选项能映射 URL 则写入 query，否则本地过滤兜底 |
| 种子词 | 位置参数必填 `keyword` |
| 匹配模式 | 写死 `tab=phraseMatch`（不暴露） |
| 搜索引擎 | `--engine`，默认 `google` |
| 筛选形态 | 只要「可做词」边界：`--min-volume`、`--min-cpc`、`--max-difficulty`；默认全不限 |
| 翻页 | 自动翻页直到 `rows.length >= limit` 或没有下一页 |
| 周期 / 来源 | 写死 `28d`、`webSource=Total`、`isWWW=*` |
| 鉴权 | 复用用户 Chrome 已登录会话（与现有 sim 命令相同） |

## 3. Architecture

```
packages/sim/
├── src/
│   ├── keyword-generator.ts   # 新命令（Strategy.UI）
│   ├── landing-pages.ts       # 模式参考
│   ├── backlinks.ts
│   └── lib/utils.ts           # 复用 openDeepLink / waitForPageStatus / normalizeLimit / parseJsonRows
├── package.json               # build 增加 esbuild 条目（需 --bundle）
└── opencli-plugin.json
```

调用：

```bash
opencli plugin install file://$(pwd)/packages/sim   # 或 update
OPENCLI_BROWSER_COMMAND_TIMEOUT=180 \
  opencli sim keyword-generator dice --min-volume 1000 --max-difficulty 50 --limit 20 -f json
```

### 3.1 Strategy note（实现前写入源码注释）

| 项 | 内容 |
|----|------|
| Strategy | UI（与 `landing-pages` / `backlinks` 一致） |
| Contract | visible-ui |
| Evidence | 目标页为 SPA hash 路由；既往 SimilarWeb API 被 GMITM 拦截，PAGE_FETCH 不可用时降级 DOM |
| Auth | Chrome session on `sim.3ue.com` |
| Open | 必须 `page.newTab`；同域 hash `goto` 不会 remount SPA |
| Extract | `page.evaluate` 返回 `JSON.stringify(rows)` |

实现前用浏览器打开参考页，确认：

1. 表格 DOM 选择器 / 列含义（至少 keyword、volume、cpc、difficulty）
2. 筛选项对应的 query 参数名（已知候选：`volumeFromValue`；CPC / difficulty 以侦察为准）
3. 下一页控件的可点击选择器与「无更多」判定

若侦察发现稳定 JSON API 且可复放，可在 strategy note 中记录；一期仍以 UI 为默认交付路径，不阻塞于 API。

### 3.2 Target page (deep link)

```
https://sim.3ue.com/#/digitalsuite/acquisition/findkeywords/keyword-generator-tool/999/28d
  ?searchEngine={engine}
  &keyword={keyword}
  &webSource=Total
  &isWWW=*
  &tab=phraseMatch
  [&volumeFromValue={minVolume}]
  [&…cpc…]
  [&…difficulty…]
  &_={cacheBust}
```

具体 CPC / difficulty 的 query 键名以侦察结果写入实现与本 spec 的补丁说明；若页面不支持某筛选项的 URL，则仅做本地过滤。

## 4. Command contract

### 4.1 Args

| Arg | Type | Required | Default | Notes |
|-----|------|----------|---------|-------|
| `keyword` | string | yes（positional） | — | 种子词；trim 后非空；空则 `ArgumentError` |
| `engine` | string | no | `google` | 映射 `searchEngine=`；未知值：实现时可先透传或校验白名单（侦察后定） |
| `min-volume` | number | no | 不限 | 搜索量下限；有值则优先写 URL，再本地兜底 |
| `min-cpc` | number | no | 不限 | CPC 下限（美元或页面单位，以页面显示为准解析） |
| `max-difficulty` | number | no | 不限 | 难度上限（通常 0–100） |
| `limit` | int | no | `50` | `1–100`，与 `lib/utils` 的 `DEFAULT_LIMIT` / `MAX_LIMIT` 一致 |

**不暴露：** `tab`、`webSource`、`isWWW`、duration、phrase/exact 切换、区间 to 端。

### 4.2 Output columns

以侦察后的真实字段为准，**至少**包含：

| Column | Meaning |
|--------|---------|
| `keyword` | 生成出的关键词 |
| `volume` | 搜索量（输出保留页面展示字符串，如 `1.2K`；本地筛选时解析为数字） |
| `cpc` | 单次点击成本（输出保留页面展示字符串；筛选时解析数字） |
| `difficulty` | 关键词难度（输出为数字或页面字符串；筛选时按数字比较） |

侦察后可增加页面可见列（如 `competition`、`results`）；`columns` 在命令注册中固化。

### 4.3 Filtering semantics

1. **URL 优先**：能映射的筛选项写入 deep link，让服务端/前端少返回无关行。  
2. **本地兜底**：对每页刮出的行，按数值比较再滤一遍（解析 `1.2K` / `$0.45` / `N/A` 等；无法解析的行在对应筛选项开启时丢弃或保留策略：默认**丢弃**以免污染结果）。  
3. **计数**：只有通过本地过滤的行计入 `--limit`。

### 4.4 Pagination

```
open deep link → wait ready → extract → local filter → accumulate
while (accumulated.length < limit && hasNextPage):
  click next → wait table refresh → extract → local filter → append
return accumulated.slice(0, limit)
```

- `hasNextPage`：下一页按钮存在且未 disabled / 非末页标记（侦察后定）。  
- 单页超时与整体命令超时：沿用 `LOAD_TIMEOUT_SEC`（90s）与环境变量 `OPENCLI_BROWSER_COMMAND_TIMEOUT`。  
- 翻页失败（点击无响应）：停止翻页，返回已积累行；若最终为空再抛 `EmptyResultError`。  
- **保护上限：** 最多翻 **20** 页（或累计行数已达 `limit` 即停），避免控件误判导致死循环。

### 4.5 Errors（typed）

| Error | When |
|-------|------|
| `ArgumentError` | keyword 空；limit 非法；数值筛选项非法（负数等） |
| `AuthRequiredError` | 未登录 / 会话失效 |
| `TimeoutError` | 首屏或翻页后长时间非 ready |
| `CommandExecutionError` | 页面显式错误态 |
| `EmptyResultError` | 过滤/翻页后仍无行 |

## 5. Data flow

```
CLI kwargs
  → normalize keyword / engine / filters / limit
  → buildDeepLink(...)
  → openDeepLink(page, url)
  → waitForPageStatus(PAGE_STATUS_JS)
  → loop: evaluate(EXTRACT_ROWS_JS) → applyLocalFilters → accumulate / paginate
  → return rows.slice(0, limit)
```

复用：`openDeepLink`、`waitForPageStatus`、`normalizeLimit`、`parseJsonRows`、`SITE_ORIGIN`。

## 6. Verification

1. `opencli doctor` 通过；Chrome 已登录 `sim.3ue.com`  
2. 手工打开参考 URL，确认表格与筛选项  
3. `npm run build:sim` + `opencli plugin update sim`（或 reinstall）  
4. 冒烟：

```bash
opencli sim keyword-generator dice --limit 5 -f json
opencli sim keyword-generator dice --min-volume 1000 --max-difficulty 50 --limit 20 -f json
```

5. 肉眼对照网页：字段一致；有筛选时结果满足边界；`--limit 20` 时若首屏不足则确实发生翻页

## 7. Out of scope (一期)

- exact / related 等其它 tab  
- `--volume-to` / `--cpc-to` / `--difficulty-from` 等双端区间参数  
- 多种子词批量、CSV 导出、Cursor skill 包装  
- 默认以 HTTP API 复放为交付路径（侦察可用可记笔记，不阻塞 UI）  
- 自动登录 / 绕过风控  
- 上游贡献到 `@jackwener/opencli` 官方 clis

## 8. Risks

| Risk | Mitigation |
|------|------------|
| 筛选项 query 名与假设不符 | 侦察后固化；URL 失败则纯本地过滤 |
| 虚拟滚动 / 列布局与 landing-pages 不同 | 按页面专用 EXTRACT_ROWS_JS，不硬套旧选择器 |
| 翻页控件难定位或无限加载 | 明确末页判定 + 最大翻页次数保护（建议 ≤ 20 页或累计达到 limit 即停） |
| 体量/CPC 展示为 `1.2K` / `$0.5` | 统一 parse 辅助函数，单测或表驱动边界用例 |
| GMITM / SPA 改版 | strategy note + 与现有 sim 相同的 auth/error 路径 |

## 9. Success criteria

- [ ] `opencli sim --help` / `opencli list` 可见 `keyword-generator`  
- [ ] `opencli sim keyword-generator dice --limit 5 -f json` 非空且含 keyword/volume/cpc/difficulty  
- [ ] 带 `--min-volume` / `--min-cpc` / `--max-difficulty` 时结果满足条件  
- [ ] `--limit` 大于首屏条数时会自动翻页并凑满（或直到无更多）  
- [ ] README 命令表与用法已更新  

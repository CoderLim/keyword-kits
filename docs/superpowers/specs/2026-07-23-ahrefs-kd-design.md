# ahrefs kd — Design Spec

**Date:** 2026-07-23  
**Status:** Draft for review  
**Scope:** 第一期 — 免费 Keyword Difficulty Checker，单关键词查询

## 1. Goal

在本仓库新增 opencli 子插件 `packages/ahrefs`，对接 Ahrefs 免费 [Keyword Difficulty Checker](https://ahrefs.com/keyword-difficulty)，提供：

```bash
opencli ahrefs kd "<keyword>" [--country us]
```

返回单行结构化结果（`keyword` / `country` / `kd`），尽量免登录。

## 2. Decisions (locked)

| 决策 | 选择 |
|------|------|
| 交付形态 | `packages/ahrefs` 子插件（monorepo，与 `sim` / `google-trends` 并列） |
| 命令 | `site: ahrefs`，`name: kd` → `opencli ahrefs kd` |
| 数据源 | 仅免费 Keyword Difficulty Checker 页；不依赖 Ahrefs 付费账号 |
| 鉴权 | 一期免登录；若页面变为必须登录才出结果 → 明确报错，不静默失败 |
| 输入 | 单关键词（位置参数必填）；不做批量 / `--file` |
| 国家 | `--country`，默认 `us`；须为两位小写字母码（`/^[a-z]{2}$/`） |
| 输出 | 最小集：`keyword`、`country`、`kd`（整数 0–100） |
| 策略路径 | **方案 1**：侦察后优先 PUBLIC；不可用则固定降级为 UI；一期只落地一种策略 |

## 3. Architecture

```
keyword-kits/
├── opencli-plugin.json          # 增加 ahrefs → packages/ahrefs
├── package.json                 # workspaces + build 脚本
└── packages/ahrefs/
    ├── opencli-plugin.json
    ├── package.json
    ├── src/kd.ts                # cli 定义 + 抽取逻辑
    └── kd.js                    # build 产物（gitignore）
```

安装 / 验证：

```bash
npm install && npm run build
opencli plugin install file://$(pwd)/packages/ahrefs
# 或 update
opencli ahrefs kd "keyword research" --country us -f json
```

### 3.1 Strategy note（实现前强制写入 `kd.ts` 注释）

实现前对 `https://ahrefs.com/keyword-difficulty` 做网络侦察，然后**选定一种**策略写入源码（一期不做运行时双路径切换）：

| 条件 | Strategy | 说明 |
|------|----------|------|
| 存在无需登录、可稳定复放的 KD 接口 | `PUBLIC`（`browser: false`） | 对齐 `google trendsNow` |
| 无可用公开 API / 强依赖前端或反爬 | `UI`（Chrome Bridge） | 打开免费页 → 填词 → 选国家 → 点 Check → 抽 KD |

Strategy note 至少包含：Strategy / Contract / Evidence / Auth。

### 3.2 Target page

```
https://ahrefs.com/keyword-difficulty
```

国家选择器与「Check keyword」交互以侦察时的真实 DOM / query 为准。

## 4. Command contract

### 4.1 Args

| Arg | Type | Required | Default | Notes |
|-----|------|----------|---------|-------|
| `keyword` | string | yes | — | 位置参数；trim 后非空 |
| `country` | string | no | `us` | `--country`；规范化为小写；须匹配 `/^[a-z]{2}$/`（如 `us`/`uk`/`de`）；非法 → `ArgumentError` |

第一期 **不** 支持：批量关键词、`--file`、登录会话增强、volume 等扩展字段。

### 4.2 Output columns

| Column | Type | Meaning |
|--------|------|---------|
| `keyword` | string | 查询关键词（规范化后的输入） |
| `country` | string | 国家码（如 `us`） |
| `kd` | int | Keyword Difficulty，0–100 |

`-f json` / table 一律返回**单元素列表**（与 `sim` / `trendsNow` 的行列表习惯对齐），例如 `[{ "keyword": "…", "country": "us", "kd": 40 }]`。

### 4.3 Runtime data flow

```
args(keyword, country)
  → normalize（trim keyword；country 小写）
  → 选定策略取原始结果
  → 校验 kd 为 [0, 100] 整数
  → 返回 { keyword, country, kd }
```

## 5. Errors

| 情况 | 行为 |
|------|------|
| 缺关键词 / country 非法 | `ArgumentError` |
| 取不到 KD（空结果、选择器失效、解析失败） | `EmptyResultError` |
| 免费页限流 / 挑战页 / 反爬拦截 | `CommandExecutionError`，信息可读 |
| UI 路径超时 | `TimeoutError`；文档建议加大 `OPENCLI_BROWSER_COMMAND_TIMEOUT` |
| 页面要求登录才能出 KD | 明确报错（与「免登录」目标冲突），不静默返回假数据 |

## 6. Out of scope（第一期）

- Ahrefs Keywords Explorer / 付费 API
- 批量查询、文件输入
- 搜索量、Traffic Potential 等扩展指标
- 运行时 PUBLIC↔UI 自动切换
- Agent Skill（可二期再加）

## 7. Verification

1. `npm run build`（含 `packages/ahrefs`）
2. `opencli plugin install|update file://$(pwd)/packages/ahrefs`
3. `opencli ahrefs kd --help` 可见参数
4. 样例：`opencli ahrefs kd "keyword research" --country us -f json` → 三列齐全且 `kd` 为数字
5. 缺关键词 / 非法 country 触发 `ArgumentError`

## 8. Docs touchpoints

实现完成后更新根 `README.md`：插件表、安装命令、`ahrefs kd` 用法与故障排查（尤其 UI 路径的 Chrome / 超时）。

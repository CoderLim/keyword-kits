# opencli plugins (sim + google-trends)

基于 [opencli](https://github.com/jackwener/OpenCLI) 的插件 monorepo：

| 子插件 | 说明 |
|--------|------|
| [`packages/sim`](packages/sim) | SimilarWeb（`sim.3ue.com`），需已登录 Chrome |
| [`packages/google-trends`](packages/google-trends) | Google Trends 扩展，挂到 `opencli google …`（PUBLIC，无需浏览器） |

仓库：https://github.com/CoderLim/keyword-kits

---

## 前置条件

1. **Node.js** >= 20  
2. **opencli** >= 1.8.6  

```bash
npm install -g @jackwener/opencli
opencli doctor   # 需显示 Everything looks good
```

对 **sim** 额外需要：

3. Chrome 已安装 [OpenCLI 扩展](https://chromewebstore.google.com/detail/opencli/ildkmabpimmkaediidaifkhjpohdnifk)  
4. 浏览器中已登录 **https://sim.3ue.com**

**google-trends** 不需要 Chrome。

---

## 安装

```bash
git clone https://github.com/CoderLim/keyword-kits.git
cd keyword-kits
npm install
npm run build
# monorepo 本地安装需指向子插件目录：
opencli plugin install file://$(pwd)/packages/sim
opencli plugin install file://$(pwd)/packages/google-trends
```

从 GitHub monorepo 安装：

```bash
opencli plugin install github:CoderLim/keyword-kits
# 或只装其中一个：
opencli plugin install github:CoderLim/keyword-kits/sim
opencli plugin install github:CoderLim/keyword-kits/google-trends
```

确认：

```bash
opencli plugin list
opencli sim --help
opencli google trendsNow --help
```

更新 / 卸载：

```bash
opencli plugin update sim
opencli plugin update google-trends
opencli plugin uninstall sim
opencli plugin uninstall google-trends
```

---

## 命令一览

| 命令 | 插件 | 说明 |
|------|------|------|
| `sim backlinks` | sim | 反向链接 |
| `sim landing-pages` | sim | 自然着陆页（默认新点击量） |
| `google trendsNow` | google-trends | Trending Now（支持 geo / status / hours） |

官方内置 `google trends`（RSS 日报热搜）仍可用，与本仓库的 `trendsNow` 互不覆盖。

---

## `google trendsNow`

拉取 [Trending Now](https://trends.google.com/trending?geo=US&hl=en-US&status=active&hours=24) 数据（batchexecute PUBLIC API）。

```bash
opencli google trendsNow
opencli google trendsNow --geo JP --status active --hours 24 --limit 25 -f json
opencli google trendsNow --status all --hours 4
opencli google trendsNow --status ended --hours 48 --limit 50
```

| 参数 | 类型 | 默认 | 说明 |
|------|------|------|------|
| `--geo` | string | `US` | 地区码（如 US、JP、GB） |
| `--status` | string | `active` | `active` / `ended` / `all` |
| `--hours` | int | `24` | `4` / `24` / `48` / `168` |
| `--limit` | int | `25` | 返回条数，`1–500` |
| `--hl` | string | `en-US` | 语言 |

输出列：`title`、`volume`、`increase`、`status`、`started`、`ended`、`breakdown`

**分页：** 不支持。接口一次返回当前 `geo`/`hours` 下的全部条目；网页上的翻页是前端切片。本命令只在本地按 `--status` 过滤后再用 `--limit` 截断（没有 `--page` / `--offset`）。要更多结果就加大 `--limit`。

---

## `sim backlinks`

查看指定网站的反向链接列表。

**固定默认筛选（一期不暴露为参数）：**

| 项 | 值 |
|----|-----|
| duration | `28d` |
| sort | `DomainScore` |
| status | `Active` |

对应页面：

```
https://sim.3ue.com/#/digitalsuite/acquisition/backlinks/table/999/?duration=28d&key={domain}&sort=DomainScore&status=Active
```

#### 用法

```bash
opencli sim backlinks stripe.com
opencli sim backlinks stripe.com --limit 20 -f json
opencli sim backlinks https://www.stripe.com/pricing --limit 10 -f yaml
```

#### 参数

| 参数 | 类型 | 必填 | 默认 | 说明 |
|------|------|------|------|------|
| `domain` | string | 是 | — | 域名或 URL，会规范化为 host |
| `--limit` | int | 否 | `50` | 返回条数，范围 `1–100` |

#### 输出列

| 列 | 含义 |
|----|------|
| `rank` | 列表序号 |
| `sourceTitle` | 引用页标题 |
| `sourceUrl` | 引用页 URL |
| `anchor` | 锚文本 |
| `impact` | 反向链接影响分 |
| `domainScore` | 域名得分 |
| `targetUrl` | 目标 URL |
| `firstSeen` | 首次查看 |
| `lastSeen` | Last seen |

页面较慢时可提高超时：

```bash
OPENCLI_BROWSER_COMMAND_TIMEOUT=180 opencli sim backlinks stripe.com --limit 10 -f json
```

---

## `sim landing-pages`

查看指定网站的**自然着陆页**。**默认筛选「新点击量」**（`Change=New`）。

| 项 | 值 |
|----|-----|
| duration | `28d` |
| tab | `Organic` |
| webSource | `Total` |
| change | `New`（可用 `--change all` 关闭） |

```bash
opencli sim landing-pages vercel.app
opencli sim landing-pages vercel.app --limit 20 -f json
opencli sim landing-pages pollo.ai --change all --limit 20 -f json
```

| 参数 | 类型 | 必填 | 默认 | 说明 |
|------|------|------|------|------|
| `domain` | string | 是 | — | 域名或 URL |
| `--limit` | int | 否 | `50` | `1–100` |
| `--change` | string | 否 | `new` | `new`（新点击量）/ `all` |

输出列：`rank`、`url`、`clicks`、`clicksShare`、`change`、`keywords`、`topKeyword`、`serpFeatures`

---

## 实现说明

### sim

- **策略**：`Strategy.UI`  
- **源码**：`packages/sim/src/`  
- **产物**：`packages/sim/*.js`（`npm run build`，gitignore）

### google-trends

- **策略**：`Strategy.PUBLIC`（无需浏览器）  
- **API**：`trends.google.com/_/TrendsUi/data/batchexecute`（`i0OFE`）  
- **源码**：`packages/google-trends/src/trends-now.ts`  
- **产物**：`packages/google-trends/trends-now.js`

设计文档（sim）：

- [`docs/superpowers/specs/2026-07-23-sim-backlinks-design.md`](docs/superpowers/specs/2026-07-23-sim-backlinks-design.md)
- [`docs/superpowers/plans/2026-07-23-sim-backlinks.md`](docs/superpowers/plans/2026-07-23-sim-backlinks.md)

---

## 开发

```bash
npm install
npm run build
opencli plugin install file://$(pwd)/packages/sim
opencli plugin install file://$(pwd)/packages/google-trends

opencli google trendsNow --limit 5 -f json
opencli sim backlinks stripe.com --limit 5 -f json
```

目录结构：

```
keyword-kits/
├── opencli-plugin.json          # monorepo plugins 声明
├── package.json                 # workspaces
├── packages/
│   ├── sim/
│   │   ├── opencli-plugin.json
│   │   ├── package.json
│   │   ├── src/
│   │   └── *.js                 # build 产物
│   └── google-trends/
│       ├── opencli-plugin.json
│       ├── package.json
│       ├── src/trends-now.ts
│       └── trends-now.js
├── scripts/
├── .cursor/skills/
├── README.md
└── docs/
```

修改 TypeScript 后务必重新 `npm run build`，再跑命令验证。

---

## 故障排查

| 现象 | 处理 |
|------|------|
| `opencli doctor` 失败 | 检查 daemon / Chrome 扩展（仅 sim 需要） |
| `AUTH_REQUIRED`（sim） | Chrome 打开并登录 sim.3ue.com |
| `TIMEOUT`（sim） | 加大 `OPENCLI_BROWSER_COMMAND_TIMEOUT` |
| 命令未注册 | 确认已装对应子插件目录；`opencli plugin list` |
| 改了 TS 无效果 | 重新 `npm run build` |
| `trendsNow` 无数据 | 换 `geo` / `hours` / `status`，或稍后重试 |

---

## Agent Skills

### `subdomain-keywords`

路径：[`.cursor/skills/subdomain-keywords/SKILL.md`](.cursor/skills/subdomain-keywords/SKILL.md)

从托管子域名平台批量发现「新点击」英文关键词，并生成 Google Trends 对比链接。依赖已安装的 **sim** 插件。

```bash
OPENCLI_BROWSER_COMMAND_TIMEOUT=180 npm run subdomain-keywords
OPENCLI_BROWSER_COMMAND_TIMEOUT=180 npm run subdomain-keywords -- --json
```

### `trendsnow-keywords`

路径：[`.cursor/skills/trendsnow-keywords/SKILL.md`](.cursor/skills/trendsnow-keywords/SKILL.md)

通过 `opencli google trendsNow` 拉取近期热搜，逐词判断哪些适合做成**工具站 / 游戏站**等网站，并给出中文翻译。**不要强行把关键词解读成符合预期的需求**；无可做的词就如实说明。依赖已安装的 **google-trends** 子插件。

触发示例：`/trendsnow-keywords`，或「用 trendsNow 看看有没有能做工具站的热词」。

默认拉取：

```bash
opencli google trendsNow --geo US --status active --hours 24 --limit 50 -f json
```

---

## Scripts

### `scripts/subdomain-keywords.mjs`

```bash
OPENCLI_BROWSER_COMMAND_TIMEOUT=180 node scripts/subdomain-keywords.mjs
OPENCLI_BROWSER_COMMAND_TIMEOUT=180 node scripts/subdomain-keywords.mjs --json
```

### `scripts/google-trends-url.mjs`

由关键词数组生成 Google Trends explore URL（每组最多 5 词）。

```bash
node scripts/google-trends-url.mjs Calculator Converter Translator Generator Example
```

---

## License

MIT

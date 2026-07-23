# opencli plugins (sim + google-trends + query-domain + ahrefs + namecheap)

基于 [opencli](https://github.com/jackwener/OpenCLI) 的插件 monorepo：

| 子插件 | 说明 |
|--------|------|
| [`packages/sim`](packages/sim) | SimilarWeb（`sim.3ue.com`），需已登录 Chrome |
| [`packages/google-trends`](packages/google-trends) | Google Trends 扩展，挂到 `opencli google …`（PUBLIC，无需浏览器） |
| [`packages/query-domain`](packages/query-domain) | query.domains 关键词域名列表，`queryDomain search`，PUBLIC，无需 Chrome |
| [`packages/ahrefs`](packages/ahrefs) | Ahrefs 免费 KD + Backlink Checker（DR + 外链），尽量免登录；需 Chrome Bridge（Strategy.UI） |
| [`packages/namecheap`](packages/namecheap) | Namecheap 域名 Custom DNS nameserver 设置，需已登录 Chrome |

仓库：https://github.com/CoderLim/keyword-kits

---

## 前置条件

1. **Node.js** >= 20  
2. **opencli** >= 1.8.6  

```bash
npm install -g @jackwener/opencli
opencli doctor   # 需显示 Everything looks good
```

对 **sim**、**ahrefs** 与 **namecheap** 额外需要：

3. Chrome 已安装 [OpenCLI 扩展](https://chromewebstore.google.com/detail/opencli/ildkmabpimmkaediidaifkhjpohdnifk)  

对 **sim** 还需：

4. 浏览器中已登录 **https://sim.3ue.com**

对 **namecheap** 还需：

5. 浏览器中已登录 **https://ap.www.namecheap.com**

**ahrefs** 只需 Chrome Bridge，**不需要** Ahrefs 账号登录。

**google-trends** 与 **query-domain** 不需要 Chrome。

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
opencli plugin install file://$(pwd)/packages/query-domain
opencli plugin install file://$(pwd)/packages/ahrefs
opencli plugin install file://$(pwd)/packages/namecheap
```

从 GitHub monorepo 安装：

```bash
opencli plugin install github:CoderLim/keyword-kits
# 或只装其中一个：
opencli plugin install github:CoderLim/keyword-kits/sim
opencli plugin install github:CoderLim/keyword-kits/google-trends
opencli plugin install github:CoderLim/keyword-kits/query-domain
opencli plugin install github:CoderLim/keyword-kits/ahrefs
opencli plugin install github:CoderLim/keyword-kits/namecheap
```

确认：

```bash
opencli plugin list
opencli sim --help
opencli google trendsNow --help
opencli queryDomain --help
opencli ahrefs kd --help
opencli ahrefs backlinks --help
opencli namecheap set-nameserver --help
```

更新 / 卸载：

```bash
opencli plugin update sim
opencli plugin update google-trends
opencli plugin update query-domain
opencli plugin update ahrefs
opencli plugin update namecheap
opencli plugin uninstall sim
opencli plugin uninstall google-trends
opencli plugin uninstall query-domain
opencli plugin uninstall ahrefs
opencli plugin uninstall namecheap
```

---

## 命令一览

| 命令 | 插件 | 说明 |
|------|------|------|
| `sim backlinks` | sim | 反向链接 |
| `sim landing-pages` | sim | 自然着陆页（默认新点击量） |
| `sim keyword-generator` | sim | 关键词生成器（phrase match，可筛 volume/CPC/难度） |
| `google trendsNow` | google-trends | Trending Now（支持 geo / status / hours） |
| `queryDomain search` | query-domain | 关键词相关域名列表（固定 14 TLD） |
| `ahrefs kd` | ahrefs | 免费 Keyword Difficulty |
| `ahrefs backlinks` | ahrefs | 免费 Backlink Checker（DR + 外链） |
| `namecheap set-nameserver` | namecheap | 设置域名 Custom DNS nameservers |

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

## `queryDomain search`

按关键词查询 [query.domains](https://query.domains/) 首页同款域名列表（固定默认 14 个 TLD）。PUBLIC，无需 Chrome。

```bash
opencli queryDomain search "ai image"
opencli queryDomain search "ai image" -f json
```

| 参数 | 类型 | 说明 |
|------|------|------|
| `keyword` | string（位置） | 关键词；多词去空格拼接（`ai image` → `aiimage`） |

输出列：`domain`, `year`, `dr`, `forSale`, `registered`, `expires`, `existed`

遇 HTTP 429 时稍后重试，或在站点登录 / 升级 Pro。

---

## `ahrefs kd`

查询 [Ahrefs 免费 Keyword Difficulty Checker](https://ahrefs.com/keyword-difficulty) 的 KD 分数。尽量免登录；底层 XHR 需 captcha，故采用 **Strategy.UI**（非 PUBLIC）。

需 Chrome + OpenCLI 扩展（与 sim 类似），**不需要** Ahrefs 账号登录。

```bash
opencli ahrefs kd "keyword research"
opencli ahrefs kd "keyword research" --country us -f json
OPENCLI_BROWSER_COMMAND_TIMEOUT=180 opencli ahrefs kd "seo tools" --country uk -f json
```

| 参数 | 类型 | 默认 | 说明 |
|------|------|------|------|
| `keyword` | string（位置） | — | 要查询的关键词或短语 |
| `--country` | string | `us` | 两位小写国家码，遵循 Ahrefs（如 `us`、`gb`、`de`）；英国为 `gb`，`uk` 作为别名会映射为 `gb` |

输出列：`keyword`、`country`、`kd`（整数 0–100）

对应页面 deep-link（自动触发检查）：

```
https://ahrefs.com/keyword-difficulty/?country=us&input=keyword%20research
```

页面较慢或 CookieYes 弹窗时可提高超时：

```bash
OPENCLI_BROWSER_COMMAND_TIMEOUT=180 opencli ahrefs kd "keyword research" -f json
```

设计文档：

- [`docs/superpowers/specs/2026-07-23-ahrefs-kd-design.md`](docs/superpowers/specs/2026-07-23-ahrefs-kd-design.md)
- [`docs/superpowers/plans/2026-07-23-ahrefs-kd.md`](docs/superpowers/plans/2026-07-23-ahrefs-kd.md)

---

## `ahrefs backlinks`

查询 [Ahrefs 免费 Backlink Checker](https://ahrefs.com/backlink-checker/) 的域名 DR 与外链列表。尽量免登录；底层 XHR 需 Turnstile captcha，故采用 **Strategy.UI**（非 PUBLIC）。

需 Chrome + OpenCLI 扩展（与 sim / ahrefs kd 类似），**不需要** Ahrefs 账号登录。

```bash
opencli ahrefs backlinks ahrefs.com
OPENCLI_BROWSER_COMMAND_TIMEOUT=180 opencli ahrefs backlinks ahrefs.com -f json
```

**推荐 `-f json`**：返回单个 `{ summary, links }` 对象（非行数组）。

| 参数 | 类型 | 说明 |
|------|------|------|
| `domain` | string（位置） | 目标域名或 URL，会规范化为 host |

**固定行为（一期不暴露为参数）：** `mode=subdomains`（含子域名）；**无** `--limit`，返回页上当前可见的全部外链行。

对应页面 deep-link（仅预填域名与 mode，**不会自动检查**）：

```
https://ahrefs.com/backlink-checker/?input={domain}&mode=subdomains
```

网页上需手动点击 **Check backlinks**；本命令会自动完成 CookieYes 关闭与点击检查。

**summary** 字段：`domain`、`dr`、`refDomains`（Linking websites）、`refDomainsDofollowPct`、`backlinks`、`backlinksDofollowPct`

**links** 列：`dr`、`title`、`sourceUrl`、`anchor`、`targetUrl`

页面较慢或 CookieYes 弹窗时可提高超时：

```bash
OPENCLI_BROWSER_COMMAND_TIMEOUT=180 opencli ahrefs backlinks ahrefs.com -f json
```

设计文档：

- [`docs/superpowers/specs/2026-07-23-ahrefs-backlinks-design.md`](docs/superpowers/specs/2026-07-23-ahrefs-backlinks-design.md)
- [`docs/superpowers/plans/2026-07-23-ahrefs-backlinks.md`](docs/superpowers/plans/2026-07-23-ahrefs-backlinks.md)

---

## `namecheap set-nameserver`

把 Namecheap 域名的 Nameservers 切到 **Custom DNS** 并写入指定 NS。需 Chrome Bridge，且浏览器已登录 Namecheap。

```bash
opencli namecheap set-nameserver 73-9.org --ns ns1.cloudflare.com,ns2.cloudflare.com
opencli namecheap set-nameserver 73-9.org --ns "ns1.cloudflare.com ns2.cloudflare.com" -f json
```

| 参数 | 类型 | 说明 |
|------|------|------|
| `domain` | string（位置） | 域名，如 `73-9.org` |
| `--ns` | string | 逗号/空白分隔的 nameserver 列表，至少 2 个 |

输出列：`domain`、`nameserver`、`index`、`status`、`message`

对应页面：

```
https://ap.www.namecheap.com/domains/domaincontrolpanel/{domain}/domain
```

DNS 生效可能需要最多 48 小时。

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

## `sim keyword-generator`

SimilarWeb **关键词生成器**（phrase match）。输入种子词，返回相关关键词及搜索量 / CPC / 难度；支持本地下限/上限筛选，并自动翻页直到凑满 `--limit`。

**固定默认筛选（一期不暴露为参数）：**

| 项 | 值 |
|----|-----|
| tab | `phraseMatch` |
| duration | `28d` |
| webSource | `Total` |
| isWWW | `*` |

对应页面：

```
https://sim.3ue.com/#/digitalsuite/acquisition/findkeywords/keyword-generator-tool/999/28d
  ?searchEngine=google&keyword={keyword}&webSource=Total&isWWW=*&tab=phraseMatch
```

#### 用法

```bash
OPENCLI_BROWSER_COMMAND_TIMEOUT=180 opencli sim keyword-generator dice --limit 5 -f json
OPENCLI_BROWSER_COMMAND_TIMEOUT=180 opencli sim keyword-generator dice --min-volume 1000 --max-difficulty 50 --limit 20 -f json
opencli sim keyword-generator dice --engine google --min-cpc 0.5 --limit 50 -f json
```

#### 参数

| 参数 | 类型 | 必填 | 默认 | 说明 |
|------|------|------|------|------|
| `keyword` | string | 是 | — | 种子词（位置参数） |
| `--engine` | string | 否 | `google` | 搜索引擎 |
| `--min-volume` | float | 否 | 不限 | 搜索量下限 |
| `--min-cpc` | float | 否 | 不限 | CPC 下限 |
| `--max-difficulty` | float | 否 | 不限 | 难度上限 |
| `--limit` | int | 否 | `50` | 返回条数，范围 `1–100` |

#### 输出列

| 列 | 含义 |
|----|------|
| `keyword` | 关键词 |
| `volume` | 搜索量 |
| `cpc` | CPC |
| `difficulty` | 关键词难度 |

**分页：** 自动翻页（最多约 20 页），直到结果数 ≥ `--limit` 或没有下一页。筛选项写入 deep link query，并在本地再过滤兜底。

页面较慢时可提高超时：

```bash
OPENCLI_BROWSER_COMMAND_TIMEOUT=180 opencli sim keyword-generator dice --limit 10 -f json
```

设计 / 侦察：

- [`docs/superpowers/specs/2026-07-23-sim-keyword-generator-design.md`](docs/superpowers/specs/2026-07-23-sim-keyword-generator-design.md)
- [`docs/superpowers/specs/2026-07-23-sim-keyword-generator-recon-notes.md`](docs/superpowers/specs/2026-07-23-sim-keyword-generator-recon-notes.md)
- [`docs/superpowers/plans/2026-07-23-sim-keyword-generator.md`](docs/superpowers/plans/2026-07-23-sim-keyword-generator.md)

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

### ahrefs

- **策略**：`Strategy.UI`（免费页；底层 API 需 captcha / Turnstile，非 PUBLIC）  
- **页面**：`https://ahrefs.com/keyword-difficulty`（kd deep-link 自动检查）；`https://ahrefs.com/backlink-checker`（backlinks deep-link 仅预填，命令自动点击 Check）  
- **源码**：`packages/ahrefs/src/kd.ts`、`packages/ahrefs/src/backlinks.ts`  
- **产物**：`packages/ahrefs/kd.js`、`packages/ahrefs/backlinks.js`（`npm run build`，gitignore）

设计文档（sim）：

- [`docs/superpowers/specs/2026-07-23-sim-backlinks-design.md`](docs/superpowers/specs/2026-07-23-sim-backlinks-design.md)
- [`docs/superpowers/plans/2026-07-23-sim-backlinks.md`](docs/superpowers/plans/2026-07-23-sim-backlinks.md)
- [`docs/superpowers/specs/2026-07-23-sim-keyword-generator-design.md`](docs/superpowers/specs/2026-07-23-sim-keyword-generator-design.md)
- [`docs/superpowers/specs/2026-07-23-sim-keyword-generator-recon-notes.md`](docs/superpowers/specs/2026-07-23-sim-keyword-generator-recon-notes.md)
- [`docs/superpowers/plans/2026-07-23-sim-keyword-generator.md`](docs/superpowers/plans/2026-07-23-sim-keyword-generator.md)

---

## 开发

```bash
npm install
npm run build
opencli plugin install file://$(pwd)/packages/sim
opencli plugin install file://$(pwd)/packages/google-trends
opencli plugin install file://$(pwd)/packages/query-domain
opencli plugin install file://$(pwd)/packages/ahrefs
opencli plugin install file://$(pwd)/packages/namecheap

opencli google trendsNow --limit 5 -f json
opencli sim backlinks stripe.com --limit 5 -f json
opencli queryDomain search "ai image" -f json
OPENCLI_BROWSER_COMMAND_TIMEOUT=180 opencli ahrefs kd "keyword research" -f json
OPENCLI_BROWSER_COMMAND_TIMEOUT=180 opencli ahrefs backlinks ahrefs.com -f json
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
│   ├── google-trends/
│   │   ├── opencli-plugin.json
│   │   ├── package.json
│   │   ├── src/trends-now.ts
│   │   └── trends-now.js
│   ├── query-domain/
│   │   ├── opencli-plugin.json
│   │   ├── package.json
│   │   ├── src/lib.ts
│   │   ├── src/search.ts
│   │   └── *.js                 # build 产物
│   ├── ahrefs/
│   │   ├── opencli-plugin.json
│   │   ├── package.json
│   │   ├── src/kd.ts
│   │   ├── src/backlinks.ts
│   │   ├── kd.js                # build 产物
│   │   └── backlinks.js         # build 产物
│   └── namecheap/
│       ├── opencli-plugin.json
│       ├── package.json
│       ├── src/
│       └── *.js                 # build 产物
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
| `opencli doctor` 失败 | 检查 daemon / Chrome 扩展（sim / ahrefs 需要） |
| `AUTH_REQUIRED`（sim） | Chrome 打开并登录 sim.3ue.com |
| `TIMEOUT`（sim / ahrefs） | 加大 `OPENCLI_BROWSER_COMMAND_TIMEOUT`（如 `180`） |
| challenge / rate limit（ahrefs） | Cloudflare 或频率限制；稍后重试或换网络 |
| 意外登录墙（ahrefs） | 免费页策略变更；报错 `requires login unexpectedly` |
| CookieYes 弹窗挡点击（ahrefs） | 命令会自动尝试 Accept/Reject All；仍失败则手动在 Chrome 关掉弹窗后重试 |
| Ahrefs 偶发超时 / 空结果（ahrefs） | 页面加载或 Turnstile 较慢；加大 `OPENCLI_BROWSER_COMMAND_TIMEOUT` 后重试 |
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

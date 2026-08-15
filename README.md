# opencli plugins (sim + google-trends + google-suggest + query-domain + ahrefs + namecheap + sem + aitdk)

基于 [opencli](https://github.com/jackwener/OpenCLI) 的插件 monorepo：

| 子插件 | 说明 |
|--------|------|
| [`packages/sim`](packages/sim) | SimilarWeb（`sim.3ue.com`），需已登录 Chrome |
| [`packages/google-trends`](packages/google-trends) | Google Trends：`google-trends now` + `google-trends explore`（PUBLIC，无需浏览器） |
| [`packages/google-suggest`](packages/google-suggest) | 覆盖内置 `google suggest`，支持 `--move-cursor` 多光标补全（PUBLIC） |
| [`packages/query-domain`](packages/query-domain) | query.domains 关键词域名列表，`queryDomain search`，PUBLIC，无需 Chrome |
| [`packages/ahrefs`](packages/ahrefs) | Ahrefs 免费 KD + Backlink Checker（DR + 外链），尽量免登录；需 Chrome Bridge（Strategy.UI） |
| [`packages/namecheap`](packages/namecheap) | Namecheap 域名 Custom DNS nameserver 设置，需已登录 Chrome |
| [`packages/sem`](packages/sem) | SEMrush（`sem.3ue.com`）域名查询与反向链接，需已登录 Chrome |
| [`packages/aitdk`](packages/aitdk) | AITDK 域名 SEO 数据快照（whois + 流量），`aitdk get-data`，PUBLIC，无需 Chrome |
| [`packages/google-ads`](packages/google-ads) | Google Ads API 关键词历史指标与拓词（Python CLI：`GenerateKeywordHistoricalMetrics` / `GenerateKeywordIdeas`） |

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

**google-trends**、**google-suggest**、**query-domain** 与 **aitdk** 不需要 Chrome。

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
opencli plugin install file://$(pwd)/packages/google-suggest
opencli plugin install file://$(pwd)/packages/query-domain
opencli plugin install file://$(pwd)/packages/ahrefs
opencli plugin install file://$(pwd)/packages/namecheap
opencli plugin install file://$(pwd)/packages/sem
opencli plugin install file://$(pwd)/packages/aitdk
```

从 GitHub monorepo 安装：

```bash
opencli plugin install github:CoderLim/keyword-kits
# 或只装其中一个：
opencli plugin install github:CoderLim/keyword-kits/sim
opencli plugin install github:CoderLim/keyword-kits/google-trends
opencli plugin install github:CoderLim/keyword-kits/google-suggest
opencli plugin install github:CoderLim/keyword-kits/query-domain
opencli plugin install github:CoderLim/keyword-kits/ahrefs
opencli plugin install github:CoderLim/keyword-kits/namecheap
opencli plugin install github:CoderLim/keyword-kits/sem
opencli plugin install github:CoderLim/keyword-kits/aitdk
```

确认：

```bash
opencli plugin list
opencli sim --help
opencli google-trends now --help
opencli google-trends explore --help
opencli google suggest --help
opencli queryDomain --help
opencli ahrefs kd --help
opencli ahrefs backlinks --help
opencli namecheap set-nameserver --help
opencli aitdk get-data --help
```

更新 / 卸载：

```bash
opencli plugin update sim
opencli plugin update google-trends
opencli plugin update google-suggest
opencli plugin update query-domain
opencli plugin update ahrefs
opencli plugin update namecheap
opencli plugin update sem
opencli plugin update aitdk
opencli plugin uninstall sim
opencli plugin uninstall google-trends
opencli plugin uninstall google-suggest
opencli plugin uninstall query-domain
opencli plugin uninstall ahrefs
opencli plugin uninstall namecheap
opencli plugin uninstall sem
opencli plugin uninstall aitdk
```

---

## 命令一览

| 命令 | 插件 | 说明 |
|------|------|------|
| `sim backlinks` | sim | 反向链接 |
| `sem backlinks` | sem | SEMrush 反向链接（支持自动翻页） |
| `sim landing-pages` | sim | 自然着陆页（默认新点击量） |
| `sim keyword-generator` | sim | 关键词生成器（phrase match，可筛 volume/CPC/难度） |
| `sim web-ranking` | sim | 站点排名（搜索自然流量；可按变动/月访问量排序；支持自动翻页） |
| `google-trends now` | google-trends | Trending Now（支持 geo / status / hours） |
| `google-trends explore` | google-trends | Explore：兴趣曲线 + 相关搜索（最多 5 词） |
| `google suggest` | google-suggest | 覆盖内置 Suggest；`--move-cursor` 扫开头/词后/结尾 |
| `queryDomain search` | query-domain | 关键词相关域名列表（固定 14 TLD） |
| `ahrefs kd` | ahrefs | 免费 Keyword Difficulty |
| `ahrefs backlinks` | ahrefs | 免费 Backlink Checker（DR + 外链） |
| `namecheap set-nameserver` | namecheap | 设置域名 Custom DNS nameservers |
| `aitdk get-data` | aitdk | 域名 SEO 数据快照（whois + 流量，无需 Chrome） |

官方内置 `google trends`（RSS 日报热搜）仍可用，与本仓库的 `google-trends now` / `explore` 互不覆盖。

安装 **google-suggest** 后会覆盖内置 `google suggest`（opencli 插件后加载，可覆盖 built-in）。`google news` / `search` / `trends` 不受影响。

---

## `google suggest`

拉取 [Google Suggest](https://suggestqueries.google.com/complete/search?client=firefox)（非官方公开补全接口）。默认句末续写；`--move-cursor` 在开头、每个单词后、结尾各请求一次。

```bash
opencli google suggest "anime expedition" --lang en -f json
opencli google suggest "anime expedition codes" --lang en --move-cursor -f json
```

| 参数 | 类型 | 默认 | 说明 |
|------|------|------|------|
| `keyword` | string | 必填 | 查询词 |
| `--lang` | string | `zh-CN` | 语言码（`hl`） |
| `--move-cursor` | bool | `false` | 多光标扫补全；输出含 `cp` / `cursor` |

输出列：`suggestion`、`cp`、`cursor`（默认模式下 `cp` 为空、`cursor=end`）

`cp` 为查询串上的 0-based 字符下标（JS UTF-16），与搜索框光标一致。

---

## `google-trends now`

拉取 [Trending Now](https://trends.google.com/trending?geo=US&hl=en-US&status=active&hours=24) 数据（batchexecute PUBLIC API）。

```bash
opencli google-trends now
opencli google-trends now --geo JP --status active --hours 24 --limit 25 -f json
opencli google-trends now --status all --hours 4
opencli google-trends now --status ended --hours 48 --limit 50
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

## `google-trends explore`

拉取 [Explore](https://trends.google.com/trends/explore) 的兴趣随时间曲线 + 相关搜索（top / rising）。PUBLIC token dance；推荐 `-f json`。

```bash
opencli google-trends explore "pdf to jpg" -f json
opencli google-trends explore "pdf to jpg" "jpg to pdf" --geo US --time "today 12-m" -f json
```

| 参数 | 类型 | 默认 | 说明 |
|------|------|------|------|
| `keyword`…`keyword5` | string | — | 1–5 个关键词（位置参数）；也可单独传逗号分隔 |
| `--geo` | string | `US` | 地区码；空字符串表示全球 |
| `--time` | string | `today 12-m` | Explore 时间范围（如 `now 7-d`、`today 3-m`） |
| `--hl` | string | `en-US` | 语言 |
| `--tz` | string | `0` | 时区偏移（分钟） |

JSON 字段：`keywords`、`geo`、`time`、`interest[]`（`time` / `formattedTime` / `values`）、`related[]`（每词 `top` / `rising`）。遇 HTTP 429 时稍后重试或减少词数。

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

## `aitdk get-data`

查询 [AITDK](https://extension.aitdk.com/) 的域名 SEO 数据快照（whois + 流量）。PUBLIC，无需 Chrome、无需登录。

底层调用 `wapi.aitdk.com/api/v1/bulk`（与 AITDK 浏览器扩展同款接口），请求用扩展内置的静态密钥签名，因此无需账号。

```bash
opencli aitdk get-data ahrefs.com
opencli aitdk get-data ahrefs.com -f json
opencli aitdk get-data https://www.ahrefs.com/pricing -f yaml
```

| 参数 | 类型 | 说明 |
|------|------|------|
| `domain` | string（位置） | 目标域名或 URL，会规范化为 host（去掉协议 / 路径 / `www.`） |

**默认表（table）输出列：** `domain`、`visits`、`globalRank`、`countryRank`、`bounceRate`、`pagePerVisit`、`timeOnSite`、`registrar`、`registered`、`expires`

**`-f json` / `-f yaml` 额外返回的嵌套字段：**

| 字段 | 含义 |
|------|------|
| `title` / `description` | 站点标题 / 描述 |
| `updated` | whois 最近变更日期 |
| `dataMonth` / `dataYear` | 流量数据归属月份 / 年份 |
| `nameservers` / `status` | 域名 NS 列表 / 域名状态 |
| `trafficSources` | 流量来源占比（direct / searchOrganic / social / referrals / mail / genAi …） |
| `topKeywords` | 自然 Top 关键词（name / volume / cpc / estimatedValue） |
| `topRegions` | Top 地区（name / value） |
| `aiTraffic` | 各 AI 来源（chatgpt.com / claude.ai / gemini …）最新引流值 |
| `monthlyVisits` | 近 12 个月月访问量（`YYYY-MM-DD` -> visits） |

**未知 / 未注册域名：** 返回 `EMPTY_RESULT`（exit 66），提示无数据。

**频率限制（429）：** 稍后重试。

**签名失效（403）：** AITDK 扩展轮换了内置密钥。运行 `npm run extract:aitdk-secret`（脚本会从 `extension.aitdk.com` 的 JS bundle 重新解码出当前 `secretKey` 并发一个签名请求验证 HTTP 200），把打印出的 `export const SECRET = '...';` 粘进 `packages/aitdk/src/lib.ts`，再 `npm run build:aitdk && opencli plugin update aitdk`。

设计文档：[`docs/superpowers/plans/2026-08-05-aitdk-get-data.md`](docs/superpowers/plans/2026-08-05-aitdk-get-data.md)

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

**默认筛选：**

| 项 | 值 |
|----|-----|
| duration | `28d` |
| sort | `DomainScore` |
| status | `Active` |
| follow | 全部（可用 `--dofollow` 筛选 DoFollow / NoFollow） |

> 注意：SimilarWeb 表格行数据**不含**逐条 dofollow 字段（React record 无 Follow），仅支持页面级筛选。

对应页面：

```
https://sim.3ue.com/#/digitalsuite/acquisition/backlinks/table/999/?duration=28d&key={domain}&sort=DomainScore&status=Active[&follow=DoFollowOnly|NoFollowOnly]
```

#### 用法

```bash
opencli sim backlinks stripe.com
opencli sim backlinks stripe.com --limit 20 -f json
opencli sim backlinks stripe.com --limit 500 -f json
opencli sim backlinks stripe.com --dofollow true --limit 20 -f json
opencli sim backlinks https://www.stripe.com/pricing --limit 10 -f yaml
```

#### 参数

| 参数 | 类型 | 必填 | 默认 | 说明 |
|------|------|------|------|------|
| `domain` | string | 是 | — | 域名或 URL，会规范化为 host |
| `--limit` | int | 否 | `50` | 返回条数，范围 `1–1000`；超过单页时自动翻页 |
| `--dofollow` | string | 否 | `all` | `true`（DoFollow）/ `false`（NoFollow）/ `all` |

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

`sem backlinks` 同样保留 `--limit` 接口并支持自动翻页；默认 `50`，范围 `1–1000`：

```bash
OPENCLI_BROWSER_COMMAND_TIMEOUT=180 opencli sem backlinks example.com --limit 500 -f json
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

## `sim web-ranking`

查看 Category Leaders **搜索自然流量**站点排名。固定筛选：Organic（自然）、时长 `1m`、全球、`webSource=Total`。当前页不够时自动点下一页，直到凑满 `--limit`（上限 1000）。

**固定默认筛选（一期不暴露为参数）：**

| 项 | 值 |
|----|-----|
| tab | `CategoryLeadersSearch` |
| channel | Organic（自然；需 UI 点击） |
| duration | `1m` |
| country | 全球 |
| webSource | `Total` |

对应页面：

```
https://sim.3ue.com/#/digitalsuite/markets/webmarketanalysis/rankings/{industry}/999/1m
  ?webSource=Total&selectedTab=CategoryLeadersSearch
```

#### 用法

```bash
OPENCLI_BROWSER_COMMAND_TIMEOUT=180 opencli sim web-ranking --limit 20 -f json
OPENCLI_BROWSER_COMMAND_TIMEOUT=180 opencli sim web-ranking --sort visits --limit 20 -f json
OPENCLI_BROWSER_COMMAND_TIMEOUT=180 opencli sim web-ranking --industry All --sort change --limit 10 -f json
```

#### 参数

| 参数 | 类型 | 必填 | 默认 | 说明 |
|------|------|------|------|------|
| `--sort` | string | 否 | `change` | `change`（变动降序）/ `visits`（每月访问量降序） |
| `--industry` | string | 否 | `All` | 行业：`All` 或已映射行业名 |
| `--limit` | int | 否 | `50` | 返回条数，范围 `1–1000`；超出当前页自动翻页 |

#### 输出列

| 列 | 含义 |
|----|------|
| `rank` | 列表序号 |
| `domain` | 域名 |
| `trafficShare` | 流量份额 |
| `change` | 变动（MoM） |
| `industry` | 行业 |
| `monthlyVisits` | 每月访问量 |
| `adsense` | 是否 AdSense |

页面较慢时可提高超时：

```bash
OPENCLI_BROWSER_COMMAND_TIMEOUT=180 opencli sim web-ranking --limit 10 -f json
```

设计 / 侦察：

- [`docs/superpowers/specs/2026-07-24-sim-web-ranking-design.md`](docs/superpowers/specs/2026-07-24-sim-web-ranking-design.md)
- [`docs/superpowers/specs/2026-07-24-sim-web-ranking-recon-notes.md`](docs/superpowers/specs/2026-07-24-sim-web-ranking-recon-notes.md)
- [`docs/superpowers/plans/2026-07-24-sim-web-ranking.md`](docs/superpowers/plans/2026-07-24-sim-web-ranking.md)

---

## 实现说明

### sim

- **策略**：`Strategy.UI`  
- **源码**：`packages/sim/src/`  
- **产物**：`packages/sim/*.js`（`npm run build`，gitignore）

### google-trends

- **策略**：`Strategy.PUBLIC`（无需浏览器）  
- **API（now）**：`trends.google.com/_/TrendsUi/data/batchexecute`（`i0OFE`）  
- **API（explore）**：`/trends/api/explore` → `widgetdata/multiline` + `widgetdata/relatedsearches`  
- **源码**：`packages/google-trends/src/now.ts`、`explore.ts`、`explore-lib.ts`  
- **产物**：`packages/google-trends/now.js`、`explore.js`

### ahrefs

- **策略**：`Strategy.UI`（免费页；底层 API 需 captcha / Turnstile，非 PUBLIC）  
- **页面**：`https://ahrefs.com/keyword-difficulty`（kd deep-link 自动检查）；`https://ahrefs.com/backlink-checker`（backlinks deep-link 仅预填，命令自动点击 Check）  
- **源码**：`packages/ahrefs/src/kd.ts`、`packages/ahrefs/src/backlinks.ts`  
- **产物**：`packages/ahrefs/kd.js`、`packages/ahrefs/backlinks.js`（`npm run build`，gitignore）

### aitdk

- **策略**：`Strategy.PUBLIC`（无需浏览器、无需登录）  
- **API**：`wapi.aitdk.com/api/v1/bulk`（SSE），用扩展内置静态密钥签名（`SHA-256(canonical + secret)`）  
- **源码**：`packages/aitdk/src/lib.ts`、`packages/aitdk/src/get-data.ts`  
- **产物**：`packages/aitdk/get-data.js`（`npm run build`，gitignore）

设计文档（sim）：

- [`docs/superpowers/specs/2026-07-23-sim-backlinks-design.md`](docs/superpowers/specs/2026-07-23-sim-backlinks-design.md)
- [`docs/superpowers/plans/2026-07-23-sim-backlinks.md`](docs/superpowers/plans/2026-07-23-sim-backlinks.md)
- [`docs/superpowers/specs/2026-07-23-sim-keyword-generator-design.md`](docs/superpowers/specs/2026-07-23-sim-keyword-generator-design.md)
- [`docs/superpowers/specs/2026-07-23-sim-keyword-generator-recon-notes.md`](docs/superpowers/specs/2026-07-23-sim-keyword-generator-recon-notes.md)
- [`docs/superpowers/plans/2026-07-23-sim-keyword-generator.md`](docs/superpowers/plans/2026-07-23-sim-keyword-generator.md)
- [`docs/superpowers/specs/2026-07-24-sim-web-ranking-design.md`](docs/superpowers/specs/2026-07-24-sim-web-ranking-design.md)
- [`docs/superpowers/specs/2026-07-24-sim-web-ranking-recon-notes.md`](docs/superpowers/specs/2026-07-24-sim-web-ranking-recon-notes.md)
- [`docs/superpowers/plans/2026-07-24-sim-web-ranking.md`](docs/superpowers/plans/2026-07-24-sim-web-ranking.md)

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
opencli plugin install file://$(pwd)/packages/aitdk

opencli google-trends now --limit 5 -f json
opencli google-trends explore "pdf to jpg" "jpg to pdf" --geo US -f json
opencli sim backlinks stripe.com --limit 5 -f json
opencli queryDomain search "ai image" -f json
OPENCLI_BROWSER_COMMAND_TIMEOUT=180 opencli ahrefs kd "keyword research" -f json
OPENCLI_BROWSER_COMMAND_TIMEOUT=180 opencli ahrefs backlinks ahrefs.com -f json
opencli aitdk get-data ahrefs.com -f json
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
│   │   ├── src/now.ts
│   │   ├── src/explore.ts
│   │   ├── src/explore-lib.ts
│   │   ├── now.js
│   │   └── explore.js
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
│   ├── aitdk/
│   │   ├── opencli-plugin.json
│   │   ├── package.json
│   │   ├── src/lib.ts
│   │   ├── src/get-data.ts
│   │   └── get-data.js          # build 产物
├── scripts/
├── .claude/skills/
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
| `google-trends now` 无数据 | 换 `geo` / `hours` / `status`，或稍后重试 |
| `google-trends explore` 429 | Explore widgetdata 限流；稍后重试或减少关键词 |
| `EMPTY_RESULT`（aitdk，未知域名） | 域名未注册 / 无流量数据；换有效域名 |
| `RATE_LIMITED` 429（aitdk） | wapi.aitdk.com 频率限制；稍后重试 |
| 403 签名被拒（aitdk） | 扩展轮换了内置密钥；运行 `npm run extract:aitdk-secret` 重新提取 `secretKey`，更新 `packages/aitdk/src/lib.ts` 后 `npm run build:aitdk && opencli plugin update aitdk` |

---

## Agent Skills

### `subdomain-keywords`

路径：[`.claude/skills/subdomain-keywords/SKILL.md`](.claude/skills/subdomain-keywords/SKILL.md)

从托管子域名平台批量发现「新点击」英文关键词，并生成 Google Trends 对比链接。依赖已安装的 **sim** 插件。

```bash
OPENCLI_BROWSER_COMMAND_TIMEOUT=180 npm run subdomain-keywords
OPENCLI_BROWSER_COMMAND_TIMEOUT=180 npm run subdomain-keywords -- --json
```

### `trendsnow-keywords`

路径：[`.claude/skills/trendsnow-keywords/SKILL.md`](.claude/skills/trendsnow-keywords/SKILL.md)

通过 `opencli google-trends now` 拉取近期热搜，逐词判断哪些适合做成**工具站 / 游戏站**等网站，并给出中文翻译。**不要强行把关键词解读成符合预期的需求**；无可做的词就如实说明。依赖已安装的 **google-trends** 子插件。

触发示例：`/trendsnow-keywords`，或「用 google-trends now / Trending Now 看看有没有能做工具站的热词」。

默认拉取：

```bash
opencli google-trends now --geo US --status active --hours 24 --limit 50 -f json
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

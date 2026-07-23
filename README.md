# sim-open-cli

基于 [opencli](https://github.com/jackwener/OpenCLI) 的 SimilarWeb 插件，通过已登录的 Chrome 会话操作 `sim.3ue.com`，把常用分析能力变成统一 CLI。

当前已实现：

| 命令 | 说明 |
|------|------|
| `sim backlinks` | 查看网站反向链接 |
| `sim landing-pages` | 查看网站自然着陆页 |

仓库：https://github.com/CoderLim/sim-open-cli

---

## 前置条件

1. **Node.js** >= 20  
2. **opencli** >= 1.8.6  

```bash
npm install -g @jackwener/opencli
opencli doctor   # 需显示 Everything looks good
```

3. Chrome 已安装 [OpenCLI 扩展](https://chromewebstore.google.com/detail/opencli/ildkmabpimmkaediidaifkhjpohdnifk)  
4. 浏览器中已登录 **https://sim.3ue.com**（需有可用权限的账号）

---

## 安装

### 从 GitHub 安装（推荐）

```bash
git clone https://github.com/CoderLim/sim-open-cli.git
cd sim-open-cli
npm install
npm run build    # 生成根目录 backlinks.js / landing-pages.js
opencli plugin install file://$(pwd)
```

或安装后在插件目录内 build（`opencli plugin install github:CoderLim/sim-open-cli` 后进入 `~/.opencli/plugins/sim` 执行 `npm install && npm run build`）。

### 从本地目录安装（开发）

```bash
git clone https://github.com/CoderLim/sim-open-cli.git
cd sim-open-cli
npm install && npm run build
opencli plugin install file://$(pwd)
```

安装后确认：

```bash
opencli plugin list
opencli list | grep sim
opencli sim --help
```

更新插件：

```bash
opencli plugin update sim
```

卸载：

```bash
opencli plugin uninstall sim
```

---

## 命令

### `sim backlinks`

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
# 表格输出（默认）
opencli sim backlinks stripe.com

# JSON（给脚本 / Agent 用）
opencli sim backlinks stripe.com --limit 20 -f json

# 也接受带协议的 URL
opencli sim backlinks https://www.stripe.com/pricing --limit 10 -f yaml
```

#### 参数

| 参数 | 类型 | 必填 | 默认 | 说明 |
|------|------|------|------|------|
| `domain` | string | 是 | — | 域名或 URL，会规范化为 host |
| `--limit` | int | 否 | `50` | 返回条数，范围 `1–100` |

通用 opencli 选项（节选）：

| 选项 | 说明 |
|------|------|
| `-f, --format` | `table` / `json` / `yaml` / `csv` / `md` / `plain` |
| `--window` | `foreground` / `background` |
| `-v, --verbose` | 调试日志 |
| `--trace` | `off` / `on` / `retain-on-failure` |

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

#### 示例输出

```bash
opencli sim backlinks stripe.com --limit 2 -f json
```

```json
[
  {
    "rank": 1,
    "sourceTitle": "YouTube",
    "sourceUrl": "https://www.youtube.com/...",
    "anchor": "Website aufrufen",
    "impact": 12,
    "domainScore": 100,
    "targetUrl": "https://buy.stripe.com/...",
    "firstSeen": "Jun 02, 26",
    "lastSeen": "Jun 02, 26"
  }
]
```

#### 错误码（opencli typed errors）

| 场景 | 表现 |
|------|------|
| 域名非法 / limit 越界 | `ARGUMENT`（exit 2） |
| 未登录 sim.3ue.com | `AUTH_REQUIRED`（exit 77） |
| 无反向链接数据 | `EMPTY_RESULT`（exit 66） |
| 页面加载失败 | `COMMAND_EXEC`（exit 1） |
| 等待超时 | `TIMEOUT`（exit 75） |

页面较慢时可提高超时：

```bash
OPENCLI_BROWSER_COMMAND_TIMEOUT=180 opencli sim backlinks stripe.com --limit 10 -f json
```

---

### `sim landing-pages`

查看指定网站的**自然着陆页**（Organic Landing Pages），可看到内页路径与子域名流量分布。**默认筛选「新点击量」**（`Change=New`），便于发现新词 / 新页。

**固定默认筛选：**

| 项 | 值 |
|----|-----|
| duration | `28d` |
| tab | `Organic`（自然落地页） |
| webSource | `Total` |
| change | `New`（新点击量） |
| includeSubDomains | 页面默认开启 |

对应页面（默认带新点击量）：

```
https://sim.3ue.com/#/organicsearch/pageAnalysis/landing-pages-v2/*/999/28d?key={domain}&pageFilter=[{"url":"{domain}","searchType":"domain"}]&webSource=Total&Change=New&selectedPageTab=Organic
```

#### 用法

```bash
# 默认即「新点击量」
opencli sim landing-pages vercel.app
opencli sim landing-pages vercel.app --limit 20 -f json

# 查看全部自然着陆页（关闭新点击筛选）
opencli sim landing-pages pollo.ai --change all --limit 20 -f json
```

#### 参数

| 参数 | 类型 | 必填 | 默认 | 说明 |
|------|------|------|------|------|
| `domain` | string | 是 | — | 域名或 URL（会规范化为 host，去掉 `www.`） |
| `--limit` | int | 否 | `50` | 返回条数，范围 `1–100` |
| `--change` | string | 否 | `new` | 点击量变化筛选，见下表 |

#### `--change`（点击量变化）

对应页面筛选项「点击量变化」。

| CLI 值 | 页面选项 | URL 参数 | 说明 |
|--------|----------|----------|------|
| `new`（默认） | 新点击量 | `Change=New` | 仅新出现点击量的着陆页 |
| `all` | 全部 | 无 `Change` | 不筛选 |

```bash
opencli sim landing-pages vercel.app -f json
opencli sim landing-pages vercel.app --change all -f json
```

默认（或 `--change new`）时 `change` 列通常显示为 `新`；`--change all` 时多为百分比（如 `-16%`）。

#### 输出列

| 列 | 含义 |
|----|------|
| `rank` | 列表序号 |
| `url` | 着陆页 URL / 路径（含子域名，如 `studyreps.vercel.app`） |
| `clicks` | 点击量（如 `68.2K`） |
| `clicksShare` | 点击量占比（如 `9.85%`） |
| `change` | 变动：`新`（新点击量）或百分比（如 `-16%`） |
| `keywords` | 关键词数量 |
| `topKeyword` | 热搜关键词 |
| `serpFeatures` | SERP Features |

#### 示例输出

默认新点击量：

```bash
opencli sim landing-pages vercel.app --limit 2 -f json
```

```json
[
  {
    "rank": 1,
    "url": "studyreps.vercel.app",
    "clicks": "26.9K",
    "clicksShare": "…",
    "change": "新",
    "keywords": 12,
    "topKeyword": "…",
    "serpFeatures": "-"
  }
]
```

全部着陆页：

```bash
opencli sim landing-pages pollo.ai --change all --limit 2 -f json
```

```json
[
  {
    "rank": 1,
    "url": "pollo.ai",
    "clicks": "68.2K",
    "clicksShare": "9.85%",
    "change": "-16%",
    "keywords": 380,
    "topKeyword": "pollo ai",
    "serpFeatures": "-"
  }
]
```

---

## 实现说明

- **策略**：`Strategy.UI`（页面表格刮取）  
- **原因**：`sim.3ue.com` 为 GMITM 镜像；站内 JSON 在页面上下文中难以稳定复放  
- **导航**：使用 `page.newTab(url)` 打开深链（同域仅改 hash 不会正确 remount SPA）  
- **源码**：`src/backlinks.ts` / `src/landing-pages.ts`（共享 `src/lib/utils.ts`）  
- **产物**：根目录 `backlinks.js` / `landing-pages.js`（`npm run build` 生成，**不入库**；opencli 只加载插件根目录下的命令文件）

更细的设计与计划见：

- [`docs/superpowers/specs/2026-07-23-sim-backlinks-design.md`](docs/superpowers/specs/2026-07-23-sim-backlinks-design.md)
- [`docs/superpowers/plans/2026-07-23-sim-backlinks.md`](docs/superpowers/plans/2026-07-23-sim-backlinks.md)

---

## 开发

```bash
git clone https://github.com/CoderLim/sim-open-cli.git
cd sim-open-cli
npm install
npm run build          # src/*.ts → 根目录 *.js
opencli plugin install file://$(pwd)
opencli sim backlinks stripe.com --limit 5 -f json
opencli sim landing-pages pollo.ai --limit 5 -f json
```

目录结构：

```
sim-open-cli/
├── opencli-plugin.json
├── package.json
├── backlinks.js              # npm run build 生成（gitignore）
├── landing-pages.js          # 同上
├── src/
│   ├── backlinks.ts
│   ├── landing-pages.ts
│   └── lib/utils.ts
├── scripts/
│   ├── subdomain-keywords.mjs
│   └── google-trends-url.mjs
├── .cursor/skills/
│   └── subdomain-keywords/SKILL.md
├── README.md
└── docs/
```

修改 `src/` 下 TypeScript 后务必重新 `npm run build`，再跑命令验证。

---

## 故障排查

| 现象 | 处理 |
|------|------|
| `opencli doctor` 失败 | 按提示检查 daemon / Chrome 扩展连接 |
| `AUTH_REQUIRED` | 在 Chrome 打开 sim.3ue.com 并登录后重试 |
| `TIMEOUT` | 加大 `OPENCLI_BROWSER_COMMAND_TIMEOUT`；或加 `--trace retain-on-failure` 看截图 |
| 命令未注册 | `opencli plugin list` / 重新 `plugin install` |
| 改了 TS 无效果 | 确认已 `npm run build` 生成对应 `.js` |
| 页面显示「额，出错了」 | 账号权限或站点瞬时故障；浏览器里手动刷新确认 |

---

## 路线图

计划按 SimilarWeb 常用功能继续扩展：

- [x] 反向链接 `backlinks`
- [x] 着陆页 `landing-pages`
- [ ] 类似网站 competitive landscape
- [ ] 出站流量 / 导流网站
- [ ] 关键词概况与网站关键词

---

## Agent Skills

Cursor Agent Skills 位于 [`.cursor/skills/`](.cursor/skills/)。在对话里用 `/skill-name` 或自然语言触发后，Agent 会按 `SKILL.md` 执行。

### `subdomain-keywords`

路径：[`/.cursor/skills/subdomain-keywords/SKILL.md`](.cursor/skills/subdomain-keywords/SKILL.md)

从托管子域名平台批量发现「新点击」相关英文关键词，并生成 Google Trends 对比链接。

| 项 | 说明 |
|----|------|
| 数据源 | `opencli sim landing-pages`（默认 `Change=New`） |
| 域名 | `vercel.app`、`pages.dev`、`github.io`、`netlify.app`、`web.app`、`firebaseapp.com`、`lovable.app`、`onrender.com` |
| 每域条数 | 前 10 条 |
| 字段 | `keyword`、`clicks`、`url` |
| 过滤 | 关键词去重；点击量 ≥ **2K**；仅英文关键词 |
| Trends | 最终关键词按点击量降序，**每 5 个一组**生成一条 Trends URL |

触发示例：`/subdomain-keywords`，或「拉一下子域名新词」。

推荐直接跑配套脚本（与 skill 规则一致）：

```bash
OPENCLI_BROWSER_COMMAND_TIMEOUT=180 npm run subdomain-keywords
OPENCLI_BROWSER_COMMAND_TIMEOUT=180 npm run subdomain-keywords -- --json
```

---

## Scripts

仓库脚本在 [`scripts/`](scripts/)。

### `scripts/subdomain-keywords.mjs`

实现 `subdomain-keywords` skill 的可执行流水线：拉取 → 过滤 → 输出关键词表 + Trends URL。

```bash
OPENCLI_BROWSER_COMMAND_TIMEOUT=180 node scripts/subdomain-keywords.mjs
OPENCLI_BROWSER_COMMAND_TIMEOUT=180 node scripts/subdomain-keywords.mjs --json
# 等同：
OPENCLI_BROWSER_COMMAND_TIMEOUT=180 npm run subdomain-keywords
```

- stdout：markdown 或 JSON（`--json`）  
- stderr：各域名拉取进度；失败写入结果里的 `failures`  
- 前置：已安装 `sim` 插件，且 Chrome 已登录 sim.3ue.com  

### `scripts/google-trends-url.mjs`

由关键词数组生成 Google Trends explore URL。**要求 5 个词**：多于 5 个截断并 `warning`；少于 5 个也会 `warning`，但仍生成 URL。

```bash
node scripts/google-trends-url.mjs Calculator Converter Translator Generator Example
# → https://trends.google.com/trends/explore?q=Calculator,Converter,Translator,Generator,Example

node scripts/google-trends-url.mjs --json '["a","b","c","d","e","f"]'
# warning: got 6 keywords, truncating to 5

echo '["a","b","c","d","e"]' | node scripts/google-trends-url.mjs --stdin
```

可被其它脚本 `import { buildGoogleTrendsUrl } from './google-trends-url.mjs'` 复用。`subdomain-keywords` 按相同 URL 规则自行分组拼链（每组最多 5 词）。

---

## License

MIT

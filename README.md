# sim-open-cli

基于 [opencli](https://github.com/jackwener/OpenCLI) 的 SimilarWeb 插件，通过已登录的 Chrome 会话操作 `sim.3ue.com`，把常用分析能力变成统一 CLI。

当前已实现：

| 命令 | 说明 |
|------|------|
| `sim backlinks` | 查看网站反向链接 |

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
opencli plugin install github:CoderLim/sim-open-cli
```

### 从本地目录安装（开发）

```bash
git clone https://github.com/CoderLim/sim-open-cli.git
cd sim-open-cli
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

## 实现说明

- **策略**：`Strategy.UI`（页面表格刮取）  
- **原因**：`sim.3ue.com` 为 GMITM 镜像；站内 JSON（`/api/backlinks/backlinks`）在页面上下文中难以稳定复放  
- **导航**：使用 `page.newTab(url)` 打开深链（同域仅改 hash 不会正确 remount SPA）  
- **源码**：`backlinks.ts`；运行时加载预编译的 `backlinks.js`

更细的设计与计划见：

- [`docs/superpowers/specs/2026-07-23-sim-backlinks-design.md`](docs/superpowers/specs/2026-07-23-sim-backlinks-design.md)
- [`docs/superpowers/plans/2026-07-23-sim-backlinks.md`](docs/superpowers/plans/2026-07-23-sim-backlinks.md)

---

## 开发

```bash
git clone https://github.com/CoderLim/sim-open-cli.git
cd sim-open-cli
npm install
npm run build          # backlinks.ts → backlinks.js
opencli plugin install file://$(pwd)
opencli sim backlinks stripe.com --limit 5 -f json
```

目录结构：

```
sim-open-cli/
├── opencli-plugin.json   # 插件清单（site: sim）
├── package.json
├── backlinks.ts          # 命令源码
├── backlinks.js          # 预编译产物（安装时使用）
├── README.md
└── docs/
```

修改 TypeScript 后务必重新 build，再跑命令验证。

---

## 故障排查

| 现象 | 处理 |
|------|------|
| `opencli doctor` 失败 | 按提示检查 daemon / Chrome 扩展连接 |
| `AUTH_REQUIRED` | 在 Chrome 打开 sim.3ue.com 并登录后重试 |
| `TIMEOUT` | 加大 `OPENCLI_BROWSER_COMMAND_TIMEOUT`；或加 `--trace retain-on-failure` 看截图 |
| 命令未注册 | `opencli plugin list` / 重新 `plugin install` |
| 改了 TS 无效果 | 确认已 `npm run build` 生成新的 `backlinks.js` |
| 页面显示「额，出错了」 | 账号权限或站点瞬时故障；浏览器里手动刷新确认 |

---

## 路线图

计划按 [SimilarWeb 常用功能](https://sim.3ue.com) 继续扩展，例如：

- [x] 反向链接 `backlinks`
- [ ] 类似网站 competitive landscape
- [ ] 出站流量 / 导流网站
- [ ] 关键词概况与网站关键词
- [ ] 着陆页 / 子域名

---

## License

MIT

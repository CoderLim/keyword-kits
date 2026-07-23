---
name: trendsnow-keywords
description: >-
  通过 opencli google trendsNow 拉取近期热搜词，逐词判断哪些适合做成工具站或游戏站等网站，
  并给出中文翻译。不要强行把关键词解读成符合预期的需求。
  在用户提到 trendsNow 热词、热搜建站机会、工具站/游戏站选题、trending keywords 建站时使用。
---

# trendsnow-keywords

从 Google Trends Trending Now 拉近期热词，**逐词分析**后只返回适合做成网站的词，并附中文翻译。

核心原则（必须遵守）：

> 不要强行把关键词解读成符合预期的需求，将可做成网站的词返回给我，并提供中文翻译

## 前置

1. `opencli doctor` 通过（本命令为 PUBLIC，一般不需要 Chrome）
2. 已安装 **google-trends** 子插件：  
   `opencli plugin install file://$(pwd)/packages/google-trends`  
   或 `github:CoderLim/keyword-kits/google-trends`
3. 确认命令可用：`opencli google trendsNow --help`

## 拉取热词

默认：

```bash
opencli google trendsNow --geo US --status active --hours 24 --limit 50 -f json
```

用户若指定 `geo` / `hours` / `status` / `limit`，按其参数执行。`hours` 仅允许 `4|24|48|168`。

从每条结果取：

| 源字段 | 用途 |
|--------|------|
| `title` | 主关键词（分析对象） |
| `volume` | 参考热度 |
| `increase` | 参考涨幅 |
| `breakdown` | 相关变体，辅助理解意图；**不要**把 breakdown 里每个词都当成独立建站选题，除非它本身也明显可做成站 |
| `status` | 仅作上下文 |

去重：按 `title` 大小写不敏感去重。

## 逐词分析规则

对每个 `title` 单独判断，问：**这个搜索意图是否自然对应一个可独立上线的网站（尤其是工具站或游戏站）？**

### 可保留（示例方向，非强制标签）

- **工具站**：转换器、生成器、计算器、下载器、检测器、对比器、格式化、压缩、OCR、翻译、占位图、色板、正则测试等——用户带着「要完成一件事」来搜。
- **游戏站**：可玩的小游戏、在线对战/解谜、经典玩法的网页版——用户搜的是「玩」而不是「看新闻」。
- 其他可做成站的产品形态（目录站、查询站、生成式内容站等）也可以，但必须意图清晰。

### 必须丢弃

- 纯新闻/名人/突发时事（谁去世了、某政要、某比赛比分八卦）——更适合媒体，不是工具/游戏产品。
- 一次性事件词、股票代码跟风、球队对阵比分（除非明确是可做成长期工具/查询产品的稳定需求）。
- 只为「蹭热度」而硬编的站点想法（例如把某明星名字强行做成「XX 粉丝生成器」）。
- 意图模糊、无法说明用户打开网站要完成什么的词。

### 禁止强行解读

- 没有把握就 **跳过**，不要凑数。
- 不要因为「理论上能做一个站」就保留；要「用户搜这个词时，很可能会打开并使用这个站」。
- 输出数量可以很少；宁缺毋滥。

## 输出格式

只输出「可做成网站」的词。默认 markdown：

```markdown
## Site-worthy keywords

| keyword | 中文 | 类型 | 理由 | volume |
|---------|------|------|------|--------|
| pdf to jpg | PDF 转 JPG | 工具站 | 明确的格式转换需求 | 50000 |

## Skipped（可选，简短）

- 若干丢弃词及一句原因（可合并同类；勿长篇）
```

`类型` 用短标签：`工具站` / `游戏站` / `查询站` / `其他` 等。  
`中文`：简洁意译，专有名词可保留原文并括注。

若用户要 JSON：

```json
{
  "keywords": [
    {
      "keyword": "pdf to jpg",
      "zh": "PDF 转 JPG",
      "type": "工具站",
      "reason": "明确的格式转换需求",
      "volume": 50000
    }
  ],
  "skipped": [
    { "keyword": "some celebrity", "reason": "时事/名人，非产品意图" }
  ],
  "source": {
    "geo": "US",
    "hours": 24,
    "status": "active",
    "fetched": 50
  }
}
```

若无一可保留：明确说明「本批热词无可做成工具/游戏站的词」，并可用 Skipped 概括原因；不要硬编条目。

## 注意

- 命令是 `opencli google trendsNow`（不是 trendsNew / trends）。
- 不支持翻页；要更多候选就加大 `--limit`（≤500）。
- 分析在 Agent 侧完成，无需另写脚本；拉取失败时展示 opencli 错误，不要假装有结果。

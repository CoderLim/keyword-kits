---
name: get-keywords-search-volumn-by-ads
description: >-
  通过 Google Ads Keyword Planner API 查询关键词搜索量、竞争度、CPC 与逐月趋势，
  支持 worldwide 默认、指定国家、最近一月日均估算，并解读 close_variants 合并口径。
  在用户要查关键词搜索量、Google Ads 搜索量、Keyword Planner 数据、
  月均/日均搜索量、worldwide 或按国家搜索量时使用。
---

# get-keywords-search-volumn-by-ads

用 `packages/google-ads/keyword_volume.py` 拉 Keyword Planner 历史指标。

## 前置

1. `packages/google-ads/google-ads.yaml` 已配置（见该包 README 授权流程）
2. `packages/google-ads/.venv` 已安装依赖
3. 当前开发者令牌为 **Test Account Access**，查询时用测试账号 `1265134925`

缺配置时先提示用户跑 `generate_refresh_token.py`，不要编造搜索量。

## 跑查询（推荐脚本）

解析本 `SKILL.md` 所在目录为 `<skill-directory>`：

```bash
"<skill-directory>/scripts/query-keywords.py" \
  --login-customer-id 1265134925 \
  --customer-id 1265134925 \
  "keyword one" "keyword two"
```

常用选项：

| 需求 | 参数 |
|------|------|
| 全球（默认） | 不传 `--geo-target-id` |
| 美国 | `--geo-target-id 2840` |
| 中国 | `--geo-target-id 2156` |
| 多国（最多 10） | 重复 `--geo-target-id` |
| 英语 | `--language-id 1000` |
| 简体中文 | `--language-id 1017` |
| 最近完整月日均 | `--daily` |
| JSON 输出 | `--json` |
| 写 CSV | `--csv /path/to/out.csv` |

示例：

```bash
# worldwide + 英语 + 日均
"<skill-directory>/scripts/query-keywords.py" \
  --language-id 1000 --daily \
  "gpts" "image to text converter"

# 美国
"<skill-directory>/scripts/query-keywords.py" \
  --geo-target-id 2840 --language-id 1000 \
  "gpts"
```

脚本会自动 `cd` 到 `packages/google-ads` 并使用其 `.venv`。

## 语言与地域默认值

用户未指定时：

- **英文关键词** → `--language-id 1000`
- **中文关键词** → `--language-id 1017`
- **地域** → 不传 geo（**worldwide**），除非用户明确要求某国

## 输出格式

### 默认（markdown 表）

按 `average_monthly_searches` 降序；加 `--daily` 时多一列「最近完整月日均」。

### JSON（`--json`）

完整字段含 `monthly_search_volumes`（逐月数组）。

用户要「最近一个月日均」时，**必须**加 `--daily`，并在回复中说明：

> 日均 = 最近完整自然月搜索量 ÷ 当月天数（Google Ads 仅提供按月数据）

## 解读规则（必须告知用户）

Keyword Planner 会做 **near-exact 合并**，不等于 Google Trends 字面词口径：

1. **批量查询时看 `close_variants`**：被合并进主词的变体列表；单独查一个词时 API 可能不返回 variants，但合并仍可能发生。
2. **典型陷阱 `gpts`**：与 **`gpt` 同一词簇**，Planner 的 `gpts` 月搜可达千万级，**不能**当作字面「gpts」或直接与 Trends「gpts」比绝对量。更具体意图可查 `chatgpt gpts`。
3. **`image to text converter`**：仅合并极近改写（如 `convert image to text`），**不会**吞 `image to text`、`ocr`、`generator` 等独立词簇——与 Trends 可比性远高于 `gpts`。
4. **与 Google Trends 对比**：Trends 是相对指数；Planner 是绝对量且带合并。比**比值**时 converter 类词较可信；`gpts` 类词需警惕 gpt 污染。

用户问「是不是真实搜索量」时，按上面 2–3 点解释，不要只说「是」或「不是」。

## 相关词排查

用户质疑某词被放大/缩小时，**同一批**再查近义与上下位词，对比 `close_variants` 与量级，例如：

```bash
"<skill-directory>/scripts/query-keywords.py" --language-id 1000 --json \
  "gpts" "gpt" "chatgpt gpts" \
  "image to text converter" "image to text" "image to text generator" "ocr"
```

## 手工等价（无脚本时）

```bash
cd packages/google-ads && source .venv/bin/activate

python keyword_volume.py \
  --login-customer-id 1265134925 \
  --customer-id 1265134925 \
  --language-id 1000 \
  --json \
  "keyword one" "keyword two"
```

技术细节见 [packages/google-ads/docs/TECH.md](../../../packages/google-ads/docs/TECH.md)。

## 注意

- 不要提交或打印 `google-ads.yaml`、token、OAuth 文件内容。
- API 失败（`DEVELOPER_TOKEN_NOT_APPROVED`、`Config file not found` 等）原样报错，勿编造数据。
- 搜索量为区间/取整桶，勿过度精确（如「2,680,645.16/天」可写「约 268 万/天」）。

---
name: get-keyword-ideas-by-ads
description: >-
  通过 Google Ads Keyword Planner GenerateKeywordIdeas 从 seed 词、URL 或站点
  生成衍生关键词，并附带搜索量、竞争度与 CPC。默认 worldwide。
  在用户要做关键词规划、拓词、相关词、衍生关键词、keyword ideas、
  Keyword Planner Discover new keywords 时使用。
---

# get-keyword-ideas-by-ads

用 `packages/google-ads/keyword_ideas.py` 从 seed 拉 Keyword Planner 衍生词。

查**已知词的搜索量**（不拓词）用 [get-keywords-search-volumn-by-ads](../get-keywords-search-volumn-by-ads/SKILL.md)。

## 前置

1. `packages/google-ads/google-ads.yaml` 已配置
2. `packages/google-ads/.venv` 已安装依赖
3. Test Account Access 用测试账号 `1265134925`

缺配置时提示跑 `generate_refresh_token.py`，不要编造关键词。

## 跑查询

解析本 `SKILL.md` 所在目录为 `<skill-directory>`：

```bash
"<skill-directory>/scripts/query-ideas.py" \
  --language-id 1000 \
  --limit 50 \
  "image to text converter"
```

| 需求 | 参数 |
|------|------|
| 全球（默认） | 不传 `--geo-target-id` |
| 美国 | `--geo-target-id 2840` |
| 中国 | `--geo-target-id 2156` |
| 英语 | `--language-id 1000` |
| 简体中文 | `--language-id 1017` |
| 条数 | `--limit N`（默认 50，最大 1000） |
| 页面 URL seed | `--url https://example.com/page` |
| 整站 seed | `--site www.example.com`（不可与关键词/`--url` 混用） |
| JSON | `--json` |
| CSV | `--csv /path/to/out.csv` |

`--url` 可与 seed 关键词同时使用。用户未指定语言时：英文词用 `1000`，中文词用 `1017`。地域默认 worldwide。

## 输出

默认 markdown 表，按 `average_monthly_searches` 降序。有 `close_variants` 时附在表下。

回复用户时：

1. 说明这是 **Keyword Planner 相关词**，不是字面 exact 列表。
2. 条数写清 `--limit`（可能少于 limit，若 API 返回更少）。
3. 搜索量口径与 `get-keywords-search-volumn-by-ads` 相同（near-exact 合并）。不要把结果当 Google Trends 字面词。

## 手工等价

```bash
cd packages/google-ads && source .venv/bin/activate

python keyword_ideas.py \
  --login-customer-id 1265134925 \
  --customer-id 1265134925 \
  --language-id 1000 \
  --limit 50 \
  --json \
  "image to text converter"
```

技术细节见 [packages/google-ads/docs/TECH.md](../../../packages/google-ads/docs/TECH.md)。

## 注意

- 不要提交或打印 `google-ads.yaml`、token。
- API 失败原样报错，勿编造衍生词或搜索量。
- 结果可能包含 seed 本身或极近改写；不要假装「全是新词」。

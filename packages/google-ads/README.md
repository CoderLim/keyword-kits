# Google Ads 关键词工具

通过 Google Ads API 获取关键词历史搜索指标，以及从 seed 词/URL/站点生成衍生关键词。输出终端表格与 CSV。

完整技术方案见 **[docs/TECH.md](docs/TECH.md)**（架构、API 字段、账号、认证、排错）。

## 快速开始

```bash
cd ~/Projects/keyword-kits/packages/google-ads
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

### 首次授权

```bash
chmod 600 /path/to/client_secret_*.json

export GOOGLE_ADS_DEVELOPER_TOKEN="<从 Google Ads API Center 读取>"

python generate_refresh_token.py \
  --client-secrets /path/to/client_secret_*.json \
  --output google-ads.yaml
```

浏览器授权请使用已加入 OAuth 测试用户的 Gmail。

### 查询关键词

当前开发者令牌为 **Test Account Access**，需使用测试经理账号 `1265134925`：

```bash
source .venv/bin/activate

python keyword_volume.py \
  --login-customer-id 1265134925 \
  --customer-id 1265134925 \
  "独立站" \
  --csv output.csv
```

美国 + 英语示例：

```bash
python keyword_volume.py \
  --login-customer-id 1265134925 \
  --customer-id 1265134925 \
  --geo-target-id 2840 \
  --language-id 1000 \
  "build a hooper" "gpts" \
  --csv results-us.csv
```

一键示例：`./run_example.sh`

纯 API / 脚本调用（不写 CSV）：

```bash
python keyword_volume.py \
  --login-customer-id 1265134925 \
  --customer-id 1265134925 \
  --geo-target-id 2840 \
  --language-id 1000 \
  --json \
  "gpts"
```

或在 Python 中直接 import：

```python
from pathlib import Path
from keyword_volume import load_google_ads_client, fetch_keyword_metrics

client = load_google_ads_client(Path("google-ads.yaml"), login_customer_id="1265134925")
rows = fetch_keyword_metrics(client, "1265134925", ["gpts"], "1000")  # worldwide
rows = fetch_keyword_metrics(client, "1265134925", ["gpts"], "1000", geo_target_ids=["2840"])  # US
# rows[0]["monthly_search_volumes"] 为 list[dict]
```

### 关键词规划（拓词）

输入 seed 词，返回衍生关键词 + 搜索量 / 竞争度 / CPC（`GenerateKeywordIdeas`）：

```bash
python keyword_ideas.py \
  --login-customer-id 1265134925 \
  --customer-id 1265134925 \
  --language-id 1000 \
  --limit 50 \
  --json \
  "image to text converter"
```

URL / 整站 seed：

```bash
python keyword_ideas.py ... --url https://example.com/ocr
python keyword_ideas.py ... --site www.example.com
```

`--url` 可与关键词同时使用（KeywordAndUrlSeed）。`--site` 不能与关键词或 `--url` 混用。`--geo-target-id` 不传 = worldwide。

## CLI 参数

| 参数 | 说明 | 默认 |
|------|------|------|
| `keywords` | 一个或多个关键词 | 必填 |
| `--customer-id` | API 客户 ID | 必填 |
| `--login-customer-id` | 覆盖 MCC 登录 ID | 配置文件 |
| `--config` | `google-ads.yaml` 路径 | `./google-ads.yaml` |
| `--geo-target-id` | 地域 ID（可重复，最多 10 个） | 不传 = **worldwide** |
| `--language-id` | 语言 ID | `1017`（简体中文） |
| `--json` | 输出 JSON 到 stdout（脚本/API 用） | 否 |
| `--csv` | CSV 文件路径 | 无（可选） |

`keyword_ideas.py` 额外参数：

| 参数 | 说明 | 默认 |
|------|------|------|
| `keywords` | seed 关键词 | 与 `--url` / `--site` 至少其一 |
| `--url` | 页面 URL seed | 无 |
| `--site` | 整站域名 seed | 无 |
| `--limit` | 返回条数上限 | `50`（最大 1000） |

## CSV 输出列

`keyword`, `close_variants`, `average_monthly_searches`, `competition`, `competition_index`, `average_cpc`, `low_top_of_page_bid`, `high_top_of_page_bid`, `monthly_search_volumes`（JSON 逐月数据）

## 测试

```bash
python3 -m unittest discover -s tests -v
```

## 项目结构

```
packages/google-ads/
├── docs/TECH.md              # 技术方案（主文档）
├── keyword_volume.py         # 搜索量 CLI / Python API
├── keyword_ideas.py          # 拓词 CLI / Python API
├── generate_refresh_token.py # OAuth 授权
├── run_example.sh            # 示例脚本
├── tests/
├── google-ads.yaml.example   # 配置模板
└── requirements.txt
```

位于 monorepo：`~/Projects/keyword-kits`

## 注意事项

- 敏感文件（`.env`、`google-ads.yaml`、OAuth JSON、CSV 输出）已在 `.gitignore` 中排除。
- 生产 MCC `2748189611` 需 **Basic Access** 后才能直接查询；当前请用测试账号 `1265134925`。

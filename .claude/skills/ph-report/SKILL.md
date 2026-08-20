---
name: ph-report
description: >-
  从 Product Hunt 按 votes 拉取当日/指定日上线产品，解析真实域名后用 opencli aitdk
  查询流量与 WHOIS，筛选 Monthly Visits、域名年龄、搜索流量占比，输出域名、一句话描述、
  流量、Top Keywords。在用户提到 PH 日报、Product Hunt 产品筛选、ph-report、
  昨天上线产品 + 流量/域名年龄过滤时使用。
---

# ph-report

Product Hunt 上线产品 → 真实域名 → AITDK → 过滤报告。

## 默认规则

| 项 | 默认 |
|----|------|
| 排序 / 数量 | 按 `votesCount` 取 **Top 100** |
| 日期 | **昨天**（可用 `--date` 指定） |
| 流量 | Monthly Visits **> 1000** |
| 域名年龄 | 注册日在 **一年内** |
| 搜索流量 | `searchOrganic + searchPaid` **≥ 20%** |
| 输出字段 | 域名、一句话描述（PH tagline）、流量、Top Keywords |

默认跳过 App Store / GitHub / Google / Vercel 等平台域名（`--include-platforms` 可关闭）。

## 前置

```bash
export PRODUCTHUNT_ACCESS_TOKEN="..."   # https://www.producthunt.com/v2/oauth/applications
pip install -r requirements.txt         # curl_cffi：解析 PH /r/ 短链（勿用普通 curl，会被 CF 拦）
# opencli + aitdk 插件可用：
opencli aitdk get-data example.com -f json
```

## 执行

在本 skill 目录下：

```bash
cd <skill_dir>
python3 scripts/ph_report.py
python3 scripts/ph_report.py --date 2026-08-19 --limit 100
python3 scripts/ph_report.py --limit 20 --json
python3 scripts/ph_report.py --min-visits 1000 --min-search 0.2 --keep-raw /tmp/ph-report-raw.json
```

整批约数分钟（每域名一次 aitdk，默认间隔 2.5s；遇 429 会睡 30s 重试节奏）。

## 流程（脚本已封装）

1. **PH GraphQL** `posts(postedAfter/postedBefore)` → 按 votes 截断 Top N  
2. **`website` / `productLinks(Website)`** 为 `producthunt.com/r/...` 短链 → **`curl_cffi` impersonate** 读 301 `Location`（不打开浏览器）  
3. **`opencli aitdk get-data <domain> -f json`** → `visits`、`registered`、`trafficSources`、`topKeywords`  
4. 过滤后输出

## 输出

### Markdown（默认）

表头：域名 | 一句话描述 | 流量 | Top Keywords

### JSON（`--json`）

```json
{
  "date": "2026-08-19",
  "matched": [
    {
      "domain": "cluing.io",
      "description": "Collaborative agents who…",
      "visits": 30990,
      "top_keywords": ["cluing", "..."]
    }
  ],
  "count": 1,
  "filters": { "min_visits": 1000, "min_search": 0.2, "max_age_days": 365 }
}
```

## 注意

- PH API **不**返回最终站 URL，只有短链；必须经 `curl_cffi` 解析（见 `scripts/resolve_website.py`）。  
- aitdk 易 429：加大 `--aitdk-delay`，勿与浏览器插件同时狂刷。  
- 进度日志在 stderr；结果在 stdout。

# keyword-generator recon notes

**Date:** 2026-07-23
**Sample keyword:** dice

## Query params (confirmed)

| Filter | Query key | Example | Notes |
|--------|-----------|---------|-------|
| volume min | volumeFromValue | 1000 | confirmed from sample URL; chip shows `体量 > 1K` |
| cpc min | cpcFromValue | 1 | set via CPC chipdown (自/至 range) → URL updates; chip `CPC > $1` |
| difficulty max | difficultyToValue | 50 | deep-link works; KD column all ≤ 50; chip `关键词难度为 NaN-50` when from omitted (optional companion `difficultyFromValue`) |
| engine | searchEngine | google | |
| match tab | tab | phraseMatch | locked |

## Table

- Root selector: `section.keyword-analysis-search .swReactTable-wrapper`
- Ready signal: at least 5 keyword cells visible, selector `.search-keyword` (alt: `.swTable-keywordCell` / `[data-automation-column-key="keyword"]`)
- Column map (header text → field): 关键词 → keyword; 28 天的体量 → volume (`data-automation-column-key=windowVolume`); CPC → cpc (`cpc`); KD → difficulty (`Difficulty`); optional extras: 平均体量 → averageVolume; 年趋势 → volumeTrend; 零点击搜索 → latestZeroClicks; 意图 → intents; 领先者 → leadingSite

## Pagination

- Next button selector: `[data-automation-pagination-control="control-right"]`
- Disabled / last-page signal: `data-automation-pagination-control-disabled="true"` on that control (also page input equals footer `out of N`)
- Approx rows per page: 100

## Strategy confirmation

- Strategy: UI
- API usable? no (opencli `browser network` captured no usable JSON endpoints during load/filter/page; ship UI first; same GMITM / SPA pattern as landing-pages)

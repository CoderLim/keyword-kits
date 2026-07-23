# keyword-generator recon notes

**Date:** 2026-07-23
**Sample keyword:** dice

**Sample URL (full):**

```
https://sim.3ue.com/#/digitalsuite/acquisition/findkeywords/keyword-generator-tool/999/28d?searchEngine=google&keyword=dice&webSource=Total&isWWW=*&tab=phraseMatch&volumeFromValue=0
```

## Query params (confirmed)

| Filter | Query key | Example | Notes |
|--------|-----------|---------|-------|
| volume min | volumeFromValue | 1000 | confirmed from sample URL; chip shows `体量 > 1K` |
| cpc min | cpcFromValue | 1 | set via CPC chipdown (自/至 range) → URL updates; chip `CPC > $1` |
| difficulty max | difficultyToValue | 50 | deep-link works; KD column all ≤ 50 |
| engine | searchEngine | google | |
| match tab | tab | phraseMatch | locked |

### Task 4 note — `--max-difficulty` only

When only `--max-difficulty N` is set, URL should set **both**:

- `difficultyToValue=N`
- `difficultyFromValue=0`

Evidence:

| Deep-link | Filter works? | Chip text | Notes |
|-----------|---------------|-----------|-------|
| only `difficultyToValue=50` | yes (KD 1–50) | `关键词难度为 NaN-50` | functional but NaN in chip |
| `difficultyFromValue=0&difficultyToValue=50` | yes (KD 1–50) | `关键词难度为 0-50` | preferred |
| `difficultyFromValue=1&difficultyToValue=50` | (slider min is 1) | — | optional; not required for max-only |

Do **not** omit `difficultyFromValue` if you care about clean chip text; for scrape correctness either form filters KD correctly.

## Table

- Root selector: `section.keyword-analysis-search .swReactTable-wrapper`
- Column map (header text → field / `data-automation-column-key`):
  - 关键词 → keyword / `keyword`
  - 28 天的体量 → volume / `windowVolume`
  - CPC → cpc / `cpc`
  - KD → difficulty / `Difficulty` (**capital D** — lowercase `difficulty` does not exist)
  - optional: 平均体量 → `averageVolume`; 年趋势 → `volumeTrend`; 零点击搜索 → `latestZeroClicks`; 意图 → `intents`; 领先者 → `leadingSite`
- Also present without automation key: col0 checkbox (empty), col1 rank (`1`…`N`)

### Sample row (page 1, unfiltered `volumeFromValue=0`, keyword=dice)

| Field | Displayed text |
|-------|----------------|
| keyword | `dice` |
| volume | `699.5K` |
| cpc | `$0.81` |
| KD | `78` |

## EXTRACT algorithm

**Layout: column-major** (same SWReact pattern as `landing-pages.ts`).

Evidence: each `.swReactTable-column` / `.swReactTable-unResizeColumn` under the root holds a vertical stack of `.swReactTableCell` for one field; cells expose `data-table-row`, `data-table-col`, and (for data columns) `data-automation-column-key`.

**Steps:**

1. `table = document.querySelector('section.keyword-analysis-search .swReactTable-wrapper')`
2. Collect body columns:
   ```js
   const columns = [...table.querySelectorAll('.swReactTable-column, .swReactTable-unResizeColumn')]
     .map((col) => [...col.querySelectorAll('.swReactTableCell')])
     .filter((cells) => cells.length >= 5);
   ```
3. Index columns by exact `cells[0].getAttribute('data-automation-column-key')` (preferred over header text / position):
   - `keyword`
   - `windowVolume` (volume)
   - `cpc`
   - `Difficulty` (difficulty — casing must match)
4. `rowCount = Math.min(...neededCols.map(c => c.length))`
5. For each row index `r`:
   - **keyword**: `columns[keyword][r].querySelector('.search-keyword')?.innerText.trim()`  
     (confirmed: keyword text comes from `.search-keyword`; `a.swTable-content` is equivalent; avoid raw `cell.innerText` once link-buttons chrome is present)
   - **volume**: `(columns[windowVolume][r].innerText || '').trim()` → e.g. `699.5K`
   - **cpc**: `(columns[cpc][r].innerText || '').trim()` → e.g. `$0.81`
   - **difficulty**: `(columns[Difficulty][r].innerText || '').trim()` → e.g. `78`

Not row-major: do not iterate `tr` / row wrappers — this table has none.

## PAGE_STATUS

Canonical ready selector (**one primary**): `.search-keyword`

Suggested status JS (mirror landing-pages):

| Status | Rule |
|--------|------|
| `ready` | `document.querySelectorAll('.search-keyword').length >= 5` |
| `auth` | body matches `/请登录\|登录后\|Sign in\|Log in/i` **and** keyword count `=== 0` (also seen: redirect to `dash.3ue.com/.../login`, heading「登录」) |
| `error` | body matches `/额，出错了\|Something went wrong\|请尝试刷新页面/i` **and** keyword count `=== 0` |
| `hydrating` | `0 < .search-keyword.length < 5` |
| `loading` | otherwise (table root may be absent; count `=== 0`, no auth/error) |

Open via `page.newTab` / fresh tab — same-domain hash `goto` can leave SPA on error wall without remounting.

## Pagination

- Next button selector: `[data-automation-pagination-control="control-right"]`
- Disabled / last-page signal: `data-automation-pagination-control-disabled="true"` on that control (also page input equals footer `out of N`)
- Approx rows per page: 100

### Pagination post-click

After clicking next:

1. Table **clears immediately** — `.search-keyword` count drops to `0` (not an auth/error).
2. New page hydrates; within ~1s count returns to ~100 with different first keyword; page input advances (`1` → `2`).
3. **Same wait condition as initial load**: poll until `.search-keyword.length >= 5` (i.e. re-enter `ready` via PAGE_STATUS). Do not treat the post-click zero-count flash as `auth`/`error` unless those body strings are also present.

## Strategy confirmation

- Strategy: UI
- API usable? no (opencli `browser network` captured no usable JSON endpoints during load/filter/page; ship UI first; same GMITM / SPA pattern as landing-pages)

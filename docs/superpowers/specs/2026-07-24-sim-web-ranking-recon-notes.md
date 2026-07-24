# web-ranking recon notes

**Date:** 2026-07-24
**Base URL:** (Organic applied + Change sorted desc — **neither appears in the URL**)

```
https://sim.3ue.com/#/digitalsuite/markets/webmarketanalysis/rankings/All/999/1m?webSource=Total&selectedTab=CategoryLeadersSearch
```

Evidence session: opencli Browser Bridge (logged-in Chrome profile), page title「站点排名」.

## Fixed filters

| Concern | Value | How applied |
|---------|-------|-------------|
| Tab | CategoryLeadersSearch / 搜索 | query `selectedTab=CategoryLeadersSearch`; UI tab `[role=tab]` text `搜索` with class `styled-tab selected` / `aria-selected=true` |
| Organic | 自然 | **`CLICK_REQUIRED`** — not reflected in URL/hash (see Organic ensure) |
| Duration | 1m | path segment after country code (`…/999/1m?…`); UI shows `Jun 2026 - Jun 2026 (1 月)` |
| webSource | Total | query `webSource=Total`; UI filter chip「所有流量」(disabled on this page) |
| Location | 全球 | UI default via country dropdown「全球」; **no country query key** observed. Path segment `999` is the worldwide country id (SW convention). |

## Sort (confirmed)

| CLI `--sort` | Query/path change after clicking column | Example full URL fragment |
|--------------|----------------------------------------|---------------------------|
| change | **`CLICK_HEADER_REQUIRED`** — URL unchanged | same Base URL as above |
| visits | **`CLICK_HEADER_REQUIRED`** — URL unchanged | same Base URL as above |

Default on load (All / Search): sorted by **流量份额** (`Share`) desc — header class includes `is-sorted sortDirection--desc`.

### Header click details

- Header cells: `.swReactTableHeaderCell.is-sortable`
- Match by visible text:
  - change → header whose `innerText` starts with / equals `变动`
  - visits → header whose `innerText` includes `每月访问量`
- After **first** click on an unsorted header: classes become `is-sorted sortDirection--desc` (desc confirmed live for both 变动 and 每月访问量).
- Confirmed after Change desc: top MoMChange values like `> 5,000%` with `.changePercentage.positive`; domains no longer youtube.com.
- Confirmed after Visits desc: top AvgMonthVisits `3.410B`, `2.632B`, … domains youtube.com / wikipedia.org / …

### Sort already-applied detection (`APPLY_SORT` → `'already'`)

Locate the target header (same text match as above). Treat sort as **already desc** when **both** are true:

```js
header.classList.contains('is-sorted') && header.classList.contains('sortDirection--desc')
```

| CLI `--sort` | Header text match | Already-desc check |
|--------------|-------------------|--------------------|
| `change` | `innerText` starts with `变动` | `is-sorted` + `sortDirection--desc` |
| `visits` | `innerText` includes `每月访问量` | `is-sorted` + `sortDirection--desc` |

Notes:

- Do **not** treat `sortDirection--undefined` (seen on the empty/pinned rank header) as desc.
- Default page load sorts **流量份额** desc — that does **not** mean change/visits are already applied.
- If already desc → return `'already'` and **do not click** (a second click may toggle asc).
- If not already → click once, then **re-poll PAGE_STATUS** until `ready` (see Post-click reload).

## Industry path ids

| CLI name (English or as shown) | Path id (replaces `All`) | Notes |
|--------------------------------|--------------------------|-------|
| All | All | default; query bar「所有行业」 |
| AI Chatbots and Tools | `AI_Chatbots_and_Tools` | live picker; spaces → `_` |
| 游戏 / Games | `Games` | live picker; English path id |
| 足球 / Soccer | `Sports~Soccer` | live nested child; parent~child with `~` |

Picker: click `[class*=CategoryItemWrapper] > div` (shows「所有行业」/ current category +「预定义行业」). List items: `[data-automation=list-item-keyword-wrapper]` (217 industries). Selecting a category **updates the path segment** and **resets Organic** back to「付费和自然」— scrape must re-apply Organic after industry deep-link / navigation.

Example after Games:

```
…/rankings/Games/999/1m?webSource=Total&selectedTab=CategoryLeadersSearch
```

Example after Soccer:

```
…/rankings/Sports~Soccer/999/1m?webSource=Total&selectedTab=CategoryLeadersSearch
```

## Table

- Root selector: `.swReactTable-wrapper` (also wrapped by `[class*=CategoryLeadersPageWrapper]`; table chrome `data-automation="category-leaders-table-top"`)
- Ready signal: at least **5** domain cells, selector `[data-automation-column-key="Domain"]` (All/Search page commonly loads **100** rows; narrower industries may load fewer, e.g. ~66)
- Layout: **column-major (SWReact)** — `.swReactTable-column` / `.swReactTable-unResizeColumn` each hold a vertical stack of `.swReactTableCell` with `data-table-row` / `data-table-col`
- Column map (header or `data-automation-column-key` → field):
  - rank → *(no automation key)*; first body column; cell text `1`…`N`
  - domain → `Domain` (link `[data-automation="domain-name"]`)
  - trafficShare → `Share`
  - change → `MoMChange`
  - industry → `Category`
  - monthlyVisits → `AvgMonthVisits`
  - adsense → `HasAdsense`
  - *(extra, not in CLI field list)* industry rank → `RootCategoryRank` (e.g. `#1`)

## EXTRACT algorithm

**Layout: column-major** (same SWReact pattern as `landing-pages.ts` / keyword-generator).

1. `table = document.querySelector('.swReactTable-wrapper')`
2. Collect body columns:
   ```js
   const columns = [...table.querySelectorAll('.swReactTable-column, .swReactTable-unResizeColumn')]
     .map((col) => [...col.querySelectorAll('.swReactTableCell')])
     .filter((cells) => cells.length >= 5);
   ```
3. Index columns by `cells[0].getAttribute('data-automation-column-key')` (preferred):
   - `Domain`, `Share`, `MoMChange`, `Category`, `AvgMonthVisits`, `HasAdsense`
   - Rank column: key is `null`; identify as the column whose first cell text matches `/^\d+$/`
4. `rowCount = Math.min(...neededCols.map(c => c.length))`
5. For each row index `r`:
   - **rank**: `(rankCol[r].innerText || '').trim()` → number
   - **domain**: prefer `domainCol[r].querySelector('[data-automation="domain-name"]')?.innerText.trim()`  
     fallback `(domainCol[r].innerText || '').trim()`  
     (live cells are **single-line** domain strings, e.g. `youtube.com` / `fifa.com` — not multi-line; favicon is separate `<img data-automation="domain-favicon">`)
   - **trafficShare**: `(shareCol[r].innerText || '').trim()` → e.g. `3.90%` (progress bar chrome present; `innerText` is the percentage)
   - **change** (**v1 recommendation: signed string with direction**):
     1. `raw = (changeCol[r].innerText || '').trim()` → e.g. `2.35%`, `863.27%`, `> 5,000%`
     2. Read direction from `.changePercentage` class: `positive` | `negative`
     3. Emit a **single signed string** (include direction; do not ship raw+class as two fields):
        - `positive` → prefix `+` if missing → e.g. `+863.27%`, `+> 5,000%`
        - `negative` → prefix `-` if missing → e.g. `-2.35%`
        - if neither class (rare) → emit `raw` unchanged
   - **industry**: prefer child label `categoryCol[r].querySelector('.change-color-on-hover')?.innerText.trim()`; fallback first line of `innerText` (DOM may also show parent as `/艺术与娱乐`)
   - **monthlyVisits**: `(visitsCol[r].innerText || '').trim()` → e.g. `3.422B`
   - **adsense**: **yes** if `hasAdsenseCol[r].querySelector('.sw-icon-checkmark_circle')` exists; **no** if cell HTML empty / no checkmark icon (cell `innerText` is always empty)

Not row-major: do not iterate `tr` wrappers.

### Sample row (Organic, Search/All, default Share desc — live)

| Field | Value |
|-------|-------|
| rank | `1` |
| domain | `youtube.com` |
| trafficShare | `4.22%` |
| change | `-2.35%` (raw `2.35%` + `.changePercentage.negative`) |
| industry | `电视、电影和流媒体` |
| monthlyVisits | `3.410B` |
| adsense | `yes` (`.sw-icon-checkmark_circle` present) |

### Sample row (Sports~Soccer after Change desc — live)

| Field | Value |
|-------|-------|
| rank | `1` |
| domain | `tigosports.com.sv` |
| trafficShare | `< 0.01%` |
| change | `+> 5,000%` (raw `> 5,000%` + `.changePercentage.positive`) |
| monthlyVisits | `103,850` |
| adsense | `no` |

## PAGE_STATUS

Canonical ready selector (**one primary**): `[data-automation-column-key="Domain"]`

Suggested status JS (mirror landing-pages / keyword-generator):

| Status | Rule |
|--------|------|
| `ready` | `document.querySelectorAll('[data-automation-column-key="Domain"]').length >= 5` |
| `auth` | body matches `/请登录\|登录后\|Sign in\|Log in/i` **and** Domain count `=== 0` (same regex as landing-pages; also seen on unauthenticated Chrome MCP profile: redirect to `dash.3ue.com/.../login`, heading「登录」) |
| `error` | body matches `/额，出错了\|Something went wrong\|请尝试刷新页面\|failed to load/i` **and** Domain count `=== 0` (**same regex family as landing-pages** — error wall not re-triggered in this recon session) |
| `hydrating` | `0 < Domain.length < 5` |
| `loading` | otherwise (table root may be absent; Domain count `=== 0`, no auth/error) |

Open via `page.newTab` / fresh tab — same-domain hash `goto` can leave SPA on loader/error wall without remounting (also seen: `#first-time-loader-container` 「Preparing insights…」 before `#react-app` hydrates).

### Post-click reload (Organic / sort header)

After clicking Organic chip option **or** a sort header:

1. Table **often clears briefly** — Domain count can drop to `0` within ~100ms (live: Change header click → `100 → 0 → 100` by ~300ms). This zero flash is **not** auth/error by itself.
2. **Do not** rely only on fixed `sleep` / `wait time`.
3. **Re-poll `waitForPageStatus` / PAGE_STATUS** until status is `ready` again (`Domain.length >= 5`), same as initial load and keyword-generator pagination post-click.
4. Only classify `auth`/`error` if those body strings are present **and** Domain count stays `0` after the poll window.

After Organic apply, also verify chip: `[data-automation="chip-item chip-item-自然"]` (or `simple-chip-item` text `自然`) before/while waiting for table ready.

## Organic ensure (if CLICK_REQUIRED)

- Default chip (Paid+Organic): `[data-automation="chipdown-no-border-button"]` with label「付费和自然」(under `[data-automation="category-leaders-table-top"]`)
- Open chipdown → popup `[data-automation="pop-up-content"]` options: **自然**, **投放**
- Select Organic: click the popup row whose visible text is exactly `自然`
- After applied: chip becomes removable simple chip:
  - `[data-automation="chip-item chip-item-自然"]` and/or `[data-automation="simple-chip-item"]` with text `自然`
  - chipdown「付费和自然」is gone
- How to detect already Organic: presence of `[data-automation="chip-item chip-item-自然"]` **or** `[data-automation="simple-chip-item"]` whose text is `自然`
- After selecting 自然: **re-poll PAGE_STATUS** until `ready` (table clears during filter apply — see Post-click reload)
- **Must re-apply after industry path change** — live evidence: navigating to `Games` / `AI_Chatbots_and_Tools` / `Sports~Soccer` resets filter UI back to「付费和自然」while URL still has no Organic param
- URL never gains an Organic query key → always treat as UI click, not deep-linkable

## Strategy confirmation

- Strategy: UI
- API usable? **no** (opencli `browser network` during load/filter/sort returned empty usable JSON endpoints in this session; GMITM / SPA same pattern as landing-pages & keyword-generator — **ship UI first**)

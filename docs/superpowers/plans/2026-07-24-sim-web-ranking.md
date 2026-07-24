# sim web-ranking Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver `opencli sim web-ranking [--sort change|visits] [--industry All|<name>] [--limit N]` that scrapes Category Leaders Search → Organic rankings on `sim.3ue.com` (fixed `1m`, global, `webSource=Total`).

**Architecture:** Follow existing `packages/sim` UI commands (`landing-pages`): build a hash deep link with sort + industry path segment, `openDeepLink` via `newTab`, wait for DOM ready, optionally one-click Organic if URL alone is insufficient, `page.evaluate` scrape table rows as JSON, `slice(0, limit)`. Pure helpers (sort/industry normalize, URL builder) live in `lib/` with Node unit tests; browser scrape stays in the command file.

**Tech Stack:** TypeScript, `@jackwener/opencli` registry (`Strategy.UI`), esbuild `--bundle`, Node `node:test` + `node:assert/strict`, Chrome + OpenCLI extension session on `sim.3ue.com`.

**Spec:** [`docs/superpowers/specs/2026-07-24-sim-web-ranking-design.md`](../specs/2026-07-24-sim-web-ranking-design.md)

---

## File map

| File | Responsibility |
|------|----------------|
| `docs/superpowers/specs/2026-07-24-sim-web-ranking-recon-notes.md` | Live recon: Organic/sort query keys, table selectors, industry path ids |
| `packages/sim/src/lib/web-ranking-industry.ts` | CLI industry name → URL path id; `listIndustries()` for error hints |
| `packages/sim/src/lib/web-ranking-industry.test.ts` | Industry mapping unit tests |
| `packages/sim/src/lib/web-ranking-url.ts` | `normalizeSort`, `buildWebRankingUrl` |
| `packages/sim/src/lib/web-ranking-url.test.ts` | Sort + URL builder unit tests |
| `packages/sim/src/web-ranking.ts` | CLI registration, PAGE_STATUS / EXTRACT / Organic ensure glue |
| `packages/sim/package.json` | Add esbuild entry for `web-ranking.js` |
| `.gitignore` | Ignore `packages/sim/web-ranking.js` |
| `README.md` | Command docs + table row in 命令一览 |

---

### Task 1: Browser recon (lock selectors + query keys + industry ids)

**Files:**
- Create: `docs/superpowers/specs/2026-07-24-sim-web-ranking-recon-notes.md`

- [ ] **Step 1: Open the reference page in Chrome (logged-in session)**

Base URL:

```
https://sim.3ue.com/#/digitalsuite/markets/webmarketanalysis/rankings/All/999/1m?webSource=Total&selectedTab=CategoryLeadersSearch
```

Use OpenCLI browser / Chrome MCP / manual — must be the user’s logged-in profile.

Actions to perform and record:

1. Confirm **搜索** tab + apply **自然 (Organic)** chip; note whether URL gains a query param (and its exact key/value). If URL does not change, note `CLICK_REQUIRED`.
2. Click column header **变动 (Change)** to sort desc; copy full URL after sort.
3. Click column header **每月访问量 (Monthly Visits)** to sort desc; copy full URL after sort.
4. Open industry picker (if any), select one non-All category visible on the page (e.g. Games / Soccer); copy the path segment that replaced `All`.
5. Inspect table DOM: root wrapper, ready signal, whether cells have `data-automation-column-key`, column-major vs row-major layout.

- [ ] **Step 2: Write recon notes (no empty fields)**

Create `docs/superpowers/specs/2026-07-24-sim-web-ranking-recon-notes.md` with this structure filled from the live page:

```markdown
# web-ranking recon notes

**Date:** 2026-07-24
**Base URL:** (full URL after Organic + Change sort)

## Fixed filters

| Concern | Value | How applied |
|---------|-------|-------------|
| Tab | CategoryLeadersSearch / 搜索 | `selectedTab=…` |
| Organic | 自然 | query `KEY=VALUE` **or** `CLICK_REQUIRED` |
| Duration | 1m | path segment |
| webSource | Total | query |
| Location | 全球 | (query key if any, else UI default) |

## Sort (confirmed)

| CLI `--sort` | Query/path change after clicking column | Example full URL fragment |
|--------------|----------------------------------------|---------------------------|
| change | … | … |
| visits | … | … |

If sort is **not** reflected in the URL, write `CLICK_HEADER_REQUIRED` and the header button selector / accessible name.

## Industry path ids

| CLI name (English or as shown) | Path id (replaces `All`) | Notes |
|--------------------------------|--------------------------|-------|
| All | All | default |
| (at least one real category) | … | from live picker |

## Table

- Root selector: `…`
- Ready signal: at least N domain cells, selector `…`
- Layout: column-major (SWReact) / row-major / other
- Column map (header or `data-automation-column-key` → field):
  - rank
  - domain
  - trafficShare
  - change
  - industry
  - monthlyVisits
  - adsense

## EXTRACT algorithm

(Document exact steps like keyword-generator recon: how to find columns, parse domain from multi-line cell, adsense yes/no.)

## Organic ensure (if CLICK_REQUIRED)

- Chip / tab selector: `…`
- How to detect already Organic: `…`

## Strategy confirmation

- Strategy: UI
- API usable? yes/no (endpoint URL if yes; still ship UI first)
```

- [ ] **Step 3: Commit recon notes**

```bash
git add docs/superpowers/specs/2026-07-24-sim-web-ranking-recon-notes.md
git commit -m "$(cat <<'EOF'
Document web-ranking page recon for sort, Organic, and selectors.

EOF
)"
```

---

### Task 2: Industry mapping (TDD)

**Files:**
- Create: `packages/sim/src/lib/web-ranking-industry.ts`
- Create: `packages/sim/src/lib/web-ranking-industry.test.ts`

Populate `INDUSTRIES` with **`All` plus every category recorded in Task 1 recon notes** (at least one non-All). Use path ids from recon exactly.

- [ ] **Step 1: Write failing tests**

Create `packages/sim/src/lib/web-ranking-industry.test.ts`:

```ts
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  listIndustries,
  resolveIndustryId,
} from './web-ranking-industry.ts';

describe('resolveIndustryId', () => {
  it('defaults empty / All to All', () => {
    assert.equal(resolveIndustryId(undefined), 'All');
    assert.equal(resolveIndustryId(''), 'All');
    assert.equal(resolveIndustryId('All'), 'All');
    assert.equal(resolveIndustryId('all'), 'All');
  });

  it('resolves a mapped industry case-insensitively', () => {
    // Replace SAMPLE_NAME / SAMPLE_ID with the real pair from recon notes.
    const id = resolveIndustryId('SAMPLE_NAME');
    assert.equal(id, 'SAMPLE_ID');
    assert.equal(resolveIndustryId('sample_name'), 'SAMPLE_ID');
  });

  it('throws ArgumentError for unknown industry and lists known keys', () => {
    assert.throws(
      () => resolveIndustryId('not-a-real-industry-xyz'),
      (err: Error) => {
        assert.match(err.message, /unknown industry/i);
        assert.match(err.message, /All/i);
        return true;
      },
    );
  });
});

describe('listIndustries', () => {
  it('includes All', () => {
    assert.ok(listIndustries().includes('All'));
  });
});
```

Before running tests, replace `SAMPLE_NAME` / `SAMPLE_ID` in the test file with the real recon pair (do not leave the placeholders).

- [ ] **Step 2: Run — expect FAIL**

```bash
cd packages/sim && npm test
```

Expected: fail resolving `./web-ranking-industry.ts` (module not found).

- [ ] **Step 3: Implement**

Create `packages/sim/src/lib/web-ranking-industry.ts` (fill map from recon; keep at least `All` + one category):

```ts
import { ArgumentError } from '@jackwener/opencli/errors';

/** CLI display/alias (lowercase key) → URL path id */
const INDUSTRY_ALIASES: Record<string, string> = {
  all: 'All',
  // From recon, e.g.:
  // 'games and accessories': '-123',
  // games: '-123',
};

export function listIndustries(): string[] {
  const ids = new Set<string>(Object.values(INDUSTRY_ALIASES));
  return ['All', ...[...ids].filter((id) => id !== 'All').sort()];
}

export function resolveIndustryId(raw: unknown): string {
  const input = String(raw ?? '').trim();
  if (!input) return 'All';

  const key = input.toLowerCase();
  const mapped = INDUSTRY_ALIASES[key];
  if (mapped) return mapped;

  // Allow passing the raw path id if it is already a known value.
  const knownIds = new Set(Object.values(INDUSTRY_ALIASES));
  if (knownIds.has(input)) return input;

  const known = [...new Set(['All', ...Object.keys(INDUSTRY_ALIASES)])]
    .filter((k) => k !== 'all')
    .sort()
    .join(', ');
  throw new ArgumentError(
    `unknown industry "${input}". Supported: ${known}`,
  );
}
```

Wire aliases so both the human-readable name from the UI and any short alias resolve to the same path id from recon.

- [ ] **Step 4: Run — expect PASS**

```bash
cd packages/sim && npm test
```

- [ ] **Step 5: Commit**

```bash
git add packages/sim/src/lib/web-ranking-industry.ts packages/sim/src/lib/web-ranking-industry.test.ts
git commit -m "$(cat <<'EOF'
Add web-ranking industry id mapping with validation.

EOF
)"
```

---

### Task 3: Sort normalize + URL builder (TDD)

**Files:**
- Create: `packages/sim/src/lib/web-ranking-url.ts`
- Create: `packages/sim/src/lib/web-ranking-url.test.ts`

Use **sort query keys / values from Task 1 recon notes**. The skeleton below assumes sort is query-driven; if recon says `CLICK_HEADER_REQUIRED`, still build the base URL here and document that `web-ranking.ts` must click the header after load (add a boolean export `SORT_VIA_URL = false` from this module when that happens).

- [ ] **Step 1: Write failing tests**

Create `packages/sim/src/lib/web-ranking-url.test.ts`:

```ts
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  buildWebRankingUrl,
  normalizeSort,
  SORT_VIA_URL,
} from './web-ranking-url.ts';

describe('normalizeSort', () => {
  it('defaults to change', () => {
    assert.equal(normalizeSort(undefined), 'change');
    assert.equal(normalizeSort(''), 'change');
    assert.equal(normalizeSort('change'), 'change');
  });

  it('accepts visits aliases', () => {
    assert.equal(normalizeSort('visits'), 'visits');
    assert.equal(normalizeSort('monthlyVisits'), 'visits');
    assert.equal(normalizeSort('每月访问量'), 'visits');
  });

  it('accepts change aliases', () => {
    assert.equal(normalizeSort('变动'), 'change');
  });

  it('rejects unknown sort', () => {
    assert.throws(() => normalizeSort('traffic'), /unknown sort/i);
  });
});

describe('buildWebRankingUrl', () => {
  it('builds All / 1m / CategoryLeadersSearch base', () => {
    const url = buildWebRankingUrl({ industryId: 'All', sort: 'change' });
    assert.match(url, /webmarketanalysis\/rankings\/All\/999\/1m/);
    assert.match(url, /webSource=Total/);
    assert.match(url, /selectedTab=CategoryLeadersSearch/);
  });

  it('injects industry path id', () => {
    // Use a real path id from recon (not All).
    const url = buildWebRankingUrl({ industryId: 'SAMPLE_ID', sort: 'change' });
    assert.match(url, /webmarketanalysis\/rankings\/SAMPLE_ID\/999\/1m/);
  });

  it('applies change vs visits sort when SORT_VIA_URL', () => {
    if (!SORT_VIA_URL) return;
    const changeUrl = buildWebRankingUrl({ industryId: 'All', sort: 'change' });
    const visitsUrl = buildWebRankingUrl({ industryId: 'All', sort: 'visits' });
    // Assert the exact query keys/values from recon notes:
    assert.match(changeUrl, /CHANGE_SORT_PATTERN/);
    assert.match(visitsUrl, /VISITS_SORT_PATTERN/);
    assert.notEqual(changeUrl.split('?')[1], visitsUrl.split('?')[1]);
  });
});
```

Replace `SAMPLE_ID`, `CHANGE_SORT_PATTERN`, `VISITS_SORT_PATTERN` with recon values before running. If Organic is URL-driven, add an assertion that the Organic query key/value appears in every built URL.

- [ ] **Step 2: Run — expect FAIL**

```bash
cd packages/sim && npm test
```

- [ ] **Step 3: Implement**

Create `packages/sim/src/lib/web-ranking-url.ts` (adjust Organic/sort keys from recon):

```ts
import { ArgumentError } from '@jackwener/opencli/errors';
import { SITE_ORIGIN } from './utils.ts';

export type WebRankingSort = 'change' | 'visits';

/** Set false if recon found sort only via column-header click. */
export const SORT_VIA_URL = true;

const SORT_ALIASES: Record<string, WebRankingSort> = {
  change: 'change',
  变动: 'change',
  visits: 'visits',
  monthlyvisits: 'visits',
  每月访问量: 'visits',
};

export function normalizeSort(raw: unknown): WebRankingSort {
  const input = String(raw ?? '').trim();
  if (!input) return 'change';
  const key = input.toLowerCase() === input ? input.toLowerCase() : input;
  const lowered = input.toLowerCase();
  const mapped =
    SORT_ALIASES[input] ??
    SORT_ALIASES[lowered] ??
    SORT_ALIASES[key];
  if (!mapped) {
    throw new ArgumentError(
      `unknown sort "${input}". Supported: change (变动), visits (每月访问量)`,
    );
  }
  return mapped;
}

export type WebRankingUrlOpts = {
  industryId: string;
  sort: WebRankingSort;
};

/**
 * Sort query mapping — REPLACE with recon-confirmed keys/values.
 * Example shape only; do not ship placeholders.
 */
const SORT_QUERY: Record<WebRankingSort, Record<string, string>> = {
  change: {
    // e.g. sort: 'Change', order: 'desc'
  },
  visits: {
    // e.g. sort: 'Share', order: 'desc'  — use recon
  },
};

export function buildWebRankingUrl(opts: WebRankingUrlOpts): string {
  const industryId = encodeURIComponent(opts.industryId).replace(/%2F/gi, '/');
  const qs = new URLSearchParams({
    webSource: 'Total',
    selectedTab: 'CategoryLeadersSearch',
    _: String(Date.now()),
  });

  // If recon listed an Organic query param, set it here on every URL.
  // e.g. qs.set('SearchType', 'Organic');

  if (SORT_VIA_URL) {
    for (const [k, v] of Object.entries(SORT_QUERY[opts.sort])) {
      qs.set(k, v);
    }
  }

  return `${SITE_ORIGIN}/#/digitalsuite/markets/webmarketanalysis/rankings/${industryId}/999/1m?${qs.toString()}`;
}
```

**Important:** Before commit, fill `SORT_QUERY` (and Organic `qs.set`) with real recon values. Empty `SORT_QUERY` objects are not acceptable in the committed code unless `SORT_VIA_URL === false`.

- [ ] **Step 4: Run — expect PASS**

```bash
cd packages/sim && npm test
```

- [ ] **Step 5: Commit**

```bash
git add packages/sim/src/lib/web-ranking-url.ts packages/sim/src/lib/web-ranking-url.test.ts
git commit -m "$(cat <<'EOF'
Add web-ranking deep-link builder and sort normalization.

EOF
)"
```

---

### Task 4: CLI command `web-ranking` (UI scrape)

**Files:**
- Create: `packages/sim/src/web-ranking.ts`
- Modify: `packages/sim/package.json` (build script)
- Modify: `.gitignore`

Mirror structure of `packages/sim/src/landing-pages.ts`. Paste selectors / EXTRACT logic from Task 1 recon notes (not invented).

- [ ] **Step 1: Implement `packages/sim/src/web-ranking.ts`**

```ts
/**
 * sim web-ranking — Category Leaders Search Organic site ranking on sim.3ue.com.
 *
 * Strategy note:
 *   Strategy: UI
 *   Contract: visible-ui
 *   Evidence: see docs/superpowers/specs/2026-07-24-sim-web-ranking-recon-notes.md
 *   - Page: digitalsuite/markets/webmarketanalysis/rankings/{industry}/999/1m
 *   - Fixed: selectedTab=CategoryLeadersSearch, Organic, 1m, webSource=Total
 *   - auth: Chrome session on sim.3ue.com
 *   - Must open via page.newTab; return JSON.stringify from evaluate
 */

import {
  ArgumentError,
  AuthRequiredError,
  CommandExecutionError,
  EmptyResultError,
  TimeoutError,
} from '@jackwener/opencli/errors';
import { cli, Strategy } from '@jackwener/opencli/registry';
import { resolveIndustryId } from './lib/web-ranking-industry.ts';
import {
  buildWebRankingUrl,
  normalizeSort,
  SORT_VIA_URL,
  type WebRankingSort,
} from './lib/web-ranking-url.ts';
import {
  DEFAULT_LIMIT,
  LOAD_TIMEOUT_SEC,
  MAX_LIMIT,
  normalizeLimit,
  openDeepLink,
  parseJsonRows,
  waitForPageStatus,
  type PageLike,
} from './lib/utils.ts';

const COLUMNS = [
  'rank',
  'domain',
  'trafficShare',
  'change',
  'industry',
  'monthlyVisits',
  'adsense',
] as const;

type WebRankingRow = {
  rank: number;
  domain: string;
  trafficShare: string;
  change: string;
  industry: string;
  monthlyVisits: string;
  adsense: boolean | string;
};

/** From recon — replace body with exact PAGE_STATUS_JS. */
const PAGE_STATUS_JS = `(() => {
  const text = document.body?.innerText || '';
  // READY: use recon root + domain cell count (>=5)
  const cells = document.querySelectorAll('ROOT_SELECTOR DOMAIN_CELL_SELECTOR');
  if (cells.length >= 5) return 'ready';
  if (/请登录|登录后|Sign in|Log in/i.test(text) && cells.length === 0) return 'auth';
  if (/额，出错了|Something went wrong|failed to load/i.test(text) && cells.length === 0) {
    return 'error';
  }
  if (cells.length > 0) return 'hydrating';
  return 'loading';
})()`;

/** From recon — replace with full EXTRACT_ROWS_JS returning JSON.stringify(rows). */
const EXTRACT_ROWS_JS = `(() => {
  // Implement exactly per recon EXTRACT algorithm.
  // Required fields: rank, domain, trafficShare, change, industry, monthlyVisits, adsense
  return JSON.stringify([]);
})()`;

const ENSURE_ORGANIC_JS = `(() => {
  // If recon says Organic is already in URL, return 'ok' immediately.
  // Else: if chip "自然" already active, return 'ok';
  // Else click the Organic control; return 'clicked' | 'missing'.
  return 'ok';
})()`;

const APPLY_SORT_CLICK_JS = (sort: WebRankingSort) => `(() => {
  // Only used when SORT_VIA_URL === false.
  // Click column header for ${sort === 'change' ? '变动|Change' : '每月访问量|Monthly Visits'}.
  // Return 'clicked' | 'missing' | 'already'.
  return 'already';
})()`;

async function ensureOrganic(page: PageLike): Promise<void> {
  const result = String(await page.evaluate(ENSURE_ORGANIC_JS));
  if (result === 'missing') {
    throw new CommandExecutionError(
      'Organic (自然) filter control not found on web-ranking page',
    );
  }
  if (result === 'clicked') await page.wait(1);
}

async function ensureSort(page: PageLike, sort: WebRankingSort): Promise<void> {
  if (SORT_VIA_URL) return;
  const result = String(await page.evaluate(APPLY_SORT_CLICK_JS(sort)));
  if (result === 'missing') {
    throw new CommandExecutionError(`Sort header for "${sort}" not found`);
  }
  if (result === 'clicked') await page.wait(1.5);
}

cli({
  site: 'sim',
  name: 'web-ranking',
  access: 'read',
  description:
    '查看站点排名（Category Leaders 搜索自然流量；默认按变动降序，固定 1m）',
  domain: 'sim.3ue.com',
  strategy: Strategy.UI,
  browser: true,
  args: [
    {
      name: 'sort',
      type: 'string',
      default: 'change',
      help: '排序：change（变动，默认）/ visits（每月访问量）',
    },
    {
      name: 'industry',
      type: 'string',
      default: 'All',
      help: '行业：All（默认）或已映射行业名',
    },
    {
      name: 'limit',
      type: 'int',
      default: DEFAULT_LIMIT,
      help: `返回条数（1-${MAX_LIMIT}，默认 ${DEFAULT_LIMIT}）`,
    },
  ],
  columns: [...COLUMNS],
  func: async (page, kwargs) => {
    const sort = normalizeSort(kwargs.sort);
    const industryId = resolveIndustryId(kwargs.industry);
    const limit = normalizeLimit(kwargs.limit, DEFAULT_LIMIT);
    const url = buildWebRankingUrl({ industryId, sort });

    await openDeepLink(page, url);
    await ensureOrganic(page);
    await ensureSort(page, sort);

    const status = await waitForPageStatus(page, PAGE_STATUS_JS, LOAD_TIMEOUT_SEC);

    if (status === 'auth') {
      throw new AuthRequiredError(
        'sim.3ue.com',
        'Not logged in to sim.3ue.com — open Chrome and sign in first',
      );
    }
    if (status === 'error') {
      throw new CommandExecutionError(
        'Web ranking failed to load. Try refreshing in the browser.',
      );
    }
    if (status !== 'ready') {
      throw new TimeoutError('sim web-ranking', LOAD_TIMEOUT_SEC);
    }

    const rows = parseJsonRows<WebRankingRow>(
      await page.evaluate(EXTRACT_ROWS_JS),
      'web-ranking',
    );

    if (rows.length === 0) {
      throw new EmptyResultError(
        'sim web-ranking',
        `No ranking rows for industry=${industryId} sort=${sort}`,
      );
    }

    return rows.slice(0, limit);
  },
});
```

Replace every `ROOT_SELECTOR` / empty EXTRACT / Organic stub with **recon-backed** implementations before considering the task done. Remove unused `ArgumentError` import if not referenced.

- [ ] **Step 2: Wire build + gitignore**

In `packages/sim/package.json`, append to the `build` script (same pattern as keyword-generator):

```text
&& npx esbuild src/web-ranking.ts --bundle --outfile=web-ranking.js --format=esm --platform=node --packages=external
```

In `.gitignore`, add:

```
packages/sim/web-ranking.js
```

- [ ] **Step 3: Build**

```bash
npm run build:sim
```

Expected: `packages/sim/web-ranking.js` exists.

- [ ] **Step 4: Commit**

```bash
git add packages/sim/src/web-ranking.ts packages/sim/package.json .gitignore
git commit -m "$(cat <<'EOF'
Add opencli sim web-ranking UI command.

EOF
)"
```

---

### Task 5: README + live verification

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Document the command**

In `README.md` 命令一览 table, add:

```markdown
| `sim web-ranking` | sim | 站点排名（搜索自然流量；可按变动/月访问量排序） |
```

Add a section `## sim web-ranking` after `## sim keyword-generator` (before the next major section), including:

- Fixed filters: Organic、1m、全球、`webSource=Total`
- Args table: `sort`, `industry`, `limit`
- Example commands:

```bash
OPENCLI_BROWSER_COMMAND_TIMEOUT=180 opencli sim web-ranking --limit 20 -f json
OPENCLI_BROWSER_COMMAND_TIMEOUT=180 opencli sim web-ranking --sort visits --limit 20 -f json
OPENCLI_BROWSER_COMMAND_TIMEOUT=180 opencli sim web-ranking --industry All --sort change --limit 10 -f json
```

- Link to design + recon + this plan under 设计文档

- [ ] **Step 2: Install / update plugin and smoke-test**

```bash
npm run build:sim
opencli plugin update sim
OPENCLI_BROWSER_COMMAND_TIMEOUT=180 opencli sim web-ranking --limit 5 -f json
OPENCLI_BROWSER_COMMAND_TIMEOUT=180 opencli sim web-ranking --sort visits --limit 5 -f json
```

Expected:

- JSON array length ≤ 5
- Keys: `rank`, `domain`, `trafficShare`, `change`, `industry`, `monthlyVisits`, `adsense`
- Default run appears sorted by descending change (spot-check first rows vs browser)
- `--sort visits` changes ordering vs default

If Organic was `CLICK_REQUIRED`, confirm Paid-only sites are not dominating (spot-check against browser with 自然 chip on).

- [ ] **Step 3: Commit docs**

```bash
git add README.md
git commit -m "$(cat <<'EOF'
Document sim web-ranking usage in README.

EOF
)"
```

---

## Spec coverage checklist

| Spec requirement | Task |
|------------------|------|
| Command `web-ranking` | Task 4 |
| Fixed Organic + 1m + Total + Search tab | Task 1 + 3 + 4 |
| Default `--sort change` | Task 3 + 4 |
| `--sort visits` | Task 3 + 4 |
| `--industry` default All + mapped names | Task 2 + 4 |
| `--limit` 1..100 default 50 | Task 4 (`normalizeLimit`) |
| Columns without industryRank | Task 4 `COLUMNS` |
| Typed errors | Task 4 |
| Unit tests for sort + industry | Task 2 + 3 |
| README | Task 5 |
| Strategy note / recon evidence | Task 1 + file header Task 4 |
| No duration/region CLI (out of scope) | not added |

## Self-review notes

- Recon must run first; later tasks substitute real selectors/query keys — no `ROOT_SELECTOR` or empty `SORT_QUERY` may remain in committed code.
- `SORT_VIA_URL` / Organic click paths are explicit so either recon outcome is implementable without redesign.
- Pagination beyond first page is out of scope per spec (MVP = current page + slice).

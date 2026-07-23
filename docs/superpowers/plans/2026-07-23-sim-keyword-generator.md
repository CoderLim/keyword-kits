# sim keyword-generator Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver `opencli sim keyword-generator <keyword> [--engine] [--min-volume] [--min-cpc] [--max-difficulty] [--limit]` that scrapes SimilarWeb keyword generator on `sim.3ue.com` with URL+local filters and auto-pagination.

**Architecture:** Follow existing `packages/sim` UI commands (`landing-pages`): build a hash deep link, `openDeepLink` via `newTab`, wait for DOM ready, `page.evaluate` scrape table rows as JSON, apply local numeric filters, click next page until `--limit` or max 20 pages. Pure helpers (metric parse / URL / filter) live in `lib/` and are unit-tested with Node’s built-in test runner; browser scrape stays in the command file.

**Tech Stack:** TypeScript, `@jackwener/opencli` registry (`Strategy.UI`), esbuild `--bundle`, Node `node:test` + `node:assert/strict`, Chrome + OpenCLI extension session on `sim.3ue.com`.

**Spec:** [`docs/superpowers/specs/2026-07-23-sim-keyword-generator-design.md`](../specs/2026-07-23-sim-keyword-generator-design.md)

---

## File map

| File | Responsibility |
|------|----------------|
| `packages/sim/src/lib/metrics.ts` | Parse volume / CPC / difficulty display strings → number \| null |
| `packages/sim/src/lib/metrics.test.ts` | Unit tests for parsers |
| `packages/sim/src/lib/keyword-filters.ts` | `applyLocalFilters(rows, { minVolume?, minCpc?, maxDifficulty? })` |
| `packages/sim/src/lib/keyword-filters.test.ts` | Filter unit tests |
| `packages/sim/src/lib/keyword-generator-url.ts` | `normalizeKeyword`, `normalizeEngine`, `buildKeywordGeneratorUrl` |
| `packages/sim/src/lib/keyword-generator-url.test.ts` | URL builder tests |
| `packages/sim/src/keyword-generator.ts` | CLI registration, PAGE_STATUS / EXTRACT / pagination UI glue |
| `packages/sim/package.json` | build entry + `test` script |
| `.gitignore` | ignore `packages/sim/keyword-generator.js` |
| `README.md` | command docs |
| `docs/superpowers/specs/2026-07-23-sim-keyword-generator-recon-notes.md` | Recon findings (selectors, query keys, pagination) |

---

### Task 1: Browser recon (lock selectors + query keys)

**Files:**
- Create: `docs/superpowers/specs/2026-07-23-sim-keyword-generator-recon-notes.md`

- [ ] **Step 1: Open the reference page in Chrome (logged-in session)**

URL:

```
https://sim.3ue.com/#/digitalsuite/acquisition/findkeywords/keyword-generator-tool/999/28d?searchEngine=google&keyword=dice&webSource=Total&isWWW=*&tab=phraseMatch&volumeFromValue=0
```

Use OpenCLI browser / Chrome MCP / manual — must be the user’s logged-in profile.

- [ ] **Step 2: Record findings into recon notes**

Write `docs/superpowers/specs/2026-07-23-sim-keyword-generator-recon-notes.md` with this exact structure filled in from the live page (no empty fields):

```markdown
# keyword-generator recon notes

**Date:** 2026-07-23
**Sample keyword:** dice

## Query params (confirmed)

| Filter | Query key | Example | Notes |
|--------|-----------|---------|-------|
| volume min | volumeFromValue | 1000 | confirmed from sample URL |
| cpc min | … | … | if none, write `LOCAL_ONLY` |
| difficulty max | … | … | if none, write `LOCAL_ONLY` |
| engine | searchEngine | google | |
| match tab | tab | phraseMatch | locked |

## Table

- Root selector: `…`
- Ready signal: at least N keyword cells visible, selector `…`
- Column map (header text → field): keyword / volume / cpc / difficulty / (optional extras)

## Pagination

- Next button selector: `…`
- Disabled / last-page signal: `…`
- Approx rows per page: N

## Strategy confirmation

- Strategy: UI
- API usable? yes/no (if yes, note URL but still ship UI first)
```

- [ ] **Step 3: Commit recon notes**

```bash
git add docs/superpowers/specs/2026-07-23-sim-keyword-generator-recon-notes.md
git commit -m "$(cat <<'EOF'
Document keyword-generator page recon for selectors and filters.

EOF
)"
```

---

### Task 2: Metric parsers (TDD)

**Files:**
- Create: `packages/sim/src/lib/metrics.ts`
- Create: `packages/sim/src/lib/metrics.test.ts`
- Modify: `packages/sim/package.json` (add `"test"` script)

- [ ] **Step 1: Add test script and failing tests**

In `packages/sim/package.json`, add:

```json
"test": "node --experimental-strip-types --test src/lib/*.test.ts"
```

(If Node version in the environment rejects strip-types on `.ts`, switch to compiling tests via esbuild into a temp file — prefer strip-types on Node ≥22; verify with `node -v` first.)

Create `packages/sim/src/lib/metrics.test.ts`:

```ts
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { parseCpc, parseDifficulty, parseVolume } from './metrics.ts';

describe('parseVolume', () => {
  it('parses plain integers', () => {
    assert.equal(parseVolume('1200'), 1200);
  });
  it('parses K/M suffixes', () => {
    assert.equal(parseVolume('1.2K'), 1200);
    assert.equal(parseVolume('3.5M'), 3_500_000);
  });
  it('returns null for empty / dash / N/A', () => {
    assert.equal(parseVolume('-'), null);
    assert.equal(parseVolume('N/A'), null);
    assert.equal(parseVolume(''), null);
  });
});

describe('parseCpc', () => {
  it('strips currency symbols', () => {
    assert.equal(parseCpc('$0.45'), 0.45);
    assert.equal(parseCpc('0.45'), 0.45);
  });
  it('returns null for unparseable', () => {
    assert.equal(parseCpc('-'), null);
  });
});

describe('parseDifficulty', () => {
  it('parses integers and percents', () => {
    assert.equal(parseDifficulty('42'), 42);
    assert.equal(parseDifficulty('42%'), 42);
  });
  it('returns null for unparseable', () => {
    assert.equal(parseDifficulty('N/A'), null);
  });
});
```

- [ ] **Step 2: Run tests — expect FAIL (module missing)**

```bash
cd packages/sim && npm test
```

Expected: fail resolving `./metrics.ts` or missing exports.

- [ ] **Step 3: Implement parsers**

Create `packages/sim/src/lib/metrics.ts`:

```ts
/** Parse SimilarWeb-style volume strings ("1.2K", "3M", "1200") → number, or null. */
export function parseVolume(raw: string): number | null {
  const s = String(raw ?? '').trim().replace(/,/g, '');
  if (!s || s === '-' || /^n\/?a$/i.test(s)) return null;
  const m = s.match(/^([\d.]+)\s*([kmb])?$/i);
  if (!m) return null;
  const n = Number(m[1]);
  if (!Number.isFinite(n)) return null;
  const suf = (m[2] || '').toLowerCase();
  const mult = suf === 'k' ? 1_000 : suf === 'm' ? 1_000_000 : suf === 'b' ? 1_000_000_000 : 1;
  return n * mult;
}

/** Parse CPC ("$0.45", "0.45") → number, or null. */
export function parseCpc(raw: string): number | null {
  const s = String(raw ?? '').trim();
  if (!s || s === '-' || /^n\/?a$/i.test(s)) return null;
  const n = Number(s.replace(/[^0-9.]/g, ''));
  return Number.isFinite(n) ? n : null;
}

/** Parse difficulty ("42", "42%") → number, or null. */
export function parseDifficulty(raw: string): number | null {
  const s = String(raw ?? '').trim();
  if (!s || s === '-' || /^n\/?a$/i.test(s)) return null;
  const n = Number(s.replace(/%/g, '').trim());
  return Number.isFinite(n) ? n : null;
}
```

- [ ] **Step 4: Run tests — expect PASS**

```bash
cd packages/sim && npm test
```

Expected: all `metrics` tests pass.

- [ ] **Step 5: Commit**

```bash
git add packages/sim/package.json packages/sim/src/lib/metrics.ts packages/sim/src/lib/metrics.test.ts
git commit -m "$(cat <<'EOF'
Add SimilarWeb metric parsers with unit tests.

EOF
)"
```

---

### Task 3: Local filters (TDD)

**Files:**
- Create: `packages/sim/src/lib/keyword-filters.ts`
- Create: `packages/sim/src/lib/keyword-filters.test.ts`

- [ ] **Step 1: Write failing tests**

```ts
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { applyLocalFilters, type KeywordRow } from './keyword-filters.ts';

const rows: KeywordRow[] = [
  { keyword: 'a', volume: '2K', cpc: '$1.00', difficulty: '30' },
  { keyword: 'b', volume: '500', cpc: '$0.10', difficulty: '80' },
  { keyword: 'c', volume: '-', cpc: '$2.00', difficulty: '10' },
];

describe('applyLocalFilters', () => {
  it('returns all rows when no filters', () => {
    assert.equal(applyLocalFilters(rows, {}).length, 3);
  });
  it('filters by minVolume', () => {
    const out = applyLocalFilters(rows, { minVolume: 1000 });
    assert.deepEqual(out.map((r) => r.keyword), ['a']);
  });
  it('filters by minCpc', () => {
    const out = applyLocalFilters(rows, { minCpc: 0.5 });
    assert.deepEqual(out.map((r) => r.keyword), ['a', 'c']);
  });
  it('filters by maxDifficulty', () => {
    const out = applyLocalFilters(rows, { maxDifficulty: 50 });
    assert.deepEqual(out.map((r) => r.keyword), ['a', 'c']);
  });
  it('drops rows that cannot be parsed when that filter is set', () => {
    const out = applyLocalFilters(rows, { minVolume: 1 });
    assert.ok(!out.some((r) => r.keyword === 'c'));
  });
  it('combines filters', () => {
    const out = applyLocalFilters(rows, { minVolume: 100, minCpc: 0.5, maxDifficulty: 50 });
    assert.deepEqual(out.map((r) => r.keyword), ['a']);
  });
});
```

- [ ] **Step 2: Run — expect FAIL**

```bash
cd packages/sim && npm test
```

- [ ] **Step 3: Implement**

```ts
import { parseCpc, parseDifficulty, parseVolume } from './metrics.ts';

export type KeywordRow = {
  keyword: string;
  volume: string;
  cpc: string;
  difficulty: string;
  [key: string]: string | number | undefined;
};

export type KeywordFilterOpts = {
  minVolume?: number;
  minCpc?: number;
  maxDifficulty?: number;
};

export function applyLocalFilters(rows: KeywordRow[], opts: KeywordFilterOpts): KeywordRow[] {
  return rows.filter((row) => {
    if (opts.minVolume != null) {
      const v = parseVolume(row.volume);
      if (v == null || v < opts.minVolume) return false;
    }
    if (opts.minCpc != null) {
      const c = parseCpc(row.cpc);
      if (c == null || c < opts.minCpc) return false;
    }
    if (opts.maxDifficulty != null) {
      const d = parseDifficulty(String(row.difficulty));
      if (d == null || d > opts.maxDifficulty) return false;
    }
    return true;
  });
}
```

- [ ] **Step 4: Run — expect PASS**

```bash
cd packages/sim && npm test
```

- [ ] **Step 5: Commit**

```bash
git add packages/sim/src/lib/keyword-filters.ts packages/sim/src/lib/keyword-filters.test.ts
git commit -m "$(cat <<'EOF'
Add local keyword filters for volume, CPC, and difficulty.

EOF
)"
```

---

### Task 4: Deep link builder (TDD)

**Files:**
- Create: `packages/sim/src/lib/keyword-generator-url.ts`
- Create: `packages/sim/src/lib/keyword-generator-url.test.ts`

Use **query keys from Task 1 recon notes**. Below assumes `volumeFromValue` for volume; if CPC/difficulty are `LOCAL_ONLY`, omit them from the URL builder (still accept CLI args for local filter only).

- [ ] **Step 1: Write failing tests**

```ts
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  buildKeywordGeneratorUrl,
  normalizeEngine,
  normalizeKeyword,
  normalizeOptionalNumber,
} from './keyword-generator-url.ts';

describe('normalizeKeyword', () => {
  it('trims and requires non-empty', () => {
    assert.equal(normalizeKeyword('  dice '), 'dice');
    assert.throws(() => normalizeKeyword(''), /keyword/i);
  });
});

describe('normalizeEngine', () => {
  it('defaults to google', () => {
    assert.equal(normalizeEngine(undefined), 'google');
    assert.equal(normalizeEngine(''), 'google');
  });
  it('lowercases engine', () => {
    assert.equal(normalizeEngine('Google'), 'google');
  });
});

describe('normalizeOptionalNumber', () => {
  it('returns undefined for empty', () => {
    assert.equal(normalizeOptionalNumber(undefined, 'min-volume'), undefined);
  });
  it('rejects negative', () => {
    assert.throws(() => normalizeOptionalNumber(-1, 'min-volume'), /min-volume/i);
  });
});

describe('buildKeywordGeneratorUrl', () => {
  it('builds base phraseMatch URL', () => {
    const url = buildKeywordGeneratorUrl({ keyword: 'dice', engine: 'google' });
    assert.match(url, /keyword-generator-tool\/999\/28d/);
    assert.match(url, /searchEngine=google/);
    assert.match(url, /keyword=dice/);
    assert.match(url, /tab=phraseMatch/);
    assert.match(url, /webSource=Total/);
    assert.match(url, /isWWW=\*/);
  });
  it('adds volumeFromValue when minVolume set', () => {
    const url = buildKeywordGeneratorUrl({ keyword: 'dice', engine: 'google', minVolume: 1000 });
    assert.match(url, /volumeFromValue=1000/);
  });
  // If recon found CPC/difficulty query keys, add matching assertions here.
});
```

- [ ] **Step 2: Run — expect FAIL**

```bash
cd packages/sim && npm test
```

- [ ] **Step 3: Implement** (adjust CPC/difficulty query keys from recon)

```ts
import { ArgumentError } from '@jackwener/opencli/errors';
import { SITE_ORIGIN } from './utils.ts';

export function normalizeKeyword(raw: unknown): string {
  const keyword = String(raw ?? '').trim();
  if (!keyword) throw new ArgumentError('keyword is required');
  return keyword;
}

export function normalizeEngine(raw: unknown): string {
  const engine = String(raw ?? '').trim().toLowerCase();
  return engine || 'google';
}

export function normalizeOptionalNumber(raw: unknown, label: string): number | undefined {
  if (raw == null || raw === '') return undefined;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) {
    throw new ArgumentError(`${label} must be a non-negative number`);
  }
  return n;
}

export type KeywordGeneratorUrlOpts = {
  keyword: string;
  engine: string;
  minVolume?: number;
  minCpc?: number;
  maxDifficulty?: number;
};

export function buildKeywordGeneratorUrl(opts: KeywordGeneratorUrlOpts): string {
  const qs = new URLSearchParams({
    searchEngine: opts.engine,
    keyword: opts.keyword,
    webSource: 'Total',
    isWWW: '*',
    tab: 'phraseMatch',
    _: String(Date.now()),
  });
  if (opts.minVolume != null) qs.set('volumeFromValue', String(opts.minVolume));
  // After Task 1: if recon lists CPC/difficulty query keys, add qs.set(...) here.
  // If recon says LOCAL_ONLY, do not set URL params for those filters.

  return `${SITE_ORIGIN}/#/digitalsuite/acquisition/findkeywords/keyword-generator-tool/999/28d?${qs.toString()}`;
}
```

**Gate:** Do not commit until CPC/difficulty URL handling matches Task 1 notes (either real keys or intentionally omitted).

- [ ] **Step 4: Run — expect PASS**

```bash
cd packages/sim && npm test
```

- [ ] **Step 5: Commit**

```bash
git add packages/sim/src/lib/keyword-generator-url.ts packages/sim/src/lib/keyword-generator-url.test.ts
git commit -m "$(cat <<'EOF'
Add keyword-generator deep link builder.

EOF
)"
```

---

### Task 5: Implement UI command + pagination

**Files:**
- Create: `packages/sim/src/keyword-generator.ts`
- Modify: `packages/sim/package.json` (build script)
- Modify: `.gitignore`

- [ ] **Step 1: Wire build + gitignore**

`.gitignore` add:

```
packages/sim/keyword-generator.js
```

`packages/sim/package.json` `build` append (same pattern as landing-pages):

```bash
&& npx esbuild src/keyword-generator.ts --bundle --outfile=keyword-generator.js --format=esm --platform=node --packages=external
```

- [ ] **Step 2: Implement `keyword-generator.ts`**

Create the file using recon selectors. Structure (fill SELECTORS / EXTRACT from Task 1):

```ts
/**
 * sim keyword-generator — SimilarWeb Keyword Generator (phrase match).
 *
 * Strategy note:
 *   Strategy: UI
 *   Contract: visible-ui
 *   Evidence: see docs/superpowers/specs/2026-07-23-sim-keyword-generator-recon-notes.md
 *   auth: Chrome session on sim.3ue.com
 *   Must open via page.newTab; return JSON.stringify from evaluate
 */

import {
  AuthRequiredError,
  CommandExecutionError,
  EmptyResultError,
  TimeoutError,
} from '@jackwener/opencli/errors';
import { cli, Strategy } from '@jackwener/opencli/registry';
import { applyLocalFilters, type KeywordRow } from './lib/keyword-filters.js';
import {
  buildKeywordGeneratorUrl,
  normalizeEngine,
  normalizeKeyword,
  normalizeOptionalNumber,
} from './lib/keyword-generator-url.js';
import {
  DEFAULT_LIMIT,
  LOAD_TIMEOUT_SEC,
  MAX_LIMIT,
  normalizeLimit,
  openDeepLink,
  parseJsonRows,
  waitForPageStatus,
  type PageLike,
} from './lib/utils.js';

const MAX_PAGES = 20;
const COLUMNS = ['keyword', 'volume', 'cpc', 'difficulty'] as const;

// --- Paste PAGE_STATUS_JS / EXTRACT_ROWS_JS / HAS_NEXT_JS / CLICK_NEXT_JS from recon ---
const PAGE_STATUS_JS = `(() => {
  /* ready when ≥1 keyword rows; auth/error like landing-pages */
})()`;

const EXTRACT_ROWS_JS = `(() => {
  /* return JSON.stringify([{ keyword, volume, cpc, difficulty }]) */
})()`;

const PAGINATION_STATE_JS = `(() => {
  /* return JSON.stringify({ hasNext: boolean }) */
})()`;

const CLICK_NEXT_JS = `(() => {
  /* click next; return true if clicked */
})()`;

async function extractFiltered(
  page: PageLike,
  filters: { minVolume?: number; minCpc?: number; maxDifficulty?: number },
): Promise<KeywordRow[]> {
  const rows = parseJsonRows<KeywordRow>(await page.evaluate(EXTRACT_ROWS_JS), 'keyword-generator');
  return applyLocalFilters(rows, filters);
}

cli({
  site: 'sim',
  name: 'keyword-generator',
  access: 'read',
  description: 'SimilarWeb 关键词生成器（phrase match；可筛 volume/CPC/难度；自动翻页）',
  domain: 'sim.3ue.com',
  strategy: Strategy.UI,
  browser: true,
  args: [
    { name: 'keyword', type: 'string', required: true, positional: true, help: '种子词（如 dice）' },
    { name: 'engine', type: 'string', default: 'google', help: '搜索引擎（默认 google）' },
    { name: 'min-volume', type: 'float', required: false, help: '搜索量下限（默认不限）' },
    { name: 'min-cpc', type: 'float', required: false, help: 'CPC 下限（默认不限）' },
    { name: 'max-difficulty', type: 'float', required: false, help: '难度上限（默认不限）' },
    { name: 'limit', type: 'int', default: DEFAULT_LIMIT, help: `返回条数（1-${MAX_LIMIT}，默认 ${DEFAULT_LIMIT}）` },
  ],
  columns: [...COLUMNS],
  func: async (page, kwargs) => {
    const keyword = normalizeKeyword(kwargs.keyword);
    const engine = normalizeEngine(kwargs.engine);
    const minVolume = normalizeOptionalNumber(kwargs['min-volume'], 'min-volume');
    const minCpc = normalizeOptionalNumber(kwargs['min-cpc'], 'min-cpc');
    const maxDifficulty = normalizeOptionalNumber(kwargs['max-difficulty'], 'max-difficulty');
    const limit = normalizeLimit(kwargs.limit, DEFAULT_LIMIT);
    const filters = { minVolume, minCpc, maxDifficulty };

    await openDeepLink(page, buildKeywordGeneratorUrl({ keyword, engine, ...filters }));

    const status = await waitForPageStatus(page, PAGE_STATUS_JS, LOAD_TIMEOUT_SEC);
    if (status === 'auth') {
      throw new AuthRequiredError('sim.3ue.com', 'Not logged in to sim.3ue.com — open Chrome and sign in first');
    }
    if (status === 'error') {
      throw new CommandExecutionError(`Keyword generator failed to load for "${keyword}".`);
    }
    if (status !== 'ready') {
      throw new TimeoutError(`sim keyword-generator (${keyword})`, LOAD_TIMEOUT_SEC);
    }

    const accumulated: KeywordRow[] = [];
    const seen = new Set<string>();

    for (let pageIdx = 0; pageIdx < MAX_PAGES && accumulated.length < limit; pageIdx++) {
      const filtered = await extractFiltered(page, filters);
      for (const row of filtered) {
        const key = row.keyword.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        accumulated.push(row);
        if (accumulated.length >= limit) break;
      }
      if (accumulated.length >= limit) break;

      const stateRaw = await page.evaluate(PAGINATION_STATE_JS);
      const state = typeof stateRaw === 'string' ? JSON.parse(stateRaw) : stateRaw;
      if (!state?.hasNext) break;

      const clicked = await page.evaluate(CLICK_NEXT_JS);
      if (!clicked) break;

      const after = await waitForPageStatus(page, PAGE_STATUS_JS, LOAD_TIMEOUT_SEC);
      if (after !== 'ready' && after !== 'hydrating') break;
    }

    if (accumulated.length === 0) {
      throw new EmptyResultError('sim keyword-generator', `No keywords found for "${keyword}"`);
    }
    return accumulated.slice(0, limit);
  },
});
```

Replace the four `*_JS` stubs with real IIFEs from recon before considering the task done.

- [ ] **Step 3: Build and reinstall plugin**

```bash
npm run build:sim
opencli plugin install file://$(pwd)/packages/sim
# or: opencli plugin update sim
opencli sim keyword-generator --help
```

Expected: help lists `keyword-generator` with the args above.

- [ ] **Step 4: Commit**

```bash
git add packages/sim/src/keyword-generator.ts packages/sim/package.json .gitignore
git commit -m "$(cat <<'EOF'
Add sim keyword-generator UI command with pagination.

EOF
)"
```

---

### Task 6: README + smoke verify

**Files:**
- Modify: `README.md` (命令一览 + 新章节，对齐 landing-pages 文档风格)
- Modify: `docs/superpowers/specs/2026-07-23-sim-keyword-generator-design.md` — check success criteria boxes if desired (optional)

- [ ] **Step 1: Update README**

In the commands table add:

```
| `sim keyword-generator` | sim | 关键词生成器（phrase match，可筛 volume/CPC/难度） |
```

Add a `## \`sim keyword-generator\`` section documenting args, fixed defaults (`phraseMatch`, `28d`, `webSource=Total`), example commands, and `OPENCLI_BROWSER_COMMAND_TIMEOUT=180`. Link the design + recon notes.

Also add the design/recon links under「设计文档（sim）」.

- [ ] **Step 2: Smoke tests (requires logged-in Chrome)**

```bash
OPENCLI_BROWSER_COMMAND_TIMEOUT=180 opencli sim keyword-generator dice --limit 5 -f json
OPENCLI_BROWSER_COMMAND_TIMEOUT=180 opencli sim keyword-generator dice --min-volume 1000 --max-difficulty 50 --limit 20 -f json
```

Expected:
- First: ≥1 rows with `keyword`, `volume`, `cpc`, `difficulty`
- Second: every row satisfies filters; if first page has fewer than 20 matching rows, command still returns up to 20 (or fewer if exhausted) without hanging

- [ ] **Step 3: Commit README**

```bash
git add README.md
git commit -m "$(cat <<'EOF'
Document sim keyword-generator usage in README.

EOF
)"
```

---

## Spec coverage checklist

| Spec requirement | Task |
|------------------|------|
| Positionale `keyword` | Task 5 |
| `--engine` default google | Tasks 4–5 |
| `--min-volume` / `--min-cpc` / `--max-difficulty` default unlimited | Tasks 3–5 |
| Hardcoded phraseMatch / Total / isWWW / 28d | Task 4 |
| URL filters + local fallback | Tasks 1, 4, 3, 5 |
| Auto-paginate to `--limit`, max 20 pages | Task 5 |
| Columns keyword/volume/cpc/difficulty | Task 5 |
| Typed errors | Task 5 |
| Strategy note in source | Task 5 |
| README | Task 6 |
| Metric parse for K/M / $ / N/A | Task 2 |

## Self-review notes

- No intentional TBD left in committed code paths; recon Task 1 must fill selector/query blanks before Task 5 lands.
- Arg names use CLI hyphen form `min-volume`; kwargs access via `kwargs['min-volume']` (opencli convention — if registry camelCases, adjust to match `landing-pages`’ `kwargs.change` pattern after one `--help` / dry run).
- If opencli `args` does not support `type: 'float'`, use `type: 'string'` and parse with `normalizeOptionalNumber`.

---

## Execution handoff

Plan complete and saved to `docs/superpowers/plans/2026-07-23-sim-keyword-generator.md`.

**Two execution options:**

1. **Subagent-Driven (recommended)** — fresh subagent per task, review between tasks  
2. **Inline Execution** — run tasks in this session with executing-plans checkpoints  

Which approach?

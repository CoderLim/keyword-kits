# queryDomain search Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver `opencli queryDomain search <keyword>` that returns query.domains keyword domain list rows (domain, year, dr, forSale, registered, expires, existed).

**Architecture:** New PUBLIC opencli plugin `packages/query-domain`. Normalize keyword → label, append fixed 14 TLDs, fetch SSE `/api/upstream/check`, merge meta, fetch `/api/dr`, return ordered rows. No Chrome.

**Tech Stack:** TypeScript, esbuild, `@jackwener/opencli` registry (`Strategy.PUBLIC`), Node built-in `fetch` + `node:test`.

**Spec:** `docs/superpowers/specs/2026-07-23-query-domain-search-design.md`

---

## File map

| Path | Responsibility |
|------|----------------|
| `packages/query-domain/src/lib.ts` | Pure helpers (normalize, SSE parse, merge, rows) |
| `packages/query-domain/src/search.ts` | Fetch + `cli()` registration (imports lib) |
| `packages/query-domain/search.test.mjs` | Unit tests importing built helpers via `search.js` re-exports or test `lib` through build |
| `packages/query-domain/package.json` | Package metadata + build/test scripts |
| `packages/query-domain/opencli-plugin.json` | Plugin manifest (`name`: `query-domain`) |
| `packages/query-domain/search.js` | esbuild output (gitignored — add to `.gitignore`) |
| `opencli-plugin.json` | Register `query-domain` under monorepo `plugins` |
| `package.json` | workspace + `build` / `build:query-domain` |
| `README.md` | Install + command docs |
| `.gitignore` | Ignore `packages/query-domain/search.js` |

---

### Task 1: Scaffold plugin package

**Files:**
- Create: `packages/query-domain/package.json`
- Create: `packages/query-domain/opencli-plugin.json`
- Modify: `opencli-plugin.json`
- Modify: `package.json`
- Modify: `.gitignore`

- [ ] **Step 1: Create `packages/query-domain/package.json`**

```json
{
  "name": "opencli-plugin-query-domain",
  "version": "0.1.0",
  "type": "module",
  "description": "opencli plugin: query.domains keyword domain search (queryDomain search)",
  "license": "MIT",
  "peerDependencies": {
    "@jackwener/opencli": ">=1.8.6"
  },
  "devDependencies": {
    "esbuild": "^0.28.1"
  },
  "scripts": {
    "build": "npx esbuild src/search.ts --bundle --outfile=search.js --format=esm --platform=node --packages=external",
    "test": "npm run build && node --test search.test.mjs"
  }
}
```

- [ ] **Step 2: Create `packages/query-domain/opencli-plugin.json`**

```json
{
  "name": "query-domain",
  "version": "0.1.0",
  "description": "query.domains keyword domain list (queryDomain search)",
  "opencli": ">=1.8.6"
}
```

- [ ] **Step 3: Wire monorepo root**

Update root `opencli-plugin.json` to:

```json
{
  "version": "0.3.0",
  "opencli": ">=1.8.6",
  "description": "OpenCLI plugins: SimilarWeb (sim) + Google Trends (google-trends) + query.domains (query-domain)",
  "plugins": {
    "sim": { "path": "packages/sim" },
    "google-trends": { "path": "packages/google-trends" },
    "query-domain": { "path": "packages/query-domain" }
  }
}
```

Update root `package.json`:
- `"description"`: mention query-domain
- `workspaces` add `"packages/query-domain"`
- `"build"`: append `&& npm run build -w opencli-plugin-query-domain`
- add `"build:query-domain": "npm run build -w opencli-plugin-query-domain"`

Append to `.gitignore`:

```
packages/query-domain/search.js
```

- [ ] **Step 4: Commit scaffold**

```bash
git add packages/query-domain/package.json packages/query-domain/opencli-plugin.json opencli-plugin.json package.json .gitignore
git commit -m "$(cat <<'EOF'
chore: scaffold query-domain opencli plugin package

EOF
)"
```

---

### Task 2: Pure helpers + unit tests (TDD)

**Files:**
- Create: `packages/query-domain/src/lib.ts`
- Create: `packages/query-domain/search.test.mjs`
- Create: `packages/query-domain/src/search.ts` (minimal re-export + stub cli deferred to Task 3)

For testing without registering `cli()`, put all pure logic in `lib.ts`. `search.ts` will import lib and call `cli()`. Build entry is `search.ts` with `--bundle` so lib is inlined. Tests cannot import from bundled `search.js` without side effects — **instead** build lib alone for tests OR use a second esbuild outfile.

**Locked approach:** add build step for helpers used by tests:

```json
"build": "npx esbuild src/lib.ts --outfile=lib.js --format=esm --platform=node && npx esbuild src/search.ts --bundle --outfile=search.js --format=esm --platform=node --packages=external",
"test": "npm run build && node --test search.test.mjs"
```

Also gitignore `packages/query-domain/lib.js`.

- [ ] **Step 1: Write failing tests** — create `packages/query-domain/search.test.mjs`

```js
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  DEFAULT_TLDS,
  buildDomains,
  formatDateYmd,
  mergeCheckMeta,
  normalizeKeyword,
  parseSseEvents,
  toRows,
} from './lib.js';

describe('normalizeKeyword', () => {
  it('trims, splits on whitespace, concatenates, lowercases', () => {
    assert.equal(normalizeKeyword('  AI Image  '), 'aiimage');
    assert.equal(normalizeKeyword('pdf'), 'pdf');
  });
  it('rejects empty', () => {
    assert.throws(() => normalizeKeyword('   '), /keyword/i);
    assert.throws(() => normalizeKeyword(''), /keyword/i);
  });
});

describe('buildDomains', () => {
  it('appends DEFAULT_TLDS in order', () => {
    const domains = buildDomains('aiimage');
    assert.equal(domains.length, DEFAULT_TLDS.length);
    assert.equal(domains[0], 'aiimage.com');
    assert.equal(domains[1], 'aiimage.ai');
    assert.equal(domains.at(-1), 'aiimage.top');
  });
});

describe('parseSseEvents', () => {
  it('parses shallow and whois events', () => {
    const raw = [
      'event: shallow-checked',
      'data: {"domain":"aiimage.io","meta":{"domain":"aiimage.io","existed":"yes","market":"https://atom.com"}}',
      'id: aiimage.io',
      '',
      'event: whois-cache-checked',
      'data: {"domain":"aiimage.io","meta":{"id":"aiimage.io","registered":"2023-12-13T17:45:27.168Z","expires":"2026-12-13T17:45:27.168Z","existed":"yes"}}',
      'id: aiimage.io',
      '',
      'event: [DONE]',
      'data: {"duration":100}',
      'id: [DONE]',
      '',
    ].join('\n');
    const events = parseSseEvents(raw);
    assert.equal(events.length, 3);
    assert.equal(events[0].event, 'shallow-checked');
    assert.equal(events[0].data.domain, 'aiimage.io');
  });
});

describe('mergeCheckMeta + toRows', () => {
  it('merges forSale from market and formats dates/year/dr', () => {
    const map = new Map();
    mergeCheckMeta(map, {
      event: 'shallow-checked',
      data: {
        domain: 'aiimage.io',
        meta: { domain: 'aiimage.io', existed: 'yes', market: 'https://atom.com' },
      },
    });
    mergeCheckMeta(map, {
      event: 'whois-cache-checked',
      data: {
        domain: 'aiimage.io',
        meta: {
          registered: '2023-12-13T17:45:27.168Z',
          expires: '2026-12-13T17:45:27.168Z',
          existed: 'yes',
        },
      },
    });
    const rows = toRows(['aiimage.io'], map, { 'aiimage.io': 0 });
    assert.deepEqual(rows[0], {
      domain: 'aiimage.io',
      year: '2023',
      dr: 0,
      forSale: true,
      registered: '2023-12-13',
      expires: '2026-12-13',
      existed: 'yes',
    });
  });

  it('uses null dr and empty dates when missing', () => {
    const map = new Map();
    const rows = toRows(['x.com'], map, {});
    assert.equal(rows[0].dr, null);
    assert.equal(rows[0].year, '');
    assert.equal(rows[0].registered, '');
    assert.equal(rows[0].forSale, false);
    assert.equal(rows[0].existed, '');
  });
});

describe('formatDateYmd', () => {
  it('formats ISO to YYYY-MM-DD', () => {
    assert.equal(formatDateYmd('2010-03-08T10:35:21Z'), '2010-03-08');
    assert.equal(formatDateYmd(''), '');
    assert.equal(formatDateYmd(undefined), '');
  });
});
```

- [ ] **Step 2: Run tests — expect FAIL**

```bash
cd /Users/coderlim/Projects/keyword-kits/packages/query-domain
node --test search.test.mjs
```

Expected: `ERR_MODULE_NOT_FOUND` for `./lib.js`.

- [ ] **Step 3: Implement `packages/query-domain/src/lib.ts`**

```ts
/**
 * Pure helpers for queryDomain search (query.domains).
 */

import { ArgumentError } from '@jackwener/opencli/errors';

export const DEFAULT_TLDS = [
  'com',
  'ai',
  'org',
  'net',
  'cn',
  'info',
  'app',
  'io',
  'xyz',
  'co',
  'run',
  'me',
  'pro',
  'top',
] as const;

export type DomainMeta = {
  existed: string;
  registered: string;
  expires: string;
  forSale: boolean;
};

export type DomainRow = {
  domain: string;
  year: string;
  dr: number | null;
  forSale: boolean;
  registered: string;
  expires: string;
  existed: string;
};

export type SseEvent = {
  event: string;
  data: {
    domain?: string;
    meta?: Record<string, unknown>;
  };
};

export function normalizeKeyword(raw: unknown): string {
  const s = String(raw ?? '').trim();
  if (!s) throw new ArgumentError('keyword is required');
  const label = s.split(/\s+/).join('').toLowerCase();
  if (!label) throw new ArgumentError('keyword is required');
  return label;
}

export function buildDomains(label: string): string[] {
  return DEFAULT_TLDS.map((tld) => `${label}.${tld}`);
}

export function formatDateYmd(raw: string | undefined | null): string {
  if (!raw || typeof raw !== 'string') return '';
  const m = raw.match(/^(\d{4}-\d{2}-\d{2})/);
  return m ? m[1] : '';
}

export function parseSseEvents(text: string): SseEvent[] {
  const events: SseEvent[] = [];
  const blocks = text.replace(/\r\n/g, '\n').split('\n\n');
  for (const block of blocks) {
    if (!block.trim()) continue;
    let event = 'message';
    const dataLines: string[] = [];
    for (const line of block.split('\n')) {
      if (line.startsWith('event:')) event = line.slice(6).trim();
      else if (line.startsWith('data:')) dataLines.push(line.slice(5).trim());
    }
    if (!dataLines.length) continue;
    try {
      const data = JSON.parse(dataLines.join('\n')) as SseEvent['data'];
      events.push({ event, data });
    } catch {
      // skip malformed chunks
    }
  }
  return events;
}

export function mergeCheckMeta(map: Map<string, DomainMeta>, ev: SseEvent): void {
  const domain = (
    ev.data.domain ||
    (ev.data.meta?.domain as string | undefined) ||
    (ev.data.meta?.id as string | undefined) ||
    ''
  )
    .toString()
    .toLowerCase();
  if (!domain || domain === '[done]') return;
  if (ev.event === '[DONE]') return;

  const prev =
    map.get(domain) ??
    ({
      existed: '',
      registered: '',
      expires: '',
      forSale: false,
    } satisfies DomainMeta);

  const meta = ev.data.meta ?? {};
  const existedRaw = meta.existed;
  if (typeof existedRaw === 'string' && existedRaw) {
    prev.existed = existedRaw.toLowerCase();
  }
  if (typeof meta.registered === 'string' && meta.registered) {
    prev.registered = meta.registered;
  }
  if (typeof meta.expires === 'string' && meta.expires) {
    prev.expires = meta.expires;
  }
  if (meta.market || meta.for_sale === true) {
    prev.forSale = true;
  }
  map.set(domain, prev);
}

export function toRows(
  domains: string[],
  metaMap: Map<string, DomainMeta>,
  drMap: Record<string, number>,
): DomainRow[] {
  return domains.map((domain) => {
    const meta = metaMap.get(domain);
    const registered = formatDateYmd(meta?.registered);
    const expires = formatDateYmd(meta?.expires);
    const year = registered ? registered.slice(0, 4) : '';
    const drVal = drMap[domain];
    return {
      domain,
      year,
      dr: typeof drVal === 'number' ? drVal : null,
      forSale: meta?.forSale ?? false,
      registered,
      expires,
      existed: meta?.existed ?? '',
    };
  });
}
```

Also create stub `packages/query-domain/src/search.ts` so build does not fail later:

```ts
import './lib.js';
// cli wired in Task 3
```

Update package.json build as locked above. Update `.gitignore` with `packages/query-domain/lib.js`.

For `lib.ts` esbuild: peer dep `@jackwener/opencli` must resolve — after `opencli plugin install` or workspace link. For unit tests locally:

```bash
cd packages/query-domain && npm install
# peer may need: npm install -D @jackwener/opencli
```

If ArgumentError import fails at build without peer installed, add to `devDependencies`: `"@jackwener/opencli": ">=1.8.6"` (same pattern as other packages relying on host link). Prefer matching google-trends: peer only + root/plugin install links host.

- [ ] **Step 4: Build + run tests — expect PASS**

```bash
cd /Users/coderlim/Projects/keyword-kits
npm install
npm run build -w opencli-plugin-query-domain
npm run test -w opencli-plugin-query-domain
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add packages/query-domain/src/lib.ts packages/query-domain/src/search.ts packages/query-domain/search.test.mjs packages/query-domain/package.json .gitignore
git commit -m "$(cat <<'EOF'
feat(query-domain): add keyword/SSE helpers with unit tests

EOF
)"
```

---

### Task 3: Wire fetch + `cli()` command

**Files:**
- Modify: `packages/query-domain/src/search.ts`

- [ ] **Step 1: Replace `src/search.ts` with full command**

```ts
/**
 * queryDomain search — keyword → domain list via query.domains PUBLIC SSE.
 *
 * Strategy: PUBLIC
 * Contract: upstream SSE JSON + /api/dr
 * Evidence:
 *   - UI: https://query.domains/ (keyword → label + default TLDs)
 *   - GET /api/upstream/check?domain=...&sse=true&return_dates=true&return-prices=true
 *   - GET /api/dr?domain=...
 * Browser: false
 */

import { CliError, EmptyResultError } from '@jackwener/opencli/errors';
import { cli, Strategy } from '@jackwener/opencli/registry';
import {
  buildDomains,
  mergeCheckMeta,
  normalizeKeyword,
  parseSseEvents,
  toRows,
  type DomainMeta,
} from './lib.js';

const CHECK_BASE = 'https://query.domains/api/upstream/check';
const DR_BASE = 'https://query.domains/api/dr';
const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

async function fetchCheckSse(domains: string[]): Promise<Map<string, DomainMeta>> {
  const url =
    `${CHECK_BASE}?domain=${encodeURIComponent(domains.join(','))}` +
    `&sse=true&return_dates=true&return-prices=true`;
  let resp: Response;
  try {
    resp = await fetch(url, {
      headers: {
        Accept: 'text/event-stream',
        'User-Agent': UA,
        Referer: 'https://query.domains/',
        Origin: 'https://query.domains',
      },
    });
  } catch (e) {
    throw new CliError(
      'FETCH_ERROR',
      `Network error: ${e instanceof Error ? e.message : String(e)}`,
      'Check your network connection',
    );
  }
  if (resp.status === 429) {
    throw new CliError(
      'RATE_LIMITED',
      'query.domains rate limit (429)',
      'Retry later, sign in, or upgrade to Pro on query.domains',
      75,
    );
  }
  if (!resp.ok) {
    throw new CliError('FETCH_ERROR', `HTTP ${resp.status}`, 'Retry later');
  }
  const text = await resp.text();
  const map = new Map<string, DomainMeta>();
  for (const ev of parseSseEvents(text)) {
    mergeCheckMeta(map, ev);
  }
  return map;
}

async function fetchDrMap(domains: string[]): Promise<Record<string, number>> {
  const url = `${DR_BASE}?domain=${encodeURIComponent(domains.join(','))}`;
  let resp: Response;
  try {
    resp = await fetch(url, {
      headers: {
        Accept: 'application/json',
        'User-Agent': UA,
        Referer: 'https://query.domains/',
      },
    });
  } catch (e) {
    throw new CliError(
      'FETCH_ERROR',
      `DR network error: ${e instanceof Error ? e.message : String(e)}`,
      'Check your network connection',
    );
  }
  if (resp.status === 429) {
    throw new CliError('RATE_LIMITED', 'query.domains DR rate limit (429)', 'Retry later', 75);
  }
  if (!resp.ok) {
    throw new CliError('FETCH_ERROR', `DR HTTP ${resp.status}`, 'Retry later');
  }
  const json = (await resp.json()) as { data?: Record<string, number> };
  return json.data && typeof json.data === 'object' ? json.data : {};
}

cli({
  site: 'queryDomain',
  name: 'search',
  access: 'read',
  description: 'Search query.domains for domains related to a keyword (default 14 TLDs)',
  domain: 'query.domains',
  strategy: Strategy.PUBLIC,
  browser: false,
  args: [
    {
      name: 'keyword',
      type: 'string',
      required: true,
      positional: true,
      help: 'Keyword(s), e.g. "ai image" → aiimage.{tld}',
    },
  ],
  columns: ['domain', 'year', 'dr', 'forSale', 'registered', 'expires', 'existed'],
  func: async (args) => {
    const label = normalizeKeyword(args.keyword);
    const domains = buildDomains(label);
    const metaMap = await fetchCheckSse(domains);
    const drMap = await fetchDrMap(domains);
    const rows = toRows(domains, metaMap, drMap);
    if (!rows.length) {
      throw new EmptyResultError('queryDomain search', `No domains for keyword "${label}"`);
    }
    return rows;
  },
});
```

- [ ] **Step 2: Build + unit tests**

```bash
npm run build:query-domain
npm run test -w opencli-plugin-query-domain
ls packages/query-domain/search.js packages/query-domain/lib.js
```

Expected: build ok, tests pass, both js files exist.

- [ ] **Step 3: Commit**

```bash
git add packages/query-domain/src/search.ts
git commit -m "$(cat <<'EOF'
feat(query-domain): wire PUBLIC SSE/DR fetch into queryDomain search

EOF
)"
```

---

### Task 4: Install plugin + smoke verify

**Files:** none (runtime)

- [ ] **Step 1: Install plugin**

```bash
cd /Users/coderlim/Projects/keyword-kits
npm install
npm run build
opencli plugin install file://$(pwd)/packages/query-domain
```

If already present: `opencli plugin update query-domain`

- [ ] **Step 2: Help**

```bash
opencli queryDomain --help
opencli queryDomain search --help
```

Expected: `search` listed; `keyword` positional documented.

- [ ] **Step 3: Smoke JSON**

```bash
opencli queryDomain search "ai image" -f json
```

Expected:
- Array length 14
- Contains `"domain":"aiimage.com"`
- Each object has keys: `domain`, `year`, `dr`, `forSale`, `registered`, `expires`, `existed`
- At least one non-empty `registered` / `year`

- [ ] **Step 4: Empty keyword error**

```bash
opencli queryDomain search "" -f json ; echo exit:$?
```

Expected: usage/argument error, non-zero exit (typically 2).

---

### Task 5: README

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Update README**

1. Intro table — add row for `packages/query-domain`：query.domains 关键词域名列表，`queryDomain search`，PUBLIC，无需 Chrome  
2. Install — add `opencli plugin install file://$(pwd)/packages/query-domain` and `github:CoderLim/keyword-kits/query-domain`  
3. Confirm / update / uninstall — include `query-domain` / `opencli queryDomain --help`  
4. 命令一览 — `| queryDomain search | query-domain | 关键词相关域名列表（固定 14 TLD） |`  
5. New section:

```markdown
## `queryDomain search`

按关键词查询 [query.domains](https://query.domains/) 首页同款域名列表（固定默认 14 个 TLD）。PUBLIC，无需 Chrome。

```bash
opencli queryDomain search "ai image"
opencli queryDomain search "ai image" -f json
```

| 参数 | 类型 | 说明 |
|------|------|------|
| `keyword` | string（位置） | 关键词；多词去空格拼接（`ai image` → `aiimage`） |

输出列：`domain`, `year`, `dr`, `forSale`, `registered`, `expires`, `existed`

遇 HTTP 429 时稍后重试，或在站点登录 / 升级 Pro。
```

6. Directory tree — add `packages/query-domain/` with `src/lib.ts`, `src/search.ts`

- [ ] **Step 2: Commit**

```bash
git add README.md
git commit -m "$(cat <<'EOF'
docs: document queryDomain search plugin

EOF
)"
```

---

## Spec coverage checklist

| Spec item | Task |
|-----------|------|
| `opencli queryDomain search <keyword>` | Task 3–4 |
| PUBLIC SSE + DR | Task 3 |
| Fixed 14 TLDs | Task 2 `DEFAULT_TLDS` |
| Columns domain/year/dr/forSale/registered/expires/existed | Task 2–3 |
| Keyword normalize concat | Task 2 |
| 429 typed error | Task 3 |
| Monorepo plugin wiring | Task 1 |
| README | Task 5 |
| Verify smoke | Task 4 |
| No `--tlds` / `--limit` | omitted by design |

## Self-review notes

- Helpers live in `lib.ts` so unit tests do not execute `cli()` side effects.
- `dr: 0` is valid; only missing key → `null`.
- `CliError` 4th parameter is `exitCode` (75 = TEMPFAIL) for 429.
- Compiled `search.js` / `lib.js` are gitignored like other packages.

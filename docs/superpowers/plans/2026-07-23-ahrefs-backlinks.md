# ahrefs backlinks Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver `opencli ahrefs backlinks <domain>` that returns `{ summary, links }` from Ahrefs’ free Backlink Checker (`mode=subdomains`).

**Architecture:** Extend existing `packages/ahrefs`. Add pure helpers (`normalizeDomain`, summary metric parsers) with TDD. Live recon on the free backlink-checker deep-link locks **one** strategy (`PUBLIC` if no-login API exists, else `UI`). Implement only that strategy in `backlinks.ts`, update build/README, smoke-test.

**Tech Stack:** TypeScript, esbuild, `@jackwener/opencli` registry, Node `node:test`, Chrome Bridge if UI.

**Spec:** `docs/superpowers/specs/2026-07-23-ahrefs-backlinks-design.md`

**Bias:** Free Ahrefs tools often gate XHR with captcha (see `ahrefs kd`). Default to **UI** unless Task 2 proves a stable no-login API.

---

## File map

| Path | Responsibility |
|------|----------------|
| `packages/ahrefs/src/lib.ts` | Add `normalizeDomain`, `parseCount`, `parsePercent`, `hasSummaryMetrics`, types |
| `packages/ahrefs/lib.test.mjs` | Extend unit tests for new helpers |
| `packages/ahrefs/src/backlinks.ts` | Strategy note + scrape/fetch + `cli()` |
| `packages/ahrefs/package.json` | Build script includes `backlinks.js`; update description |
| `packages/ahrefs/opencli-plugin.json` | Description mentions backlinks |
| `.gitignore` | Ignore `packages/ahrefs/backlinks.js` |
| `README.md` | Document `ahrefs backlinks` |

---

### Task 1: Helpers + tests (TDD) + build wire / stub

**Files:**
- Modify: `packages/ahrefs/src/lib.ts`
- Modify: `packages/ahrefs/lib.test.mjs`
- Create: `packages/ahrefs/src/backlinks.ts` (stub)
- Modify: `packages/ahrefs/package.json`
- Modify: `packages/ahrefs/opencli-plugin.json`
- Modify: `.gitignore`

- [ ] **Step 1: Append failing tests** to `packages/ahrefs/lib.test.mjs`

```js
import {
  normalizeCountry,
  normalizeDomain,
  normalizeKeyword,
  parseCount,
  parseKd,
  parsePercent,
  hasSummaryMetrics,
  toRows,
} from './lib.js';

// … keep existing suites …

describe('normalizeDomain', () => {
  it('strips protocol and path', () => {
    assert.equal(normalizeDomain('https://www.AhRefs.com/path?x=1'), 'www.ahrefs.com');
    assert.equal(normalizeDomain('ahrefs.com'), 'ahrefs.com');
  });
  it('rejects empty or invalid', () => {
    assert.throws(() => normalizeDomain(''), /domain/i);
    assert.throws(() => normalizeDomain('not a domain'), /domain/i);
    assert.throws(() => normalizeDomain('localhost'), /domain/i);
  });
});

describe('parseCount', () => {
  it('parses plain and abbreviated numbers', () => {
    assert.equal(parseCount('12345'), 12345);
    assert.equal(parseCount('12,345'), 12345);
    assert.equal(parseCount(100), 100);
  });
  it('rejects empty', () => {
    assert.throws(() => parseCount(''), /count|number/i);
    assert.throws(() => parseCount(null), /count|number/i);
  });
});

describe('parsePercent', () => {
  it('parses percent strings to number 0-100', () => {
    assert.equal(parsePercent('67.8%'), 67.8);
    assert.equal(parsePercent('72%'), 72);
    assert.equal(parsePercent(50), 50);
  });
  it('rejects out of range', () => {
    assert.throws(() => parsePercent('101%'), /percent/i);
    assert.throws(() => parsePercent(''), /percent/i);
  });
});

describe('hasSummaryMetrics', () => {
  it('true when any of dr/refDomains/backlinks is a finite number', () => {
    assert.equal(hasSummaryMetrics({ domain: 'x.com', dr: 10 }), true);
    assert.equal(hasSummaryMetrics({ domain: 'x.com', refDomains: 1 }), true);
    assert.equal(hasSummaryMetrics({ domain: 'x.com', backlinks: 2 }), true);
    assert.equal(hasSummaryMetrics({ domain: 'x.com' }), false);
  });
});
```

- [ ] **Step 2: Run tests — expect FAIL** (missing exports)

```bash
cd /Users/coderlim/Projects/keyword-kits
npm run test -w opencli-plugin-ahrefs
```

Expected: fail on missing `normalizeDomain` / `parseCount` / etc.

- [ ] **Step 3: Implement helpers in `packages/ahrefs/src/lib.ts`**

Append (keep existing kd helpers):

```ts
export type BacklinksSummary = {
  domain: string;
  dr?: number;
  refDomains?: number;
  refDomainsDofollowPct?: number;
  backlinks?: number;
  backlinksDofollowPct?: number;
};

export type BacklinksResult = {
  summary: BacklinksSummary;
  links: Record<string, unknown>[];
};

export function normalizeDomain(raw: unknown): string {
  const input = String(raw ?? '').trim();
  if (!input) throw new ArgumentError('domain is required');

  let host = input;
  try {
    if (/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(input)) {
      host = new URL(input).hostname;
    } else {
      host = input.split('/')[0]!.split('?')[0]!.split('#')[0]!;
    }
  } catch {
    throw new ArgumentError(`invalid domain: ${input}`);
  }

  host = host.trim().toLowerCase().replace(/\.$/, '');
  if (!host || !/^[a-z0-9.-]+$/.test(host) || !host.includes('.')) {
    throw new ArgumentError(`invalid domain: ${input}`);
  }
  return host;
}

export function parseCount(raw: unknown): number {
  if (raw === null || raw === undefined) {
    throw new ArgumentError('count is required');
  }
  if (typeof raw === 'number') {
    if (!Number.isFinite(raw) || raw < 0) {
      throw new ArgumentError(`invalid count: ${raw}`);
    }
    return Math.trunc(raw);
  }
  const text = String(raw).trim();
  if (!text) throw new ArgumentError('count is required');
  const cleaned = text.replace(/,/g, '').replace(/[^\d.]+/g, '');
  const n = Number(cleaned);
  if (!Number.isFinite(n) || n < 0) {
    throw new ArgumentError(`invalid count: ${raw}`);
  }
  return Math.trunc(n);
}

export function parsePercent(raw: unknown): number {
  if (raw === null || raw === undefined) {
    throw new ArgumentError('percent is required');
  }
  if (typeof raw === 'number') {
    if (!Number.isFinite(raw) || raw < 0 || raw > 100) {
      throw new ArgumentError(`percent must be 0-100 (got ${raw})`);
    }
    return raw;
  }
  const text = String(raw).trim().replace(/%/g, '');
  if (!text) throw new ArgumentError('percent is required');
  const n = Number(text);
  if (!Number.isFinite(n) || n < 0 || n > 100) {
    throw new ArgumentError(`percent must be 0-100 (got ${raw})`);
  }
  return n;
}

export function hasSummaryMetrics(summary: BacklinksSummary): boolean {
  return [summary.dr, summary.refDomains, summary.backlinks].some(
    (v) => typeof v === 'number' && Number.isFinite(v),
  );
}
```

- [ ] **Step 4: Create stub `packages/ahrefs/src/backlinks.ts`**

```ts
/**
 * ahrefs backlinks — stub. Strategy locked in Task 2; implementation in Task 3.
 */
import { cli, Strategy } from '@jackwener/opencli/registry';

cli({
  site: 'ahrefs',
  name: 'backlinks',
  access: 'read',
  description: 'Check Ahrefs free Backlink Checker (DR + backlinks, mode=subdomains)',
  strategy: Strategy.UI,
  browser: true,
  domain: 'ahrefs.com',
  args: [
    {
      name: 'domain',
      type: 'string',
      required: true,
      positional: true,
      help: 'Target domain (e.g. ahrefs.com)',
    },
  ],
  columns: ['summary', 'links'],
  func: async () => {
    throw new Error('ahrefs backlinks not implemented yet');
  },
});
```

- [ ] **Step 5: Wire build + gitignore + plugin description**

Update `packages/ahrefs/package.json` scripts.build to also emit `backlinks.js`:

```json
"build": "npx esbuild src/lib.ts --outfile=lib.js --format=esm --platform=node && npx esbuild src/kd.ts --bundle --outfile=kd.js --format=esm --platform=node --packages=external && npx esbuild src/backlinks.ts --bundle --outfile=backlinks.js --format=esm --platform=node --packages=external",
"test": "npm run build && node --test lib.test.mjs"
```

Update description to mention backlinks.  
Update `packages/ahrefs/opencli-plugin.json` description similarly.  
Append to `.gitignore`:

```
packages/ahrefs/backlinks.js
```

- [ ] **Step 6: Run tests — expect PASS**

```bash
npm run test -w opencli-plugin-ahrefs
```

- [ ] **Step 7: Commit**

```bash
git add packages/ahrefs/src/lib.ts packages/ahrefs/lib.test.mjs packages/ahrefs/src/backlinks.ts packages/ahrefs/package.json packages/ahrefs/opencli-plugin.json .gitignore
git commit -m "$(cat <<'EOF'
feat(ahrefs): add backlinks helpers and command stub

EOF
)"
```

---

### Task 2: Site recon — lock strategy

**Files:**
- Modify: `packages/ahrefs/src/backlinks.ts` (strategy note + strategy/browser flags)

- [ ] **Step 1: Doctor**

```bash
opencli doctor
```

- [ ] **Step 2: Live recon**

Deep-link sample:

```
https://ahrefs.com/backlink-checker/?input=ahrefs.com&mode=subdomains
```

Use `opencli browser` (or equivalent) to:

1. Open deep-link; dismiss CookieYes if present
2. Capture Network for KD/backlink JSON endpoints; note captcha / auth
3. Record DOM for: DR, referring domains (+ dofollow %), backlinks (+ dofollow %), table columns
4. Confirm login wall / challenge text patterns

- [ ] **Step 3: Lock exactly one strategy**

| Outcome | Lock |
|---------|------|
| Stable no-login API → summary + links | **PUBLIC** |
| Otherwise (incl. captcha) | **UI** |

Rewrite top-of-file strategy note with concrete Evidence (URLs, selectors, or API shapes). Update `cli()` `strategy` / `browser` to match. Keep `func` stub throwing until Task 3.

Also lock the **stable `links[]` field names** discovered on the page (write them in the note).

- [ ] **Step 4: Commit**

```bash
git add packages/ahrefs/src/backlinks.ts
git commit -m "$(cat <<'EOF'
docs(ahrefs): lock backlinks strategy from free-tool recon

EOF
)"
```

---

### Task 3: Implement `backlinks` (PUBLIC **or** UI — only one)

**Files:**
- Modify: `packages/ahrefs/src/backlinks.ts`

Implement **exactly** the strategy locked in Task 2. Delete the unused branch.

#### Shared return contract

```ts
import {
  ArgumentError,
  CommandExecutionError,
  EmptyResultError,
  TimeoutError,
} from '@jackwener/opencli/errors';
import { cli, Strategy } from '@jackwener/opencli/registry';
import {
  hasSummaryMetrics,
  normalizeDomain,
  parseCount,
  parsePercent,
  type BacklinksResult,
  type BacklinksSummary,
} from './lib.js';

const PAGE_URL = 'https://ahrefs.com/backlink-checker';
const MODE = 'subdomains';
const LOAD_TIMEOUT_SEC = 90;

function buildDeepLink(domain: string): string {
  return (
    `${PAGE_URL}/?input=${encodeURIComponent(domain)}` +
    `&mode=${encodeURIComponent(MODE)}`
  );
}
```

`func` must `return` a **single** `BacklinksResult` object (not an array). If opencli table formatting breaks, still prefer object for `-f json` (spec).

Empty rule: if `!hasSummaryMetrics(summary)` → `EmptyResultError`; empty `links` is OK.

#### If UI (likely)

- Prefer `page.newTab(buildDeepLink(domain))` + CookieYes dismiss (reuse pattern from `kd.ts`)
- Poll until summary metrics visible OR auth/challenge/timeout
- Extract summary via `page.evaluate` → JSON
- Extract all visible table rows (no `--limit`) → `links`
- Map text through `parseCount` / `parsePercent` where applicable; `dr` via integer 0–100 (reuse `parseKd` only if it fits; otherwise a local `parseDr`)

#### If PUBLIC

- Call discovered endpoint with domain + mode
- Map JSON → `BacklinksResult`
- Handle 429 / 401 / 403 as in kd plan (`CommandExecutionError`)

- [ ] **Step 1: Implement full `backlinks.ts`**
- [ ] **Step 2: Build**

```bash
npm run build -w opencli-plugin-ahrefs
npm run test -w opencli-plugin-ahrefs
```

- [ ] **Step 3: Commit**

```bash
git add packages/ahrefs/src/backlinks.ts
git commit -m "$(cat <<'EOF'
feat(ahrefs): implement backlinks against free Backlink Checker

EOF
)"
```

---

### Task 4: Install + smoke verify

**Files:** none unless fixes needed

- [ ] **Step 1: Update plugin**

```bash
cd /Users/coderlim/Projects/keyword-kits
npm run build -w opencli-plugin-ahrefs
opencli plugin update ahrefs || opencli plugin install file://$(pwd)/packages/ahrefs
opencli plugin list
```

- [ ] **Step 2: Help**

```bash
opencli ahrefs backlinks --help
```

Expected: positional `domain`; description mentions Backlink Checker / DR.

- [ ] **Step 3: Happy path**

```bash
OPENCLI_BROWSER_COMMAND_TIMEOUT=180 opencli ahrefs backlinks ahrefs.com -f json
```

Expected shape:

```json
{
  "summary": {
    "domain": "ahrefs.com",
    "dr": 90
  },
  "links": []
}
```

(`dr` / counts / `links` values vary; at least one of dr/refDomains/backlinks present; `links` is an array.)

- [ ] **Step 4: Argument error**

```bash
opencli ahrefs backlinks "" -f json ; echo exit:$?
opencli ahrefs backlinks "not a domain" -f json ; echo exit:$?
```

Expected: non-zero; message mentions domain.

- [ ] **Step 5: Commit only if fixes were needed**

---

### Task 5: README

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Update**

1. Plugin table row: mention free backlinks in addition to KD  
2. Command table: `| ahrefs backlinks | ahrefs | 免费 Backlink Checker（DR + 外链） |`  
3. New section `## ahrefs backlinks`:
   - deep-link with `mode=subdomains`
   - usage + recommend `-f json`
   - summary fields + note that `links` columns follow page
   - no `--limit` / no `--mode`
   - Chrome + timeout if UI
4. Directory structure: `src/backlinks.ts` / `backlinks.js`
5. Troubleshooting: same as kd (challenge / login wall / CookieYes / timeout)
6. Design doc links

- [ ] **Step 2: Commit**

```bash
git add README.md
git commit -m "$(cat <<'EOF'
docs: document opencli ahrefs backlinks

EOF
)"
```

---

## Spec coverage checklist

| Spec requirement | Task |
|------------------|------|
| `opencli ahrefs backlinks` in `packages/ahrefs` | 1, 3 |
| Free tool / no paid account | 2–3 |
| Fixed `mode=subdomains` | 3 |
| No `--limit` | 3–5 |
| Output `{ summary, links }` | 3–4 |
| Visible list columns from recon | 2–3 |
| Typed errors | 3 |
| README | 5 |

---

## Self-review notes

- Recon gates Task 3 — do not invent API fields; lock names in Task 2 note.
- Prefer returning a single object for `-f json` per spec; document table limitation.
- Reuse CookieYes / newTab patterns from `packages/ahrefs/src/kd.ts`.
- `normalizeDomain` mirrors `sim` behavior for consistency.

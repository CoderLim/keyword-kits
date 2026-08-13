/**
 * sim backlinks — list reverse links for a domain on sim.3ue.com (SimilarWeb).
 *
 * Strategy note:
 *   Strategy: UI
 *   Contract: visible-ui
 *   Evidence:
 *   - observed request/state: ant-table rows with data-automation-field
 *     UrlFrom / Anchor / Rank / DomainScore / UrlTo / FirstSeen / LastVisited.
 *     The first column's data-automation-field is the 0-based row index ("0","1",…),
 *     not a stable column id — read rank from the first td text instead.
 *     Page URL:
 *     /#/digitalsuite/acquisition/backlinks/table/999/?duration=28d&key={domain}&sort=DomainScore&status=Active[&follow=DoFollowOnly|NoFollowOnly]
 *     Row React record has no Follow/IsDoFollow field (2026-08-03); page-level
 *     filter only via `follow=` / data-automation backlinks-table-filter-*.
 *     Underlying JSON at pro.similarweb.com/api/backlinks/backlinks is blocked for
 *     PAGE_FETCH by GMITM (fetch wasm crash / XHR 405); CDP network capture empty.
 *   - auth source: Chrome session cookies on sim.3ue.com (GMITM_*)
 *   - replay result: UI scrape works; must open via page.newTab (same-origin hash
 *     goto does not remount the SPA). Return JSON.stringify from page.evaluate.
 */

import {
  ArgumentError,
  AuthRequiredError,
  CommandExecutionError,
  EmptyResultError,
  TimeoutError,
} from '@jackwener/opencli/errors';
import { cli, Strategy } from '@jackwener/opencli/registry';
import {
  DEFAULT_BACKLINKS_LIMIT,
  MAX_BACKLINKS_LIMIT,
  normalizeBacklinksLimit,
} from './lib/backlinks-limit.js';
import {
  BACKLINKS_NEXT_SELECTOR,
  appendUniqueRows,
  backlinkIdentity,
  parseHasNextState,
  rowsFingerprint,
} from './lib/backlinks-pagination.js';
import {
  dofollowToFollowParam,
  normalizeDofollow,
} from './lib/dofollow.js';

const SITE_ORIGIN = 'https://sim.3ue.com';
const LOAD_TIMEOUT_SEC = 90;
const PAGE_CHANGE_TIMEOUT_SEC = 30;

const COLUMNS = [
  'rank',
  'sourceTitle',
  'sourceUrl',
  'anchor',
  'impact',
  'domainScore',
  'targetUrl',
  'firstSeen',
  'lastSeen',
] as const;

type BacklinkRow = {
  rank: number;
  sourceTitle: string;
  sourceUrl: string;
  anchor: string;
  impact: number;
  domainScore: number;
  targetUrl: string;
  firstSeen: string;
  lastSeen: string;
};

/** Strip protocol/path/query; keep host (lowercase). */
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

export function buildBacklinksUrl(
  domain: string,
  follow?: string,
): string {
  const qs = new URLSearchParams({
    duration: '28d',
    key: domain,
    sort: 'DomainScore',
    status: 'Active',
  });
  if (follow) qs.set('follow', follow);
  qs.set('_', String(Date.now()));
  return `${SITE_ORIGIN}/#/digitalsuite/acquisition/backlinks/table/999/?${qs.toString()}`;
}

const PAGE_STATUS_JS = `(() => {
  const text = document.body?.innerText || '';
  const dataRows = document.querySelectorAll('.ant-table-row [data-automation-field="UrlFrom"]');
  if (dataRows.length >= 5) return 'ready';

  if (/请登录|登录后|Sign in|Log in/i.test(text) && dataRows.length === 0) {
    return 'auth';
  }
  if (/额，出错了|Something went wrong|failed to load/i.test(text) && dataRows.length === 0) {
    return 'error';
  }
  if (dataRows.length > 0) return 'hydrating';
  return 'loading';
})()`;

const EXTRACT_ROWS_JS = `(() => {
  const rows = [];
  for (const tr of document.querySelectorAll('.ant-table-row')) {
    const cell = (field) => tr.querySelector('[data-automation-field="' + field + '"]');
    const textOf = (field) => (cell(field)?.innerText || '').trim();
    const urlFromEl = cell('UrlFrom');
    if (!urlFromEl) continue;

    const rank = Number((tr.querySelector('td')?.innerText || '').trim());
    if (!Number.isFinite(rank) || rank < 1) continue;

    const titleLines = textOf('UrlFrom').split('\\n').map((s) => s.trim()).filter(Boolean);
    const sourceTitle = titleLines[0] || '';
    const sourceUrl = urlFromEl.querySelector('a[href]')?.href
      || titleLines.find((l) => /^https?:\\/\\//i.test(l))
      || '';

    const urlToText = textOf('UrlTo');
    const targetUrl = (urlToText.split('\\n').map((s) => s.trim()).find((l) => /^https?:\\/\\//i.test(l)) || '')
      .replace(/\\s*新\\s*$/, '')
      .trim();

    rows.push({
      rank,
      sourceTitle,
      sourceUrl,
      anchor: textOf('Anchor'),
      impact: Number(String(textOf('Rank')).replace(/[^0-9.-]/g, '')) || 0,
      domainScore: Number(String(textOf('DomainScore')).replace(/[^0-9.-]/g, '')) || 0,
      targetUrl,
      firstSeen: textOf('FirstSeen'),
      lastSeen: textOf('LastVisited'),
    });
  }
  return JSON.stringify(rows);
})()`;

const PAGINATION_STATE_JS = `(() => {
  const next = document.querySelector(${JSON.stringify(BACKLINKS_NEXT_SELECTOR)});
  const button = next?.matches('button, a') ? next : next?.querySelector('button, a');
  const disabled = !next
    || next.getAttribute('data-automation-pagination-control-disabled') === 'true'
    || next.getAttribute('aria-disabled') === 'true'
    || next.classList.contains('ant-pagination-disabled')
    || !!button?.disabled;
  return JSON.stringify({ hasNext: !disabled });
})()`;

const CLICK_NEXT_JS = `(() => {
  const next = document.querySelector(${JSON.stringify(BACKLINKS_NEXT_SELECTOR)});
  const button = next?.matches('button, a') ? next : next?.querySelector('button, a');
  if (
    !next
    || next.getAttribute('data-automation-pagination-control-disabled') === 'true'
    || next.getAttribute('aria-disabled') === 'true'
    || next.classList.contains('ant-pagination-disabled')
    || !!button?.disabled
  ) return false;
  (button || next).click();
  return true;
})()`;

function parseRowsPayload(raw: unknown): BacklinkRow[] {
  try {
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    throw new CommandExecutionError('Failed to parse backlinks table payload');
  }
}

async function extractRows(page: { evaluate: (js: string) => Promise<unknown> }): Promise<BacklinkRow[]> {
  return parseRowsPayload(await page.evaluate(EXTRACT_ROWS_JS));
}

async function hasNextPage(page: { evaluate: (js: string) => Promise<unknown> }): Promise<boolean> {
  try {
    return parseHasNextState(await page.evaluate(PAGINATION_STATE_JS));
  } catch (error) {
    const detail = error instanceof Error ? `: ${error.message}` : '';
    throw new CommandExecutionError(`Failed to read backlinks pagination state${detail}`);
  }
}

async function waitForChangedRows(
  page: {
    evaluate: (js: string) => Promise<unknown>;
    wait: (seconds: number) => Promise<void>;
  },
  previousFingerprint: string,
  domain: string,
): Promise<BacklinkRow[] | null> {
  const deadline = Date.now() + PAGE_CHANGE_TIMEOUT_SEC * 1000;
  while (Date.now() < deadline) {
    const status = String(await page.evaluate(PAGE_STATUS_JS));
    if (status === 'auth') {
      throw new AuthRequiredError(
        'sim.3ue.com',
        'Not logged in to sim.3ue.com — open Chrome and sign in first',
      );
    }
    if (status === 'error') {
      throw new CommandExecutionError(`Backlinks pagination failed for ${domain}.`);
    }
    if (status === 'ready' || status === 'hydrating') {
      const rows = await extractRows(page);
      if (rows.length > 0 && rowsFingerprint(rows, backlinkIdentity) !== previousFingerprint) {
        return rows;
      }
    }
    await page.wait(0.25);
  }
  return null;
}

cli({
  site: 'sim',
  name: 'backlinks',
  access: 'read',
  description: '查看网站反向链接（SimilarWeb / sim.3ue.com，默认 Active + DomainScore）',
  domain: 'sim.3ue.com',
  strategy: Strategy.UI,
  browser: true,
  args: [
    {
      name: 'domain',
      type: 'string',
      required: true,
      positional: true,
      help: '目标域名（如 stripe.com）',
    },
    {
      name: 'limit',
      type: 'int',
      default: DEFAULT_BACKLINKS_LIMIT,
      help: `返回条数（1-${MAX_BACKLINKS_LIMIT}，默认 ${DEFAULT_BACKLINKS_LIMIT}）`,
    },
    {
      name: 'dofollow',
      type: 'string',
      default: 'all',
      help: '链接属性筛选：true（DoFollow）、false（NoFollow）、all（默认，全部）',
    },
  ],
  columns: [...COLUMNS],
  func: async (page, kwargs) => {
    const domain = normalizeDomain(kwargs.domain);
    const limit = normalizeBacklinksLimit(kwargs.limit);
    const dofollowFilter = normalizeDofollow(kwargs.dofollow);
    const url = buildBacklinksUrl(domain, dofollowToFollowParam(dofollowFilter));

    if (typeof page.newTab === 'function' && typeof page.selectTab === 'function') {
      const tabId = await page.newTab(url);
      if (tabId) await page.selectTab(tabId);
    } else {
      await page.goto(url);
    }

    let status = 'loading';
    let refreshed = false;
    let hydratingSince = 0;
    const deadline = Date.now() + LOAD_TIMEOUT_SEC * 1000;
    while (Date.now() < deadline) {
      status = String(await page.evaluate(PAGE_STATUS_JS));
      if (status === 'ready' || status === 'auth') break;
      if (status === 'hydrating') {
        if (!hydratingSince) hydratingSince = Date.now();
        if (Date.now() - hydratingSince > 3000) {
          status = 'ready';
          break;
        }
      }
      if (status === 'error' && !refreshed) {
        refreshed = true;
        await page.evaluate(`(() => {
          const btn = [...document.querySelectorAll('button')]
            .find((b) => /刷新|Refresh|Retry/i.test(b.textContent || ''));
          btn?.click();
        })()`);
      }
      await page.wait(0.5);
    }

    if (status === 'auth') {
      throw new AuthRequiredError('sim.3ue.com', 'Not logged in to sim.3ue.com — open Chrome and sign in first');
    }
    if (status === 'error') {
      throw new CommandExecutionError(
        `Backlinks page failed to load for ${domain}. Try refreshing in the browser.`,
      );
    }
    if (status !== 'ready') {
      throw new TimeoutError(`sim backlinks (${domain})`, LOAD_TIMEOUT_SEC);
    }

    let pageRows = await extractRows(page);

    if (pageRows.length === 0) {
      throw new EmptyResultError('sim backlinks', `No active backlinks found for ${domain}`);
    }

    const accumulated: BacklinkRow[] = [];
    const seen = new Set<string>();
    const seenPageFingerprints = new Set<string>();

    for (let pageIndex = 0; pageIndex < MAX_BACKLINKS_LIMIT; pageIndex++) {
      const currentFingerprint = rowsFingerprint(pageRows, backlinkIdentity);
      if (seenPageFingerprints.has(currentFingerprint)) break;
      seenPageFingerprints.add(currentFingerprint);

      appendUniqueRows(accumulated, seen, pageRows, backlinkIdentity, limit);
      if (accumulated.length >= limit || !(await hasNextPage(page))) break;

      const clicked = await page.evaluate(CLICK_NEXT_JS);
      if (!(clicked === true || clicked === 'true')) break;

      const nextRows = await waitForChangedRows(page, currentFingerprint, domain);
      if (!nextRows) break;
      pageRows = nextRows;
    }

    return accumulated.slice(0, limit);
  },
});

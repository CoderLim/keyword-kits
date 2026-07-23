/**
 * sim landing-pages — organic landing pages for a domain on sim.3ue.com.
 *
 * Strategy note:
 *   Strategy: UI
 *   Contract: visible-ui
 *   Evidence:
 *   - Page: organicsearch/pageAnalysis/landing-pages-v2 (28d, Organic tab)
 *   - Table: .organic-landing-pages-table (SWReact column layout)
 *   - API: /api/websiteOrganicLandingPagesV2 (GMITM blocks PAGE_FETCH; interceptor empty)
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
import {
  DEFAULT_LIMIT,
  LOAD_TIMEOUT_SEC,
  MAX_LIMIT,
  normalizeDomain,
  normalizeLimit,
  openDeepLink,
  parseJsonRows,
  waitForPageStatus,
} from './lib/utils.js';

/** Map CLI --change values to SimilarWeb `Change=` query param. */
const CHANGE_FILTERS: Record<string, string> = {
  new: 'New',
  '新点击量': 'New',
};

/** Normalize --change; empty / all means no filter. */
export function normalizeChange(raw: unknown): string | undefined {
  const input = String(raw ?? '').trim();
  if (!input || input === 'all' || input === '全部') return undefined;
  const key = input.toLowerCase() === 'new' ? 'new' : input;
  const mapped = CHANGE_FILTERS[key] ?? CHANGE_FILTERS[input];
  if (!mapped) {
    throw new ArgumentError(
      `unknown change filter "${input}". Supported: new (新点击量), all (全部)`,
    );
  }
  return mapped;
}

const COLUMNS = [
  'rank',
  'url',
  'clicks',
  'clicksShare',
  'change',
  'keywords',
  'topKeyword',
  'serpFeatures',
] as const;

type LandingPageRow = {
  rank: number;
  url: string;
  clicks: string;
  clicksShare: string;
  change: string;
  keywords: number;
  topKeyword: string;
  serpFeatures: string;
};

function buildLandingPagesUrl(domain: string, change?: string): string {
  const pageFilter = JSON.stringify([{ url: domain, searchType: 'domain' }]);
  const qs = new URLSearchParams({
    key: domain,
    pageFilter,
    webSource: 'Total',
    selectedPageTab: 'Organic',
    _: String(Date.now()),
  });
  if (change) qs.set('Change', change);
  return `https://sim.3ue.com/#/organicsearch/pageAnalysis/landing-pages-v2/*/999/28d?${qs.toString()}`;
}

const PAGE_STATUS_JS = `(() => {
  const text = document.body?.innerText || '';
  const urlCells = document.querySelectorAll('.organic-landing-pages-table .url-cell');
  if (urlCells.length >= 5) return 'ready';

  if (/请登录|登录后|Sign in|Log in/i.test(text) && urlCells.length === 0) {
    return 'auth';
  }
  if (/额，出错了|Something went wrong|failed to load/i.test(text) && urlCells.length === 0) {
    return 'error';
  }
  if (urlCells.length > 0) return 'hydrating';
  return 'loading';
})()`;

const EXTRACT_ROWS_JS = `(() => {
  const table = document.querySelector('.organic-landing-pages-table');
  if (!table) return JSON.stringify([]);

  const columns = [...table.querySelectorAll('.swReactTable-column, .swReactTable-unResizeColumn')]
    .map((col) => [...col.querySelectorAll('.swReactTableCell')])
    .filter((cells) => cells.length >= 5);
  if (columns.length < 3) return JSON.stringify([]);

  const cellText = (cell) => (cell?.innerText || '').trim();

  // Identify columns by first-row content / class (header row lives elsewhere).
  let rankCol = -1;
  let urlCol = -1;
  let clicksCol = -1;
  let changeCol = -1;
  let keywordsCol = -1;
  let topKeywordCol = -1;
  let serpCol = -1;

  columns.forEach((cells, i) => {
    const t0 = cellText(cells[0]);
    const cls0 = cells[0]?.className || '';
    if (urlCol < 0 && /url-cell/.test(cls0)) {
      urlCol = i;
      return;
    }
    if (rankCol < 0 && /^\\d+$/.test(t0)) {
      rankCol = i;
      return;
    }
    if (clicksCol < 0 && /\\d/.test(t0) && /%/.test(t0) && /\\n/.test(cells[0]?.innerText || '')) {
      clicksCol = i;
      return;
    }
    if (changeCol < 0 && (/^[+-]?\\d+(\\.\\d+)?%$/.test(t0.replace(/\\s/g, '')) || /^新/.test(t0))) {
      changeCol = i;
      return;
    }
    if (keywordsCol < 0 && /所有关键词|keywords/i.test(t0)) {
      keywordsCol = i;
      return;
    }
  });

  // Remaining text-ish columns: topKeyword then serpFeatures by order after keywords.
  columns.forEach((cells, i) => {
    if ([rankCol, urlCol, clicksCol, changeCol, keywordsCol].includes(i)) return;
    const t0 = cellText(cells[0]);
    if (t0 === '查看趋势' || t0 === '') return;
    if (topKeywordCol < 0 && t0 && t0 !== '-') {
      topKeywordCol = i;
      return;
    }
    if (serpCol < 0) serpCol = i;
  });

  const rowCount = Math.min(...columns.map((c) => c.length));
  const rows = [];
  for (let r = 0; r < rowCount; r++) {
    const rank = Number(cellText(columns[rankCol]?.[r]));
    if (!Number.isFinite(rank) || rank < 1) continue;

    const url = cellText(columns[urlCol]?.[r]).split('\\n')[0].trim();
    if (!url) continue;

    const clicksRaw = cellText(columns[clicksCol]?.[r]);
    const clicksLines = clicksRaw.split('\\n').map((s) => s.trim()).filter(Boolean);

    const keywordsRaw = cellText(columns[keywordsCol]?.[r]);
    const keywords = Number(String(keywordsRaw).split('\\n')[0].replace(/[^0-9]/g, '')) || 0;

    rows.push({
      rank,
      url,
      clicks: clicksLines[0] || '',
      clicksShare: clicksLines[1] || '',
      change: cellText(columns[changeCol]?.[r]),
      keywords,
      topKeyword: cellText(columns[topKeywordCol]?.[r]),
      serpFeatures: cellText(columns[serpCol]?.[r]),
    });
  }
  return JSON.stringify(rows);
})()`;

cli({
  site: 'sim',
  name: 'landing-pages',
  access: 'read',
  description: '查看网站自然着陆页（默认新点击量 Change=New，Organic + 28d）',
  domain: 'sim.3ue.com',
  strategy: Strategy.UI,
  browser: true,
  args: [
    {
      name: 'domain',
      type: 'string',
      required: true,
      positional: true,
      help: '目标域名（如 pollo.ai）',
    },
    {
      name: 'limit',
      type: 'int',
      default: DEFAULT_LIMIT,
      help: `返回条数（1-${MAX_LIMIT}，默认 ${DEFAULT_LIMIT}）`,
    },
    {
      name: 'change',
      type: 'string',
      default: 'new',
      help: '点击量变化：new（新点击量，默认）/ all（全部）',
    },
  ],
  columns: [...COLUMNS],
  func: async (page, kwargs) => {
    const domain = normalizeDomain(kwargs.domain);
    const limit = normalizeLimit(kwargs.limit, DEFAULT_LIMIT);
    const change = normalizeChange(kwargs.change);
    const url = buildLandingPagesUrl(domain, change);

    await openDeepLink(page, url);

    const status = await waitForPageStatus(page, PAGE_STATUS_JS, LOAD_TIMEOUT_SEC);

    if (status === 'auth') {
      throw new AuthRequiredError('sim.3ue.com', 'Not logged in to sim.3ue.com — open Chrome and sign in first');
    }
    if (status === 'error') {
      throw new CommandExecutionError(
        `Landing pages failed to load for ${domain}. Try refreshing in the browser.`,
      );
    }
    if (status !== 'ready') {
      throw new TimeoutError(`sim landing-pages (${domain})`, LOAD_TIMEOUT_SEC);
    }

    const rows = parseJsonRows<LandingPageRow>(
      await page.evaluate(EXTRACT_ROWS_JS),
      'landing-pages',
    );

    if (rows.length === 0) {
      const filterHint = change ? ` with Change=${change}` : '';
      throw new EmptyResultError(
        'sim landing-pages',
        `No organic landing pages found for ${domain}${filterHint}`,
      );
    }

    return rows.slice(0, limit);
  },
});

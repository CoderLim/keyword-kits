/**
 * sim web-ranking — Category Leaders Search Organic site ranking on sim.3ue.com.
 *
 * Strategy note:
 *   Strategy: UI
 *   Contract: visible-ui
 *   Evidence: see docs/superpowers/specs/2026-07-24-sim-web-ranking-recon-notes.md
 *   - Page: digitalsuite/markets/webmarketanalysis/rankings/{industry}/999/1m
 *   - Fixed: selectedTab=CategoryLeadersSearch, Organic (CLICK_REQUIRED), 1m, webSource=Total
 *   - Sort: CLICK_HEADER_REQUIRED (SORT_VIA_URL=false)
 *   - auth: Chrome session on sim.3ue.com
 *   - Must open via page.newTab; return JSON.stringify from evaluate
 */

import {
  AuthRequiredError,
  CommandExecutionError,
  EmptyResultError,
  TimeoutError,
} from '@jackwener/opencli/errors';
import { cli, Strategy } from '@jackwener/opencli/registry';
import { resolveIndustryId } from './lib/web-ranking-industry.js';
import {
  buildWebRankingUrl,
  normalizeSort,
  SORT_VIA_URL,
  type WebRankingSort,
} from './lib/web-ranking-url.js';
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
  adsense: boolean;
};

const PAGE_STATUS_JS = `(() => {
  const text = document.body?.innerText || '';
  const cells = document.querySelectorAll('[data-automation-column-key="Domain"]');
  if (cells.length >= 5) return 'ready';

  if (/请登录|登录后|Sign in|Log in/i.test(text) && cells.length === 0) {
    return 'auth';
  }
  if (
    /额，出错了|Something went wrong|请尝试刷新页面|failed to load/i.test(text) &&
    cells.length === 0
  ) {
    return 'error';
  }
  if (cells.length > 0) return 'hydrating';
  return 'loading';
})()`;

const EXTRACT_ROWS_JS = `(() => {
  const table = document.querySelector('.swReactTable-wrapper');
  if (!table) return JSON.stringify([]);

  const columns = [...table.querySelectorAll('.swReactTable-column, .swReactTable-unResizeColumn')]
    .map((col) => [...col.querySelectorAll('.swReactTableCell')])
    .filter((cells) => cells.length >= 5);
  if (columns.length < 3) return JSON.stringify([]);

  const byKey = {};
  let rankCol = null;
  columns.forEach((cells) => {
    const key = cells[0]?.getAttribute('data-automation-column-key');
    if (key) {
      byKey[key] = cells;
      return;
    }
    const t0 = (cells[0]?.innerText || '').trim();
    if (!rankCol && /^\\d+$/.test(t0)) rankCol = cells;
  });

  const domainCol = byKey.Domain;
  const shareCol = byKey.Share;
  const changeCol = byKey.MoMChange;
  const categoryCol = byKey.Category;
  const visitsCol = byKey.AvgMonthVisits;
  const adsenseCol = byKey.HasAdsense;
  if (!rankCol || !domainCol || !shareCol || !changeCol || !categoryCol || !visitsCol || !adsenseCol) {
    return JSON.stringify([]);
  }

  const rowCount = Math.min(
    rankCol.length,
    domainCol.length,
    shareCol.length,
    changeCol.length,
    categoryCol.length,
    visitsCol.length,
    adsenseCol.length,
  );

  const rows = [];
  for (let r = 0; r < rowCount; r++) {
    const rank = Number((rankCol[r].innerText || '').trim());
    if (!Number.isFinite(rank) || rank < 1) continue;

    const domain =
      (domainCol[r].querySelector('[data-automation="domain-name"]')?.innerText || '').trim() ||
      (domainCol[r].innerText || '').trim();
    if (!domain) continue;

    let change = (changeCol[r].innerText || '').trim();
    const pct = changeCol[r].querySelector('.changePercentage');
    if (pct?.classList.contains('positive')) {
      if (!change.startsWith('+')) change = '+' + change;
    } else if (pct?.classList.contains('negative')) {
      if (!change.startsWith('-')) change = '-' + change;
    }

    const industry =
      (categoryCol[r].querySelector('.change-color-on-hover')?.innerText || '').trim() ||
      (categoryCol[r].innerText || '').trim().split('\\n')[0].trim();

    rows.push({
      rank,
      domain,
      trafficShare: (shareCol[r].innerText || '').trim(),
      change,
      industry,
      monthlyVisits: (visitsCol[r].innerText || '').trim(),
      adsense: !!adsenseCol[r].querySelector('.sw-icon-checkmark_circle'),
    });
  }
  return JSON.stringify(rows);
})()`;

/** Organic is CLICK_REQUIRED — never in URL. Split opens vs option click. */
const ORGANIC_CHIP_PRESENT_JS = `(() => {
  const chip =
    document.querySelector('[data-automation="chip-item chip-item-自然"]') ||
    [...document.querySelectorAll('[data-automation="simple-chip-item"]')].find(
      (el) => (el.innerText || '').trim() === '自然',
    );
  return chip ? 'yes' : 'no';
})()`;

/** Eval A: already organic → ok; else open chipdown → opened | missing. */
const OPEN_ORGANIC_CHIPDOWN_JS = `(() => {
  const organicChip =
    document.querySelector('[data-automation="chip-item chip-item-自然"]') ||
    [...document.querySelectorAll('[data-automation="simple-chip-item"]')].find(
      (el) => (el.innerText || '').trim() === '自然',
    );
  if (organicChip) return 'ok';

  const top = document.querySelector('[data-automation="category-leaders-table-top"]');
  const chipdown = top?.querySelector('[data-automation="chipdown-no-border-button"]');
  if (!chipdown) return 'missing';
  chipdown.click();
  return 'opened';
})()`;

const POPUP_PRESENT_JS = `(() => {
  return document.querySelector('[data-automation="pop-up-content"]') ? 'yes' : 'no';
})()`;

/** Eval B: click popup row whose visible text is exactly 自然. */
const CLICK_ORGANIC_OPTION_JS = `(() => {
  const popup = document.querySelector('[data-automation="pop-up-content"]');
  if (!popup) return 'missing';

  const options = [...popup.querySelectorAll('*')].filter(
    (el) => (el.innerText || '').trim() === '自然',
  );
  const option = options[options.length - 1];
  if (!option) return 'missing';
  option.click();
  return 'clicked';
})()`;

const APPLY_SORT_CLICK_JS = (sort: WebRankingSort) => `(() => {
  const wantChange = ${sort === 'change'};
  const headers = [...document.querySelectorAll('.swReactTableHeaderCell.is-sortable')];
  const header = headers.find((h) => {
    const t = (h.innerText || '').trim();
    return wantChange ? t.startsWith('变动') : t.includes('每月访问量');
  });
  if (!header) return 'missing';
  if (
    header.classList.contains('is-sorted') &&
    header.classList.contains('sortDirection--desc')
  ) {
    return 'already';
  }
  header.click();
  return 'clicked';
})()`;

async function assertPageReady(
  page: PageLike,
  label: string,
  opts: { reloadIfStuck?: boolean } = {},
): Promise<void> {
  const status = await waitForPageStatus(page, PAGE_STATUS_JS, LOAD_TIMEOUT_SEC, opts);
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
    throw new TimeoutError(label, LOAD_TIMEOUT_SEC);
  }
}

async function waitForOrganicPopup(page: PageLike, timeoutSec = 10): Promise<void> {
  const deadline = Date.now() + timeoutSec * 1000;
  while (Date.now() < deadline) {
    if (String(await page.evaluate(POPUP_PRESENT_JS)) === 'yes') return;
    await page.wait(0.2);
  }
  throw new CommandExecutionError(
    'Organic chipdown popup (pop-up-content) did not appear',
  );
}

async function assertOrganicChipApplied(page: PageLike): Promise<void> {
  if (String(await page.evaluate(ORGANIC_CHIP_PRESENT_JS)) !== 'yes') {
    throw new CommandExecutionError(
      'Organic (自然) chip not present after applying filter',
    );
  }
}

async function ensureOrganic(page: PageLike): Promise<void> {
  const openResult = String(await page.evaluate(OPEN_ORGANIC_CHIPDOWN_JS));
  if (openResult === 'ok') return;
  if (openResult === 'missing') {
    throw new CommandExecutionError(
      'Organic (自然) filter control not found on web-ranking page',
    );
  }

  // openResult === 'opened' — wait for popup, then click 自然 in a separate evaluate.
  await waitForOrganicPopup(page);

  const clickResult = String(await page.evaluate(CLICK_ORGANIC_OPTION_JS));
  if (clickResult === 'missing') {
    throw new CommandExecutionError(
      'Organic (自然) popup option not found on web-ranking page',
    );
  }

  // Table clears briefly after Organic apply — re-poll until ready, then verify chip.
  await assertPageReady(page, 'sim web-ranking (after Organic)');
  await assertOrganicChipApplied(page);
}

async function ensureSort(page: PageLike, sort: WebRankingSort): Promise<void> {
  if (SORT_VIA_URL) return;
  const result = String(await page.evaluate(APPLY_SORT_CLICK_JS(sort)));
  if (result === 'missing') {
    throw new CommandExecutionError(`Sort header for "${sort}" not found`);
  }
  if (result === 'clicked') {
    // Table clears briefly after header click — re-poll until ready.
    await assertPageReady(page, `sim web-ranking (after sort=${sort})`);
  }
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
    await assertPageReady(page, 'sim web-ranking', { reloadIfStuck: true });

    await ensureOrganic(page);
    await ensureSort(page, sort);

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

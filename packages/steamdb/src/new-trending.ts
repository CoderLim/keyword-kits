/**
 * steamdb new-trending — recently released Steam games ranked by 7-day follower gain.
 *
 * Strategy: UI
 * Contract: one filtered SteamDB page load; DataTables pagination and sorting are local.
 * No Steam API or per-game detail requests are made.
 */

import {
  CommandExecutionError,
  EmptyResultError,
  TimeoutError,
} from '@jackwener/opencli/errors';
import { cli, Strategy } from '@jackwener/opencli/registry';
import {
  buildTrendingUrl,
  DEFAULT_DAYS,
  DEFAULT_LIMIT,
  MAX_LIMIT,
  normalizeDays,
  normalizeExtractedRows,
  normalizeLimit,
  normalizeNonNegative,
  parseExtractedRows,
  releaseWindow,
  tablePageLength,
} from './new-trending-lib.js';

const LOAD_TIMEOUT_SEC = 45;
const ALL_ROWS_TIMEOUT_SEC = 45;

type PageLike = {
  evaluate: (code: string) => Promise<unknown>;
  wait: (seconds: number) => Promise<void>;
  goto: (url: string) => Promise<unknown>;
  newTab?: (url?: string) => Promise<string | undefined>;
  selectTab?: (target: string | number) => Promise<void>;
};

const PAGE_STATUS_JS = `(() => {
  const text = document.body?.innerText || '';
  if (/just a moment|checking your browser|attention required|access denied|too many requests|rate.?limit|verify you are human/i.test(text)) {
    return 'challenge';
  }
  if (document.querySelector('table.table-sales tbody tr')) return 'ready';
  if (/No products found matching your filters/i.test(text)) return 'empty';
  return 'loading';
})()`;

const PAGE_LENGTH_OPTIONS_JS = `(() => JSON.stringify(
  [...(document.querySelector('#dt-length-0')?.options || [])]
    .map((option) => Number(option.value))
    .filter((value) => Number.isInteger(value))
))()`;

function setPageLengthJs(pageLength: number): string {
  return `(() => {
  const select = document.querySelector('#dt-length-0');
  if (!select) return 'no-select';
  const target = '${pageLength}';
  if (![...select.options].some((option) => option.value === target)) return 'unsupported';
  if (select.value !== target) {
    select.value = target;
    select.dispatchEvent(new Event('change', { bubbles: true }));
  }
  return 'ready-to-wait';
})()`;
}

function pageLengthStatusJs(pageLength: number): string {
  return `(() => {
  const text = document.body?.innerText || '';
  if (/just a moment|checking your browser|attention required|access denied|too many requests|rate.?limit|verify you are human/i.test(text)) {
    return 'challenge';
  }
  const select = document.querySelector('#dt-length-0');
  if (select && select.value !== '${pageLength}') return 'loading';
  const info = document.querySelector('.dt-info')?.textContent || '';
  const match = info.match(/Showing 1 to ([\\d,]+) of ([\\d,]+) entries/i);
  if (match) {
    const shown = Number(match[1].replace(/,/g, ''));
    const total = Number(match[2].replace(/,/g, ''));
    const expected = ${pageLength} === -1 ? total : Math.min(${pageLength}, total);
    if (shown === expected) return 'ready';
  }
  return 'loading';
})()`;
}

const EXTRACT_ROWS_JS = `(() => JSON.stringify(
  [...document.querySelectorAll('table.table-sales tbody tr')].map((row) => {
    const cells = [...row.cells];
    const link = row.querySelector('a[href^="/app/"]');
    const releaseUnix = Number(cells[6]?.dataset.sort || 0);
    return {
      appid: (link?.getAttribute('href') || '').split('/')[2] || '',
      name: (cells[2]?.innerText || '').trim().split('\\n')[0].trim(),
      releaseDate: releaseUnix > 0
        ? new Date(releaseUnix * 1000).toISOString().slice(0, 10)
        : (cells[6]?.innerText || '').trim(),
      followers: cells[7]?.dataset.sort || (cells[7]?.innerText || '').trim(),
      gain7d: cells[8]?.dataset.sort || (cells[8]?.innerText || '').trim(),
      rating: cells[5]?.dataset.sort || (cells[5]?.innerText || '').trim(),
    };
  })
))()`;

async function openUrl(page: PageLike, url: string): Promise<void> {
  if (typeof page.newTab === 'function' && typeof page.selectTab === 'function') {
    const tabId = await page.newTab(url);
    if (tabId) await page.selectTab(tabId);
    return;
  }
  await page.goto(url);
}

async function waitForStatus(
  page: PageLike,
  script: string,
  timeoutSec = LOAD_TIMEOUT_SEC,
): Promise<string> {
  const deadline = Date.now() + timeoutSec * 1000;
  let status = 'loading';
  while (Date.now() < deadline) {
    status = String(await page.evaluate(script));
    if (status !== 'loading') return status;
    await page.wait(0.5);
  }
  return status;
}

async function waitForTablePageLength(
  page: PageLike,
  limit: number,
  timeoutSec = LOAD_TIMEOUT_SEC,
): Promise<number | null> {
  const deadline = Date.now() + timeoutSec * 1000;
  while (Date.now() < deadline) {
    let supportedPageLengths: unknown = [];
    try {
      supportedPageLengths = JSON.parse(
        String(await page.evaluate(PAGE_LENGTH_OPTIONS_JS)),
      );
    } catch {
      supportedPageLengths = [];
    }
    const pageLength = tablePageLength(limit, supportedPageLengths);
    if (pageLength !== null) return pageLength;
    await page.wait(0.5);
  }
  return null;
}

cli({
  site: 'steamdb',
  name: 'new-trending',
  access: 'read',
  description: '最近上线且关注增长最快的 Steam 游戏关键词',
  domain: 'steamdb.info',
  strategy: Strategy.UI,
  browser: true,
  args: [
    {
      name: 'days',
      type: 'int',
      default: DEFAULT_DAYS,
      help: `最近上线天数（默认 ${DEFAULT_DAYS}）`,
    },
    {
      name: 'limit',
      type: 'int',
      default: DEFAULT_LIMIT,
      help: `返回条数（1-${MAX_LIMIT}，默认 ${DEFAULT_LIMIT}）`,
    },
    {
      name: 'min-gain',
      type: 'int',
      default: 0,
      help: '7 天新增关注下限（默认 0）',
    },
    {
      name: 'min-rating',
      type: 'float',
      default: 0,
      help: '最低 SteamDB 评分（默认 0，不过滤）',
    },
  ],
  columns: [
    'rank',
    'keyword',
    'name',
    'appid',
    'releaseDate',
    'followers',
    'gain7d',
    'rating',
    'url',
  ],
  func: async (page, kwargs) => {
    const browserPage = page as PageLike;
    const days = normalizeDays(kwargs.days);
    const limit = normalizeLimit(kwargs.limit);
    const minGain = normalizeNonNegative(kwargs['min-gain'], 'min-gain');
    const minRating = normalizeNonNegative(kwargs['min-rating'], 'min-rating');
    const window = releaseWindow(days);

    await openUrl(browserPage, buildTrendingUrl(window));
    const status = await waitForStatus(browserPage, PAGE_STATUS_JS);
    if (status === 'challenge') {
      throw new CommandExecutionError('SteamDB showed a challenge or rate-limit page');
    }
    if (status === 'empty') {
      throw new EmptyResultError(
        'steamdb new-trending',
        `No games released between ${window.minRelease} and ${window.maxRelease}`,
      );
    }
    if (status !== 'ready') {
      throw new TimeoutError('steamdb new-trending', LOAD_TIMEOUT_SEC);
    }

    const pageLength = await waitForTablePageLength(browserPage, limit);
    if (pageLength === null) {
      throw new TimeoutError('steamdb new-trending table initialization', LOAD_TIMEOUT_SEC);
    }
    const pageLengthSetup = String(await browserPage.evaluate(setPageLengthJs(pageLength)));
    if (pageLengthSetup === 'unsupported') {
      throw new CommandExecutionError(`SteamDB table does not support page length ${pageLength}`);
    }
    if (pageLengthSetup === 'ready-to-wait') {
      const pageLengthStatus = await waitForStatus(
        browserPage,
        pageLengthStatusJs(pageLength),
        ALL_ROWS_TIMEOUT_SEC,
      );
      if (pageLengthStatus === 'challenge') {
        throw new CommandExecutionError('SteamDB showed a challenge or rate-limit page');
      }
      if (pageLengthStatus !== 'ready') {
        throw new TimeoutError(
          'steamdb new-trending table page sizing',
          ALL_ROWS_TIMEOUT_SEC,
        );
      }
    }

    const extracted = parseExtractedRows(await browserPage.evaluate(EXTRACT_ROWS_JS));
    const rows = normalizeExtractedRows(extracted, { minGain, minRating, limit });
    if (rows.length === 0) {
      throw new EmptyResultError(
        'steamdb new-trending',
        `No games matched min-gain=${minGain} and min-rating=${minRating}`,
      );
    }
    return rows;
  },
});

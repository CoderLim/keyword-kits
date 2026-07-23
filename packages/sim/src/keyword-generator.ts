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

const PAGE_STATUS_JS = `(() => {
  const text = document.body?.innerText || '';
  const keywords = document.querySelectorAll('.search-keyword');
  if (keywords.length >= 5) return 'ready';

  if (/请登录|登录后|Sign in|Log in/i.test(text) && keywords.length === 0) {
    return 'auth';
  }
  if (/额，出错了|Something went wrong|请尝试刷新页面/i.test(text) && keywords.length === 0) {
    return 'error';
  }
  if (keywords.length > 0) return 'hydrating';
  return 'loading';
})()`;

const EXTRACT_ROWS_JS = `(() => {
  const table = document.querySelector('section.keyword-analysis-search .swReactTable-wrapper');
  if (!table) return JSON.stringify([]);

  const columns = [...table.querySelectorAll('.swReactTable-column, .swReactTable-unResizeColumn')]
    .map((col) => [...col.querySelectorAll('.swReactTableCell')])
    .filter((cells) => cells.length >= 5);
  if (columns.length < 1) return JSON.stringify([]);

  const byKey = {};
  columns.forEach((cells) => {
    const key = cells[0]?.getAttribute('data-automation-column-key');
    if (key) byKey[key] = cells;
  });

  const keywordCol = byKey.keyword;
  const volumeCol = byKey.windowVolume;
  const cpcCol = byKey.cpc;
  const difficultyCol = byKey.Difficulty;
  if (!keywordCol || !volumeCol || !cpcCol || !difficultyCol) return JSON.stringify([]);

  const rowCount = Math.min(
    keywordCol.length,
    volumeCol.length,
    cpcCol.length,
    difficultyCol.length,
  );
  const rows = [];
  for (let r = 0; r < rowCount; r++) {
    const keyword = (keywordCol[r].querySelector('.search-keyword')?.innerText || '').trim();
    if (!keyword) continue;
    rows.push({
      keyword,
      volume: (volumeCol[r].innerText || '').trim(),
      cpc: (cpcCol[r].innerText || '').trim(),
      difficulty: (difficultyCol[r].innerText || '').trim(),
    });
  }
  return JSON.stringify(rows);
})()`;

const PAGINATION_STATE_JS = `(() => {
  const next = document.querySelector('[data-automation-pagination-control="control-right"]');
  const hasNext = !!next && next.getAttribute('data-automation-pagination-control-disabled') !== 'true';
  return JSON.stringify({ hasNext });
})()`;

const CLICK_NEXT_JS = `(() => {
  const next = document.querySelector('[data-automation-pagination-control="control-right"]');
  if (!next || next.getAttribute('data-automation-pagination-control-disabled') === 'true') {
    return false;
  }
  next.click();
  return true;
})()`;

async function extractFiltered(
  page: PageLike,
  filters: { minVolume?: number; minCpc?: number; maxDifficulty?: number },
): Promise<KeywordRow[]> {
  const rows = parseJsonRows<KeywordRow>(
    await page.evaluate(EXTRACT_ROWS_JS),
    'keyword-generator',
  );
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
    {
      name: 'keyword',
      type: 'string',
      required: true,
      positional: true,
      help: '种子词（如 dice）',
    },
    {
      name: 'engine',
      type: 'string',
      default: 'google',
      help: '搜索引擎（默认 google）',
    },
    {
      name: 'min-volume',
      type: 'float',
      required: false,
      help: '搜索量下限（默认不限）',
    },
    {
      name: 'min-cpc',
      type: 'float',
      required: false,
      help: 'CPC 下限（默认不限）',
    },
    {
      name: 'max-difficulty',
      type: 'float',
      required: false,
      help: '难度上限（默认不限）',
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
      throw new AuthRequiredError(
        'sim.3ue.com',
        'Not logged in to sim.3ue.com — open Chrome and sign in first',
      );
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
      let state: { hasNext?: boolean } = { hasNext: false };
      try {
        state =
          typeof stateRaw === 'string'
            ? (JSON.parse(stateRaw) as { hasNext?: boolean })
            : ((stateRaw as { hasNext?: boolean } | null | undefined) ?? { hasNext: false });
      } catch {
        state = { hasNext: false };
      }
      if (!state?.hasNext) break;

      const clicked = await page.evaluate(CLICK_NEXT_JS);
      if (!(clicked === true || clicked === 'true')) break;

      const after = await waitForPageStatus(page, PAGE_STATUS_JS, LOAD_TIMEOUT_SEC);
      if (after !== 'ready' && after !== 'hydrating') break;
    }

    if (accumulated.length === 0) {
      throw new EmptyResultError('sim keyword-generator', `No keywords found for "${keyword}"`);
    }
    return accumulated.slice(0, limit);
  },
});

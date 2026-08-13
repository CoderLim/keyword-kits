/**
 * sem backlinks — Active reverse links on sem.3ue.com (SEMrush).
 *
 * Strategy: UI
 * Contract: visible-ui
 * Evidence (2026-08-01 live recon; dofollow 2026-08-03):
 *   - UI: /analytics/backlinks/backlinks/?q={domain}&searchType=domain&ba_mt=active[&ba_rel=follow|nofollow]
 *     Default --dofollow true → ba_rel=follow. No fid / __gmitm in deep-link.
 *   - Cold open may bounce to dash.3ue.com → warm via https://sem.3ue.com/ then retry.
 *   - Table: Semrush DataTable `[role=grid]` / `[role=row]` (not <table>).
 *     Header + ~100 data rows visible ("1 - 100 (N)").
 *     Columns (index → field):
 *       0 checkbox | 1 页面 AS → dr | 2 源页面标题和 URL → sourceTitle/sourceUrl
 *       | 3 外部链接 → externalLinks | 4 内部链接 → internalLinks
 *       | 5 锚链接和目标 URL → anchor/targetUrl/dofollow | 6 首次发现日期 → firstSeen
 *       | 7 上次发现日期 → lastSeen
 *     dofollow: cell[5] badge `[data-test-type=nofollow]` → false; else true.
 *     Source/target: prefer non-semrush.com <a href> inside the cell.
 * Auth: Chrome session on sem.3ue.com
 * Browser: true
 */
import {
  AuthRequiredError,
  CommandExecutionError,
  EmptyResultError,
  TimeoutError,
} from '@jackwener/opencli/errors';
import { cli, Strategy } from '@jackwener/opencli/registry';
import {
  appendUniqueRows,
  backlinkIdentity,
  parseHasNextState,
  rowsFingerprint,
} from './lib/backlinks-pagination.js';
import { dofollowToBaRel, normalizeDofollow } from './lib/dofollow.js';
import {
  DEFAULT_BACKLINKS_LIMIT,
  LOAD_TIMEOUT_SEC,
  MAX_BACKLINKS_LIMIT,
  buildBacklinksUrl,
  ensureSemSession,
  normalizeBacklinksLimit,
  normalizeDomain,
  openDeepLink,
  openSemDeepLink,
  parseDr,
  parseJsonPayload,
  type PageLike,
} from './lib/utils.js';

const COLUMNS = [
  'dr',
  'sourceTitle',
  'sourceUrl',
  'externalLinks',
  'internalLinks',
  'anchor',
  'targetUrl',
  'dofollow',
  'firstSeen',
  'lastSeen',
] as const;

type BacklinkRow = {
  dr: number | null;
  sourceTitle: string;
  sourceUrl: string;
  externalLinks: number | null;
  internalLinks: number | null;
  anchor: string;
  targetUrl: string;
  dofollow: boolean;
  firstSeen: string;
  lastSeen: string;
};

type RawBacklinkRow = {
  drRaw: string;
  sourceTitle: string;
  sourceUrl: string;
  externalLinksRaw: string;
  internalLinksRaw: string;
  anchor: string;
  targetUrl: string;
  dofollow: boolean;
  firstSeen: string;
  lastSeen: string;
};

const PAGE_CHANGE_TIMEOUT_SEC = 30;

const PAGE_STATUS_JS = `(() => {
  const host = location.hostname || '';
  if (/dash\\.3ue\\.com$/i.test(host)) return 'wrong-site';

  const grid = document.querySelector('[role="grid"]');
  const dataRows = grid
    ? [...grid.querySelectorAll('[role="row"]')].filter(
      (r) => r.querySelector('[role="columnheader"]') == null,
    )
    : [];

  const text = document.body?.innerText || '';
  if (/请登录|登录后|Sign in|Log in|未登录/i.test(text)) return 'auth';
  if (/额，出错了|Something went wrong|failed to load|Context Invalidated/i.test(text)) {
    return 'error';
  }

  // Spinner / skeleton while rows hydrate — do not treat placeholder rows as ready
  const spinning = !!(
    grid
    && (
      grid.querySelector('[class*="spin"], [class*="Spin"], [class*="loading"], [class*="Loading"], [aria-busy="true"]')
      || /加载中|Loading/i.test(grid.innerText || '')
    )
  );

  const filled = dataRows.filter((r) => {
    const cells = [...r.children];
    if (cells.length < 8) return false;
    const asText = (cells[1]?.innerText || '').trim();
    return /^\\d+$/.test(asText);
  });

  if (!spinning && filled.length > 0) return 'ready';

  if (
    grid
    && !spinning
    && dataRows.length === 0
    && /没有找到|No backlinks|No results|Nothing found|未找到反向链接/i.test(text)
  ) {
    return 'empty';
  }

  if (
    /反向链接|Backlinks/i.test(document.title || '')
    || grid
  ) {
    return 'hydrating';
  }
  return 'loading';
})()`;

const EXTRACT_ROWS_JS = `(() => {
  const grid = document.querySelector('[role="grid"]');
  if (!grid) return JSON.stringify([]);

  const rows = [...grid.querySelectorAll('[role="row"]')].filter(
    (r) => !r.querySelector('[role="columnheader"]'),
  );

  const isProxyHref = (href) => {
    const h = String(href || '').toLowerCase();
    return h.includes('semrush.com') || h.includes('sem.3ue.com');
  };

  const extHref = (cell) => {
    const links = [...(cell?.querySelectorAll?.('a[href]') || [])];
    for (const a of links) {
      const href = a.href || '';
      if (!href) continue;
      if (isProxyHref(href)) continue;
      return href;
    }
    // Fallback: decode q= from semrush overview deep-link
    for (const a of links) {
      const href = a.href || '';
      try {
        const u = new URL(href);
        const q = u.searchParams.get('q');
        if (q && /^https?:/i.test(q)) return q;
      } catch {}
    }
    return '';
  };

  const linesOf = (raw) =>
    String(raw || '')
      .split(String.fromCharCode(10))
      .map((s) => s.trim())
      .filter(Boolean);

  const out = [];
  for (const row of rows) {
    const cells = [...row.children];
    if (cells.length < 8) continue;

    const asText = (cells[1]?.innerText || '').trim();
    const sourceLines = linesOf(cells[2]?.innerText);
    const sourceTitle = sourceLines[0] || '';
    const sourceUrl = extHref(cells[2]);

    const anchorLines = linesOf(cells[5]?.innerText);
    // Anchor is first line; skip lines that look like URLs / meta labels
    const anchor =
      anchorLines.find(
        (l) =>
          !/^https?:/i.test(l)
          && !/^(文本|内容|链接类型|链接放置|Text|Content|Link type|Link placement)/i.test(l)
          && !l.includes('/'),
      ) || anchorLines[0] || '';
    const targetUrl = extHref(cells[5]);

    if (!asText && !sourceUrl && !anchor) continue;

    // SEMrush paints nofollow/ugc/sponsored as [data-test-type] badges in cell 5.
    // Follow links have no nofollow badge → dofollow true.
    const dofollow = !cells[5]?.querySelector?.('[data-test-type="nofollow"]');

    out.push({
      drRaw: asText,
      sourceTitle,
      sourceUrl,
      externalLinksRaw: (cells[3]?.innerText || '').trim(),
      internalLinksRaw: (cells[4]?.innerText || '').trim(),
      anchor,
      targetUrl,
      dofollow,
      firstSeen: (cells[6]?.innerText || '').trim(),
      lastSeen: (cells[7]?.innerText || '').trim(),
    });
  }
  return JSON.stringify(out);
})()`;

const PAGINATION_STATE_JS = `(() => {
  const next = document.querySelector('[data-test-pagination-next-btn]');
  return JSON.stringify({
    hasNext: !!next && !next.disabled && next.getAttribute('aria-disabled') !== 'true',
  });
})()`;

const CLICK_NEXT_JS = `(() => {
  const next = document.querySelector('[data-test-pagination-next-btn]');
  if (!next || next.disabled || next.getAttribute('aria-disabled') === 'true') return false;
  next.click();
  return true;
})()`;

function mapRawRow(row: RawBacklinkRow): BacklinkRow {
  const externalLinks = Number(String(row.externalLinksRaw).replace(/[^0-9.-]/g, ''));
  const internalLinks = Number(String(row.internalLinksRaw).replace(/[^0-9.-]/g, ''));
  return {
    dr: parseDr(row.drRaw),
    sourceTitle: row.sourceTitle,
    sourceUrl: row.sourceUrl,
    externalLinks: Number.isFinite(externalLinks) ? externalLinks : null,
    internalLinks: Number.isFinite(internalLinks) ? internalLinks : null,
    anchor: row.anchor,
    targetUrl: row.targetUrl,
    dofollow: row.dofollow !== false,
    firstSeen: row.firstSeen,
    lastSeen: row.lastSeen,
  };
}

async function extractRows(page: PageLike): Promise<BacklinkRow[]> {
  const parsed = parseJsonPayload<RawBacklinkRow[]>(
    await page.evaluate(EXTRACT_ROWS_JS),
    'backlinks',
  );
  return Array.isArray(parsed) ? parsed.map(mapRawRow) : [];
}

async function hasNextPage(page: PageLike): Promise<boolean> {
  try {
    return parseHasNextState(await page.evaluate(PAGINATION_STATE_JS));
  } catch (error) {
    const detail = error instanceof Error ? `: ${error.message}` : '';
    throw new CommandExecutionError(`Failed to read backlinks pagination state${detail}`);
  }
}

async function waitForChangedRows(
  page: PageLike,
  previousFingerprint: string,
  domain: string,
): Promise<BacklinkRow[] | null> {
  const deadline = Date.now() + PAGE_CHANGE_TIMEOUT_SEC * 1000;
  while (Date.now() < deadline) {
    const status = String(await page.evaluate(PAGE_STATUS_JS));
    if (status === 'auth' || status === 'wrong-site') {
      throw new AuthRequiredError(
        'sem.3ue.com',
        'Not logged in to sem.3ue.com — open Chrome, enter SEMRUSH via 3ue dashboard, then retry',
      );
    }
    if (status === 'error') {
      throw new CommandExecutionError(`Backlinks pagination failed for ${domain}.`);
    }
    if (status === 'empty') return null;
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
  site: 'sem',
  name: 'backlinks',
  access: 'read',
  description:
    '查看网站反向链接（SEMrush / sem.3ue.com，默认 Active + Follow）',
  domain: 'sem.3ue.com',
  strategy: Strategy.UI,
  browser: true,
  args: [
    {
      name: 'domain',
      type: 'string',
      required: true,
      positional: true,
      help: '目标域名（如 quordlewordle.io）',
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
      default: 'true',
      help: '链接属性：true/follow（默认）、false/nofollow、all（全部）',
    },
  ],
  columns: [...COLUMNS],
  func: async (page, kwargs) => {
    const domain = normalizeDomain(kwargs.domain);
    const limit = normalizeBacklinksLimit(kwargs.limit);
    const dofollowFilter = normalizeDofollow(kwargs.dofollow);
    const url = buildBacklinksUrl(domain, dofollowToBaRel(dofollowFilter));

    await openSemDeepLink(page as PageLike, url, PAGE_STATUS_JS);

    let status = 'loading';
    let refreshed = false;
    const deadline = Date.now() + LOAD_TIMEOUT_SEC * 1000;
    while (Date.now() < deadline) {
      status = String(await page.evaluate(PAGE_STATUS_JS));
      if (status === 'ready' || status === 'auth' || status === 'empty') break;

      if (status === 'wrong-site') {
        await ensureSemSession(page as PageLike);
        await openDeepLink(page as PageLike, url);
        status = 'loading';
        continue;
      }

      if (status === 'error' && !refreshed) {
        refreshed = true;
        await page.evaluate(`(() => {
          const btn = [...document.querySelectorAll('button, a')]
            .find((b) => /刷新|Refresh|Retry|Reload|Press to Reload/i.test(b.textContent || ''));
          if (btn) btn.click();
          else location.reload();
        })()`);
      }

      await page.wait(0.5);
    }

    if (status === 'auth' || status === 'wrong-site') {
      throw new AuthRequiredError(
        'sem.3ue.com',
        'Not logged in to sem.3ue.com — open Chrome, enter SEMRUSH via 3ue dashboard, then retry',
      );
    }
    if (status === 'error') {
      throw new CommandExecutionError(
        `Backlinks page failed to load for ${domain}. Try refreshing in the browser.`,
      );
    }
    const filterHint =
      dofollowFilter === true
        ? ' follow'
        : dofollowFilter === false
          ? ' nofollow'
          : '';

    if (status === 'empty') {
      throw new EmptyResultError(
        'sem backlinks',
        `No active${filterHint} backlinks found for ${domain}`,
      );
    }
    if (status !== 'ready') {
      throw new TimeoutError(`sem backlinks (${domain})`, LOAD_TIMEOUT_SEC);
    }

    let pageRows = await extractRows(page as PageLike);

    if (pageRows.length === 0) {
      throw new EmptyResultError(
        'sem backlinks',
        `No active${filterHint} backlinks found for ${domain}`,
      );
    }

    const accumulated: BacklinkRow[] = [];
    const seen = new Set<string>();
    const seenPageFingerprints = new Set<string>();

    for (let pageIndex = 0; pageIndex < MAX_BACKLINKS_LIMIT; pageIndex++) {
      const currentFingerprint = rowsFingerprint(pageRows, backlinkIdentity);
      if (seenPageFingerprints.has(currentFingerprint)) break;
      seenPageFingerprints.add(currentFingerprint);

      appendUniqueRows(accumulated, seen, pageRows, backlinkIdentity, limit);
      if (accumulated.length >= limit || !(await hasNextPage(page as PageLike))) break;

      const clicked = await page.evaluate(CLICK_NEXT_JS);
      if (!(clicked === true || clicked === 'true')) break;

      const nextRows = await waitForChangedRows(
        page as PageLike,
        currentFingerprint,
        domain,
      );
      if (!nextRows) break;
      pageRows = nextRows;
    }

    return accumulated.slice(0, limit);
  },
});

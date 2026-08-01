/**
 * sem query-domain — Domain Overview summary on sem.3ue.com (SEMrush).
 *
 * Strategy: UI
 * Contract: visible-ui
 * Evidence (2026-08-01 live recon):
 *   - UI: https://sem.3ue.com/analytics/overview/?searchType=domain&q={domain}&protocol=https
 *     GMITM `__gmitm` is injected by the proxy after session warm-up; do NOT pass fid.
 *   - Cold open of overview may bounce to dash.3ue.com; warm via https://sem.3ue.com/
 *     first (lands on /home/?__gmitm=…), then reopen overview.
 *   - Summary cards (language-stable data-at):
 *       [data-at=do-summary-as]           → Authority Score (AS) → CLI field `dr`
 *       [data-at=do-summary-ot]           → 自然流量 / Organic Traffic
 *       [data-at=do-summary-ref_domains]  → 引荐域名 / Referring Domains
 *       [data-at=do-summary-bl]           → 反向链接 / Backlinks
 *     Value node: [data-at=main-number] inside each card (e.g. "41", "209.5K").
 *   - Title when ready: "{domain}：域名概览" / Domain Overview.
 * Auth: Chrome session cookies on sem.3ue.com (via 3ue dashboard SEMRUSH open).
 * Browser: true
 * Notes: OPENCLI_BROWSER_COMMAND_TIMEOUT=180 recommended.
 */
import {
  AuthRequiredError,
  CommandExecutionError,
  EmptyResultError,
  TimeoutError,
} from '@jackwener/opencli/errors';
import { cli, Strategy } from '@jackwener/opencli/registry';
import {
  LOAD_TIMEOUT_SEC,
  buildOverviewUrl,
  ensureSemSession,
  normalizeDomain,
  openDeepLink,
  openSemDeepLink,
  parseDr,
  parseJsonPayload,
  type PageLike,
} from './lib/utils.js';

const COLUMNS = [
  'domain',
  'dr',
  'organicTraffic',
  'refDomains',
  'backlinks',
] as const;

type QueryDomainRow = {
  domain: string;
  dr: number | null;
  organicTraffic: string | null;
  refDomains: string | null;
  backlinks: string | null;
};

const PAGE_STATUS_JS = `(() => {
  const host = location.hostname || '';
  if (/dash\\.3ue\\.com$/i.test(host)) return 'wrong-site';

  const cards = [
    'do-summary-as',
    'do-summary-ot',
    'do-summary-ref_domains',
    'do-summary-bl',
  ];
  const hasNumber = cards.some((at) => {
    const el = document.querySelector(
      '[data-at="' + at + '"] [data-at="main-number"]',
    );
    return !!(el?.innerText || '').trim();
  });
  if (hasNumber) return 'ready';

  const text = document.body?.innerText || '';
  if (/请登录|登录后|Sign in|Log in|未登录/i.test(text)) return 'auth';
  if (/额，出错了|Something went wrong|failed to load|Context Invalidated/i.test(text)) {
    return 'error';
  }
  if (
    document.querySelector('[data-at="do-summary-as"]')
    || /域名概览|Domain Overview/i.test(document.title || '')
  ) {
    return 'hydrating';
  }
  return 'loading';
})()`;

const EXTRACT_JS = `(() => {
  const read = (cardAt) => {
    const el = document.querySelector(
      '[data-at="' + cardAt + '"] [data-at="main-number"]',
    );
    const raw = (el?.innerText || '').trim();
    return raw || null;
  };
  return JSON.stringify({
    drRaw: read('do-summary-as'),
    organicTraffic: read('do-summary-ot'),
    refDomains: read('do-summary-ref_domains'),
    backlinks: read('do-summary-bl'),
  });
})()`;

cli({
  site: 'sem',
  name: 'query-domain',
  access: 'read',
  description:
    '查询域名概览摘要（SEMrush / sem.3ue.com）：DR(AS)、自然流量、引荐域名数、反向链接数',
  domain: 'sem.3ue.com',
  strategy: Strategy.UI,
  browser: true,
  args: [
    {
      name: 'domain',
      type: 'string',
      required: true,
      positional: true,
      help: '目标域名（如 raphael.app）',
    },
  ],
  columns: [...COLUMNS],
  func: async (page, kwargs) => {
    const domain = normalizeDomain(kwargs.domain);
    const url = buildOverviewUrl(domain);
    await openSemDeepLink(page as PageLike, url, PAGE_STATUS_JS);

    let status = 'loading';
    let refreshed = false;
    const deadline = Date.now() + LOAD_TIMEOUT_SEC * 1000;
    while (Date.now() < deadline) {
      status = String(await page.evaluate(PAGE_STATUS_JS));
      if (status === 'ready' || status === 'auth') break;

      if (status === 'wrong-site') {
        await ensureSemSession(page as PageLike);
        await openDeepLink(page as PageLike, buildOverviewUrl(domain));
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
        `Domain overview failed to load for ${domain}. Try refreshing in the browser.`,
      );
    }
    if (status !== 'ready') {
      throw new TimeoutError(`sem query-domain (${domain})`, LOAD_TIMEOUT_SEC);
    }

    const raw = await page.evaluate(EXTRACT_JS);
    const parsed = parseJsonPayload<{
      drRaw: string | null;
      organicTraffic: string | null;
      refDomains: string | null;
      backlinks: string | null;
    }>(raw, 'query-domain');

    const row: QueryDomainRow = {
      domain,
      dr: parseDr(parsed.drRaw),
      organicTraffic: parsed.organicTraffic,
      refDomains: parsed.refDomains,
      backlinks: parsed.backlinks,
    };

    if (
      row.dr == null
      && !row.organicTraffic
      && !row.refDomains
      && !row.backlinks
    ) {
      throw new EmptyResultError(
        'sem query-domain',
        `No overview metrics found for ${domain}`,
      );
    }

    return [row];
  },
});

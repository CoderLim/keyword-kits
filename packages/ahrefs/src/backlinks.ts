/**
 * ahrefs backlinks — Ahrefs free Backlink Checker.
 *
 * Strategy: UI
 * Contract: deep-link pre-fills input+mode → click "Check backlinks" → scrape
 *   result modal summary + table (unlike kd, deep-link does NOT auto-run).
 * Evidence (2026-07-23 live recon):
 *   - UI: https://ahrefs.com/backlink-checker/
 *   - Deep-link: ?input=<domain>&mode=subdomains
 *     e.g. https://ahrefs.com/backlink-checker/?input=ahrefs.com&mode=subdomains
 *     Fills `input[placeholder="Enter domain or URL"]` and mode "Subdomains";
 *     must click button "Check backlinks".
 *   - Result: React modal titled `Backlink profile for {domain}`
 *     (`.ReactModalPortal` / content with that title). Subtitle:
 *     "Domain including subdomains. One link per domain".
 *   - Summary metrics (labels → parse values from adjacent text):
 *     - "Domain Rating" → integer DR (e.g. 91)
 *     - "Backlinks" → abbreviated count + "N% dofollow"
 *     - "Linking websites" → abbreviated count + "N% dofollow" (= referring domains)
 *     - "URL Rating" gated (toolbar upsell) — ignore
 *   - Table `table` columns: DR | Referring page | Anchor and target URL
 *     (~20 visible rows). Referring page = title + source URL; third col =
 *     anchor (+ snippet) + target URL.
 *   - Underlying XHR (NOT usable as PUBLIC):
 *     POST https://ahrefs.com/v4/stGetFreeBacklinksOverview
 *     POST https://ahrefs.com/v4/stGetFreeBacklinksList
 *     body { url, mode, captcha } (Turnstile). Errors: InvalidCaptcha | InvalidUrl.
 *     Overview JSON: { domainRating, backlinks, refdomains, dofollowBacklinks,
 *       dofollowRefdomains }. List rows: { domainRating, urlFrom, title, anchor,
 *       urlTo, textPre, textPost, redirectChain, inRaw, inRendered }.
 *   - Cloudflare `__cf_bm` + Turnstile script present.
 * Auth: none (free tool). Login wall → CommandExecutionError.
 * Browser: true
 * Notes: CookieYes consent banner may block clicks — dismiss Accept/Reject All
 *   first (same as kd).
 *
 * Locked links[] field names (stable CLI output):
 *   dr, title, sourceUrl, anchor, targetUrl
 *   (map from DOM/API: domainRating→dr, title→title, urlFrom→sourceUrl,
 *    anchor→anchor, urlTo→targetUrl; no per-row dofollow on free list)
 *
 * Summary mapping:
 *   domain, dr, refDomains (Linking websites), refDomainsDofollowPct,
 *   backlinks, backlinksDofollowPct
 */
import {
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

const DISMISS_COOKIE_JS = `(() => {
  const match = (el) => {
    const t = (el.textContent || '').replace(/\\s+/g, ' ').trim();
    return /^(Accept All|Reject All|Accept all|Reject all)$/i.test(t)
      || /Accept All|Reject All/i.test(t);
  };
  const btn = [...document.querySelectorAll('button, [role=button], a')]
    .find(match);
  if (btn) { btn.click(); return true; }
  const cky = document.querySelector('#cky-btn-accept, .cky-btn-accept, #cky-btn-reject, .cky-btn-reject');
  if (cky) { cky.click(); return true; }
  return false;
})()`;

const CLICK_CHECK_JS = `(() => {
  const btn = [...document.querySelectorAll('button[type=submit], button')]
    .find((b) => /check backlinks/i.test((b.textContent || '').trim()));
  if (!btn) return 'no-button';
  btn.click();
  return 'clicked';
})()`;

/** Returns JSON: { status, summary?, links? } — status: ready|auth|challenge|loading */
const PAGE_STATUS_JS = `(() => {
  const text = document.body?.innerText || '';

  if (/just a moment|checking your browser|cf-browser-verification|attention required|access denied|too many requests|rate.?limit|verify you are human/i.test(text)) {
    return JSON.stringify({ status: 'challenge' });
  }

  if (
    /sign in to (continue|view|see|unlock)|log in to (continue|view|see)|create (a )?free account to|please (sign|log) in to (continue|view)|you need to (sign|log) in/i.test(
      text,
    )
  ) {
    return JSON.stringify({ status: 'auth' });
  }

  const portal = [...document.querySelectorAll('.ReactModalPortal')]
    .find((el) => /Backlink profile for/i.test(el.innerText || ''));
  if (!portal) {
    return JSON.stringify({ status: 'loading' });
  }

  const modalText = portal.innerText || '';
  if (!/Domain Rating/i.test(modalText)) {
    return JSON.stringify({ status: 'loading' });
  }

  const summary = {};
  const drM = modalText.match(/Domain Rating\\s*(\\d{1,3})/i);
  if (drM) summary.drRaw = drM[1];

  const blM = modalText.match(/Backlinks\\s*([\\d.,]+\\s*[KMB]?)\\s*(\\d+(?:\\.\\d+)?)%\\s*dofollow/i);
  if (blM) {
    summary.backlinksRaw = blM[1].trim();
    summary.backlinksDofollowPctRaw = blM[2] + '%';
  }

  const lwM = modalText.match(/Linking websites\\s*([\\d.,]+\\s*[KMB]?)\\s*(\\d+(?:\\.\\d+)?)%\\s*dofollow/i);
  if (lwM) {
    summary.refDomainsRaw = lwM[1].trim();
    summary.refDomainsDofollowPctRaw = lwM[2] + '%';
  }

  const hasAny =
    summary.drRaw != null ||
    summary.backlinksRaw != null ||
    summary.refDomainsRaw != null;
  if (!hasAny) {
    return JSON.stringify({ status: 'loading' });
  }

  const links = [];
  const table = portal.querySelector('table');
  if (table) {
    const rows = [...table.querySelectorAll('tbody tr')];
    for (const tr of rows) {
      const cells = [...tr.querySelectorAll('td')];
      if (cells.length < 3) continue;
      const drCell = (cells[0].innerText || '').trim();
      const refLinks = [...cells[1].querySelectorAll('a')];
      const title =
        (refLinks.find((a) => {
          const t = (a.textContent || '').trim();
          return t && !/^https?:\\/\\//i.test(t);
        })?.textContent || '').trim() ||
        (refLinks[0]?.textContent || '').trim() ||
        null;
      const sourceUrl =
        refLinks.map((a) => a.href).find((h) => /^https?:\\/\\//i.test(h)) ||
        null;

      const anchorLinks = [...cells[2].querySelectorAll('a')];
      const anchor =
        (anchorLinks.find((a) => {
          const t = (a.textContent || '').trim();
          return t && !/^https?:\\/\\//i.test(t);
        })?.textContent || '').trim() ||
        null;
      const targetUrl =
        anchorLinks.map((a) => a.href).find((h) => /^https?:\\/\\//i.test(h)) ||
        null;

      // Fallback: last non-empty line in col2/col3 that looks like a URL
      const refLines = (cells[1].innerText || '').split('\\n').map((s) => s.trim()).filter(Boolean);
      const ancLines = (cells[2].innerText || '').split('\\n').map((s) => s.trim()).filter(Boolean);
      const row = {
        dr: drCell || null,
        title: title || refLines.find((l) => !/^https?:\\/\\//i.test(l)) || null,
        sourceUrl:
          sourceUrl ||
          refLinks[refLinks.length - 1]?.href ||
          refLines.find((l) => /^https?:\\/\\//i.test(l)) ||
          null,
        anchor:
          anchor ||
          ancLines.find((l) => !/^https?:\\/\\//i.test(l)) ||
          null,
        targetUrl:
          targetUrl ||
          ancLines.find((l) => /^https?:\\/\\//i.test(l)) ||
          null,
      };
      if (row.dr || row.sourceUrl || row.targetUrl) links.push(row);
    }
  }

  return JSON.stringify({ status: 'ready', summary, links });
})()`;

async function openUrl(
  page: {
    newTab?: (url?: string) => Promise<string | undefined>;
    selectTab?: (id: string) => Promise<unknown>;
    goto?: (url: string) => Promise<unknown>;
  },
  url: string,
): Promise<void> {
  if (typeof page.newTab === 'function' && typeof page.selectTab === 'function') {
    const tabId = await page.newTab(url);
    if (tabId) await page.selectTab(tabId);
    return;
  }
  if (typeof page.goto === 'function') {
    await page.goto(url);
    return;
  }
  throw new CommandExecutionError('Browser page has neither newTab nor goto');
}

type RawSummary = {
  drRaw?: string;
  backlinksRaw?: string;
  backlinksDofollowPctRaw?: string;
  refDomainsRaw?: string;
  refDomainsDofollowPctRaw?: string;
};

type RawLink = {
  dr?: string | null;
  title?: string | null;
  sourceUrl?: string | null;
  anchor?: string | null;
  targetUrl?: string | null;
};

type PollResult = {
  status: string;
  summary?: RawSummary;
  links?: RawLink[];
};

async function pollForBacklinks(
  page: {
    evaluate: (js: string) => Promise<unknown>;
    wait: (sec: number) => Promise<unknown>;
  },
  deadline: number,
): Promise<PollResult> {
  let last: PollResult = { status: 'loading' };
  while (Date.now() < deadline) {
    await page.evaluate(DISMISS_COOKIE_JS).catch(() => false);
    const raw = await page.evaluate(PAGE_STATUS_JS);
    try {
      const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
      if (parsed && typeof parsed === 'object' && 'status' in parsed) {
        last = parsed as PollResult;
      }
    } catch {
      last = { status: 'loading' };
    }
    if (last.status === 'ready' || last.status === 'auth' || last.status === 'challenge') {
      return last;
    }
    await page.wait(0.5);
  }
  return last;
}

function mapSummary(domain: string, raw: RawSummary | undefined): BacklinksSummary {
  const summary: BacklinksSummary = { domain };
  if (!raw) return summary;

  if (raw.drRaw != null) {
    try {
      const dr = Number(String(raw.drRaw).trim());
      if (Number.isInteger(dr) && dr >= 0 && dr <= 100) summary.dr = dr;
    } catch {
      /* ignore */
    }
  }
  if (raw.refDomainsRaw != null) {
    try {
      summary.refDomains = parseCount(raw.refDomainsRaw);
    } catch {
      /* ignore */
    }
  }
  if (raw.refDomainsDofollowPctRaw != null) {
    try {
      summary.refDomainsDofollowPct = parsePercent(raw.refDomainsDofollowPctRaw);
    } catch {
      /* ignore */
    }
  }
  if (raw.backlinksRaw != null) {
    try {
      summary.backlinks = parseCount(raw.backlinksRaw);
    } catch {
      /* ignore */
    }
  }
  if (raw.backlinksDofollowPctRaw != null) {
    try {
      summary.backlinksDofollowPct = parsePercent(raw.backlinksDofollowPctRaw);
    } catch {
      /* ignore */
    }
  }
  return summary;
}

function mapLinks(rawLinks: RawLink[] | undefined): Record<string, unknown>[] {
  if (!rawLinks?.length) return [];
  return rawLinks.map((row) => {
    const out: Record<string, unknown> = {};
    if (row.dr != null && String(row.dr).trim() !== '') {
      const n = Number(String(row.dr).trim());
      out.dr = Number.isInteger(n) ? n : String(row.dr).trim();
    }
    if (row.title) out.title = row.title;
    if (row.sourceUrl) out.sourceUrl = row.sourceUrl;
    if (row.anchor) out.anchor = row.anchor;
    if (row.targetUrl) out.targetUrl = row.targetUrl;
    return out;
  });
}

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
  func: async (page, kwargs): Promise<BacklinksResult> => {
    const domain = normalizeDomain(kwargs.domain);
    const deepLink = buildDeepLink(domain);
    const deadline = Date.now() + LOAD_TIMEOUT_SEC * 1000;

    await openUrl(page, deepLink);
    await page.evaluate(DISMISS_COOKIE_JS).catch(() => false);
    await page.wait(0.5);
    await page.evaluate(DISMISS_COOKIE_JS).catch(() => false);

    let submitStatus = String(await page.evaluate(CLICK_CHECK_JS));
    if (submitStatus === 'no-button') {
      await page.wait(1);
      await page.evaluate(DISMISS_COOKIE_JS).catch(() => false);
      submitStatus = String(await page.evaluate(CLICK_CHECK_JS));
    }
    if (submitStatus !== 'clicked') {
      throw new EmptyResultError(
        'ahrefs backlinks',
        `Submit failed / "Check backlinks" missing for "${domain}": ${submitStatus}`,
      );
    }

    const result = await pollForBacklinks(page, deadline);

    if (result.status === 'auth') {
      throw new CommandExecutionError(
        'Ahrefs free Backlink Checker requires login unexpectedly. Page may have changed.',
      );
    }
    if (result.status === 'challenge') {
      throw new CommandExecutionError(
        'Ahrefs free Backlink Checker showed a challenge/rate-limit wall.',
      );
    }
    if (result.status !== 'ready') {
      if (Date.now() >= deadline) {
        throw new TimeoutError(`ahrefs backlinks (${domain})`, LOAD_TIMEOUT_SEC);
      }
      throw new EmptyResultError(
        'ahrefs backlinks',
        `No backlink profile returned for "${domain}"`,
      );
    }

    const summary = mapSummary(domain, result.summary);
    if (!hasSummaryMetrics(summary)) {
      throw new EmptyResultError(
        'ahrefs backlinks',
        `No summary metrics parsed for "${domain}"`,
      );
    }

    return {
      summary,
      links: mapLinks(result.links),
    };
  },
});

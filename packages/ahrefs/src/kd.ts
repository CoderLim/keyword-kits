/**
 * ahrefs kd — Ahrefs free Keyword Difficulty Checker.
 *
 * Strategy: UI
 * Contract: deep-link auto-runs check → scrape KD integer from result modal
 * Evidence:
 *   - UI: https://ahrefs.com/keyword-difficulty
 *   - Deep-link (auto-runs check): ?country=<cc>&input=<keyword>
 *     e.g. https://ahrefs.com/keyword-difficulty/?country=us&input=keyword%20research → KD 92
 *     United Kingdom uses `gb` (not `uk`); CLI accepts `uk` as alias → `gb`.
 *   - Prefer page.newTab(deep-link); fallback: open base → fill input → Check keyword
 *   - Form: input[placeholder="Enter keyword"]; country control; submit "Check keyword"
 *   - Result modal: [role=dialog][class*=content] titled `Keyword Difficulty for "…"`.
 *     KD integer in [class*=chartValue] (sibling label Easy|Medium|Hard|Super hard under [class*=chartData]).
 *   - Underlying XHR (NOT usable as PUBLIC): POST https://ahrefs.com/v4/stGetFreeSerpOverviewForKeywordDifficultyChecker
 *     body { keyword, country, captcha } → JSON { difficulty: int, ... }. Captcha gate blocks stable no-login replay.
 * Auth: none (free tool). Login wall → CommandExecutionError.
 * Browser: true
 * Notes: CookieYes consent banner may block clicks — dismiss Accept/Reject All first. Cloudflare __cf_bm present.
 */
import {
  ArgumentError,
  CommandExecutionError,
  EmptyResultError,
  TimeoutError,
} from '@jackwener/opencli/errors';
import { cli, Strategy } from '@jackwener/opencli/registry';
import { normalizeCountry, normalizeKeyword, parseKd, toRows } from './lib.js';

const PAGE_URL = 'https://ahrefs.com/keyword-difficulty';
const LOAD_TIMEOUT_SEC = 90;
const DEEP_LINK_BUDGET_MS = 55_000;

function buildDeepLink(keyword: string, country: string): string {
  return (
    `${PAGE_URL}/?country=${encodeURIComponent(country)}` +
    `&input=${encodeURIComponent(keyword)}`
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

/** Returns JSON: { status, kd? } — status: ready|auth|challenge|loading */
const PAGE_STATUS_JS = `(() => {
  const text = document.body?.innerText || '';
  const chartEl = document.querySelector(
    '[role=dialog][class*=content] [class*=chartValue], [role=dialog] [class*=chartValue]',
  );
  const chartRaw = (chartEl?.textContent || '').trim();
  if (chartEl && /^\\d{1,3}$/.test(chartRaw)) {
    return JSON.stringify({ status: 'ready', kd: Number(chartRaw) });
  }

  if (/just a moment|checking your browser|cf-browser-verification|attention required|access denied|too many requests|rate.?limit|verify you are human/i.test(text)) {
    return JSON.stringify({ status: 'challenge' });
  }

  // Login wall: gated CTA without a KD chart yet (nav "Sign in" alone is normal)
  if (
    /sign in to (continue|view|see|unlock)|log in to (continue|view|see)|create (a )?free account to|please (sign|log) in to (continue|view)|you need to (sign|log) in/i.test(
      text,
    )
  ) {
    return JSON.stringify({ status: 'auth' });
  }

  return JSON.stringify({ status: 'loading' });
})()`;

const FALLBACK_SUBMIT_JS = (keyword: string) => `(() => {
  const keyword = ${JSON.stringify(keyword)};
  const input = document.querySelector('input[placeholder="Enter keyword"], input[placeholder*="keyword" i]');
  if (!input) return 'no-input';
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
  if (setter) setter.call(input, keyword);
  else input.value = keyword;
  input.dispatchEvent(new Event('input', { bubbles: true }));
  input.dispatchEvent(new Event('change', { bubbles: true }));

  const btn = [...document.querySelectorAll('button[type=submit], button')]
    .find((b) => /check keyword/i.test((b.textContent || '').trim()));
  if (!btn) return 'no-button';
  btn.click();
  return 'clicked';
})()`;

async function openUrl(page: {
  newTab?: (url?: string) => Promise<string | undefined>;
  selectTab?: (id: string) => Promise<unknown>;
  goto?: (url: string) => Promise<unknown>;
}, url: string): Promise<void> {
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

type PollResult = { status: string; kd?: number };

async function pollForKd(
  page: { evaluate: (js: string) => Promise<unknown>; wait: (sec: number) => Promise<unknown> },
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

cli({
  site: 'ahrefs',
  name: 'kd',
  access: 'read',
  description: 'Check Ahrefs Keyword Difficulty (free tool)',
  domain: 'ahrefs.com',
  strategy: Strategy.UI,
  browser: true,
  args: [
    {
      name: 'keyword',
      type: 'string',
      required: true,
      positional: true,
      help: 'Keyword or phrase to check',
    },
    {
      name: 'country',
      type: 'string',
      default: 'us',
      help: 'Two-letter country code (default us; uk → gb)',
    },
  ],
  columns: ['keyword', 'country', 'kd'],
  func: async (page, kwargs) => {
    const keyword = normalizeKeyword(kwargs.keyword);
    const country = normalizeCountry(kwargs.country);
    const deepLink = buildDeepLink(keyword, country);
    const deadline = Date.now() + LOAD_TIMEOUT_SEC * 1000;
    // Give deep-link most of the budget; reserve time for manual fill fallback
    const deepLinkDeadline = Math.min(deadline, Date.now() + DEEP_LINK_BUDGET_MS);

    await openUrl(page, deepLink);

    let result = await pollForKd(page, deepLinkDeadline);

    // Fallback: fill keyword + click Check if deep-link did not surface KD
    if (result.status === 'loading' && Date.now() < deadline) {
      await page.evaluate(DISMISS_COOKIE_JS).catch(() => false);
      let submitStatus = String(await page.evaluate(FALLBACK_SUBMIT_JS(keyword)));
      if (submitStatus === 'no-input' || submitStatus === 'no-button') {
        await openUrl(page, deepLink);
        await page.wait(1);
        await page.evaluate(DISMISS_COOKIE_JS).catch(() => false);
        submitStatus = String(await page.evaluate(FALLBACK_SUBMIT_JS(keyword)));
      }
      if (submitStatus !== 'clicked') {
        throw new EmptyResultError(
          'ahrefs kd',
          `Submit failed / form controls missing for "${keyword}" (${country}): ${submitStatus}`,
        );
      }
      result = await pollForKd(page, deadline);
    }

    if (result.status === 'auth') {
      throw new CommandExecutionError(
        'Ahrefs free KD page requires login unexpectedly. Page may have changed.',
      );
    }
    if (result.status === 'challenge') {
      throw new CommandExecutionError(
        'Ahrefs free KD page showed a challenge/rate-limit wall.',
      );
    }
    if (result.status !== 'ready' || result.kd === undefined || result.kd === null) {
      if (Date.now() >= deadline) {
        throw new TimeoutError(`ahrefs kd (${keyword})`, LOAD_TIMEOUT_SEC);
      }
      throw new EmptyResultError(
        'ahrefs kd',
        `No KD returned for "${keyword}" (${country})`,
      );
    }

    let kd: number;
    try {
      kd = parseKd(result.kd);
    } catch (e) {
      if (e instanceof ArgumentError) {
        throw new EmptyResultError(
          'ahrefs kd',
          `Invalid KD value for "${keyword}": ${result.kd}`,
        );
      }
      throw e;
    }
    return toRows(keyword, country, kd);
  },
});

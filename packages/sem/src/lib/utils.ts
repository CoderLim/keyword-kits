/**
 * Shared helpers for sem.* opencli commands.
 */

import { ArgumentError, CommandExecutionError } from '@jackwener/opencli/errors';

export const SITE_ORIGIN = 'https://sem.3ue.com';
export const LOAD_TIMEOUT_SEC = 90;

export type PageLike = {
  evaluate: (code: string) => Promise<unknown>;
  wait: (seconds: number) => Promise<void>;
  goto: (url: string) => Promise<unknown>;
  newTab?: (url?: string) => Promise<string | undefined>;
  selectTab?: (target: string | number) => Promise<void>;
};

/** Strip protocol/path/query; keep host (lowercase). Drop leading www. */
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
  host = host.replace(/^www\./, '');
  if (!host || !/^[a-z0-9.-]+$/.test(host) || !host.includes('.')) {
    throw new ArgumentError(`invalid domain: ${input}`);
  }
  return host;
}

export function buildOverviewUrl(domain: string): string {
  const qs = new URLSearchParams({
    searchType: 'domain',
    q: domain,
    protocol: 'https',
  });
  return `${SITE_ORIGIN}/analytics/overview/?${qs.toString()}`;
}

/** Active + follow backlinks list (filters locked in URL). */
export function buildBacklinksUrl(domain: string): string {
  const qs = new URLSearchParams({
    q: domain,
    searchType: 'domain',
    ba_mt: 'active',
    ba_rel: 'follow',
  });
  return `${SITE_ORIGIN}/analytics/backlinks/backlinks/?${qs.toString()}`;
}

export async function openDeepLink(page: PageLike, url: string): Promise<void> {
  if (typeof page.newTab === 'function' && typeof page.selectTab === 'function') {
    const tabId = await page.newTab(url);
    if (tabId) await page.selectTab(tabId);
    return;
  }
  await page.goto(url);
}

/** Warm GMITM session if cold open bounced to dash.3ue.com. */
export async function ensureSemSession(page: PageLike): Promise<void> {
  await openDeepLink(page, `${SITE_ORIGIN}/`);
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    const host = String(
      await page.evaluate(`(() => location.hostname || '')()`),
    );
    if (host === 'sem.3ue.com' || host.endsWith('.sem.3ue.com')) return;
    await page.wait(0.5);
  }
}

/**
 * Open a sem.3ue.com deep-link; if redirected to dash, warm session and retry once.
 * `statusJs` must return `wrong-site` when on dash.3ue.com.
 */
export async function openSemDeepLink(
  page: PageLike,
  url: string,
  statusJs: string,
): Promise<void> {
  await openDeepLink(page, url);
  const deadline = Date.now() + 8_000;
  while (Date.now() < deadline) {
    const status = String(await page.evaluate(statusJs));
    if (status === 'wrong-site') {
      await ensureSemSession(page);
      await openDeepLink(page, url);
      return;
    }
    if (
      status === 'ready'
      || status === 'auth'
      || status === 'hydrating'
      || status === 'empty'
    ) {
      return;
    }
    await page.wait(0.5);
  }
}

export const DEFAULT_BACKLINKS_LIMIT = 50;
export const MAX_BACKLINKS_LIMIT = 100;

export function normalizeBacklinksLimit(
  raw: unknown,
  defaultValue = DEFAULT_BACKLINKS_LIMIT,
): number {
  const value = raw ?? defaultValue;
  const n = Number(value);
  if (!Number.isInteger(n) || n < 1) {
    throw new ArgumentError('limit must be a positive integer');
  }
  if (n > MAX_BACKLINKS_LIMIT) {
    throw new ArgumentError(`limit must be <= ${MAX_BACKLINKS_LIMIT}`);
  }
  return n;
}

export async function waitForPageStatus(
  page: PageLike,
  statusJs: string,
  timeoutSec: number,
): Promise<string> {
  let status = 'loading';
  const deadline = Date.now() + timeoutSec * 1000;

  while (Date.now() < deadline) {
    status = String(await page.evaluate(statusJs));
    if (status === 'ready' || status === 'auth' || status === 'wrong-site') {
      return status;
    }
    await page.wait(0.5);
  }

  return status;
}

export function parseJsonPayload<T>(raw: unknown, label: string): T {
  let parsed: unknown = raw;
  if (typeof raw === 'string') {
    try {
      parsed = JSON.parse(raw);
    } catch {
      throw new CommandExecutionError(`Failed to parse ${label} payload`);
    }
  }
  return parsed as T;
}

/** Parse Authority Score integer; returns null if missing/invalid. */
export function parseDr(raw: string | null | undefined): number | null {
  if (raw == null) return null;
  const trimmed = String(raw).trim();
  if (!trimmed) return null;
  const n = Number(trimmed.replace(/,/g, ''));
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n);
}

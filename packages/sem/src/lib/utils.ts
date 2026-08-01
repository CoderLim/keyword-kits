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

export async function openDeepLink(page: PageLike, url: string): Promise<void> {
  if (typeof page.newTab === 'function' && typeof page.selectTab === 'function') {
    const tabId = await page.newTab(url);
    if (tabId) await page.selectTab(tabId);
    return;
  }
  await page.goto(url);
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

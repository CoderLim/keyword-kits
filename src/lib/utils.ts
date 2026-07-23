/**
 * Shared helpers for sim.* opencli commands.
 */

import { ArgumentError, CommandExecutionError } from '@jackwener/opencli/errors';

export const SITE_ORIGIN = 'https://sim.3ue.com';
export const DEFAULT_LIMIT = 50;
export const MAX_LIMIT = 100;
export const LOAD_TIMEOUT_SEC = 90;

export type PageLike = {
  evaluate: (code: string) => Promise<unknown>;
  wait: (seconds: number) => Promise<void>;
  goto: (url: string) => Promise<unknown>;
  newTab?: (url?: string) => Promise<string | undefined>;
  selectTab?: (target: string | number) => Promise<void>;
};

/** Strip protocol/path/query; keep host (lowercase). */
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
  // Drop leading www. for SimilarWeb key consistency.
  host = host.replace(/^www\./, '');
  if (!host || !/^[a-z0-9.-]+$/.test(host) || !host.includes('.')) {
    throw new ArgumentError(`invalid domain: ${input}`);
  }
  return host;
}

export function normalizeLimit(raw: unknown, defaultValue = DEFAULT_LIMIT): number {
  const value = raw ?? defaultValue;
  const n = Number(value);
  if (!Number.isInteger(n) || n < 1) {
    throw new ArgumentError('limit must be a positive integer');
  }
  if (n > MAX_LIMIT) {
    throw new ArgumentError(`limit must be <= ${MAX_LIMIT}`);
  }
  return n;
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
  opts: { onError?: () => Promise<void> } = {},
): Promise<string> {
  let status = 'loading';
  let refreshed = false;
  let hydratingSince = 0;
  const deadline = Date.now() + timeoutSec * 1000;

  while (Date.now() < deadline) {
    status = String(await page.evaluate(statusJs));
    if (status === 'ready' || status === 'auth') return status;

    if (status === 'hydrating') {
      if (!hydratingSince) hydratingSince = Date.now();
      if (Date.now() - hydratingSince > 3000) return 'ready';
    }

    if (status === 'error' && !refreshed) {
      refreshed = true;
      if (opts.onError) {
        await opts.onError();
      } else {
        await page.evaluate(`(() => {
          const btn = [...document.querySelectorAll('button')]
            .find((b) => /刷新|Refresh|Retry/i.test(b.textContent || ''));
          btn?.click();
        })()`);
      }
    }

    await page.wait(0.5);
  }

  return status;
}

export function parseJsonRows<T>(raw: unknown, label: string): T[] {
  let parsed: unknown = raw;
  if (typeof raw === 'string') {
    try {
      parsed = JSON.parse(raw);
    } catch {
      throw new CommandExecutionError(`Failed to parse ${label} payload`);
    }
  }
  return Array.isArray(parsed) ? (parsed as T[]) : [];
}

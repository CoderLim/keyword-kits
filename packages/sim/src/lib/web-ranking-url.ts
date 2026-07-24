import { ArgumentError } from '@jackwener/opencli/errors';
import { SITE_ORIGIN } from './utils.ts';

export type WebRankingSort = 'change' | 'visits';

/** Recon: sort is applied via column-header click, not URL query params. */
export const SORT_VIA_URL = false;

const SORT_ALIASES: Record<string, WebRankingSort> = {
  change: 'change',
  变动: 'change',
  visits: 'visits',
  monthlyvisits: 'visits',
  每月访问量: 'visits',
};

export function normalizeSort(raw: unknown): WebRankingSort {
  const input = String(raw ?? '').trim();
  if (!input) return 'change';
  const mapped = SORT_ALIASES[input] ?? SORT_ALIASES[input.toLowerCase()];
  if (!mapped) {
    throw new ArgumentError(
      `unknown sort "${input}". Supported: change (变动), visits (每月访问量)`,
    );
  }
  return mapped;
}

export type WebRankingUrlOpts = {
  industryId: string;
  /** Accepted for API consistency; applied via UI click when SORT_VIA_URL is false. */
  sort: WebRankingSort;
};

export function buildWebRankingUrl(opts: WebRankingUrlOpts): string {
  const industryId = encodeURIComponent(opts.industryId).replace(/%2F/gi, '/');
  const qs = new URLSearchParams({
    webSource: 'Total',
    selectedTab: 'CategoryLeadersSearch',
    _: String(Date.now()),
  });

  // Organic is CLICK_REQUIRED — no query param. Sort is CLICK_HEADER_REQUIRED when SORT_VIA_URL is false.

  return `${SITE_ORIGIN}/#/digitalsuite/markets/webmarketanalysis/rankings/${industryId}/999/1m?${qs.toString()}`;
}

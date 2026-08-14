import { ArgumentError } from '@jackwener/opencli/errors';

export const DEFAULT_WEB_RANKING_LIMIT = 50;
export const MAX_WEB_RANKING_LIMIT = 1000;

export function normalizeWebRankingLimit(
  raw: unknown,
  defaultValue = DEFAULT_WEB_RANKING_LIMIT,
): number {
  const value = raw ?? defaultValue;
  const n = Number(value);
  if (!Number.isInteger(n) || n < 1) {
    throw new ArgumentError('limit must be a positive integer');
  }
  if (n > MAX_WEB_RANKING_LIMIT) {
    throw new ArgumentError(`limit must be <= ${MAX_WEB_RANKING_LIMIT}`);
  }
  return n;
}

export function rankingIdentity(row: { domain: string }): string {
  return String(row.domain || '').trim().toLowerCase();
}

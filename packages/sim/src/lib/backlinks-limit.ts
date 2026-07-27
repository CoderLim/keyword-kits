import { ArgumentError } from '@jackwener/opencli/errors';

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

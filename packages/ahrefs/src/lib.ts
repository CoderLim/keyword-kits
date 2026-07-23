import { ArgumentError } from '@jackwener/opencli/errors';

export type KdRow = {
  keyword: string;
  country: string;
  kd: number;
};

export function normalizeKeyword(raw: unknown): string {
  const keyword = String(raw ?? '').trim();
  if (!keyword) throw new ArgumentError('keyword is required');
  return keyword;
}

export function normalizeCountry(raw: unknown): string {
  const country = String(raw ?? 'us').trim().toLowerCase();
  if (!/^[a-z]{2}$/.test(country)) {
    throw new ArgumentError(
      `invalid country "${raw}". Use a two-letter code like us, uk, de`,
    );
  }
  return country;
}

export function parseKd(raw: unknown): number {
  if (raw === null || raw === undefined || raw === '') {
    throw new ArgumentError('kd is required');
  }
  const n = typeof raw === 'number' ? raw : Number(String(raw).trim());
  if (!Number.isInteger(n) || n < 0 || n > 100) {
    throw new ArgumentError(`kd must be an integer 0-100 (got ${raw})`);
  }
  return n;
}

export function toRows(keyword: string, country: string, kd: number): KdRow[] {
  return [{ keyword, country, kd: parseKd(kd) }];
}

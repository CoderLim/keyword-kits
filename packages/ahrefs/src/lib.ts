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

const COUNTRY_ALIASES: Record<string, string> = {
  uk: 'gb',
};

export function normalizeCountry(raw: unknown): string {
  let country = String(raw ?? 'us').trim().toLowerCase();
  country = COUNTRY_ALIASES[country] ?? country;
  if (!/^[a-z]{2}$/.test(country)) {
    throw new ArgumentError(
      `invalid country "${raw}". Use a two-letter code like us, gb, de (uk maps to gb)`,
    );
  }
  return country;
}

export function parseKd(raw: unknown): number {
  if (raw === null || raw === undefined) {
    throw new ArgumentError('kd is required');
  }
  if (typeof raw === 'number') {
    if (!Number.isInteger(raw) || raw < 0 || raw > 100) {
      throw new ArgumentError(`kd must be an integer 0-100 (got ${raw})`);
    }
    return raw;
  }
  const trimmed = String(raw).trim();
  if (!trimmed) {
    throw new ArgumentError('kd is required');
  }
  const n = Number(trimmed);
  if (!Number.isInteger(n) || n < 0 || n > 100) {
    throw new ArgumentError(`kd must be an integer 0-100 (got ${raw})`);
  }
  return n;
}

export function toRows(keyword: string, country: string, kd: number): KdRow[] {
  return [{ keyword, country, kd: parseKd(kd) }];
}

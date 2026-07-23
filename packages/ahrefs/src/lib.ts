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

export type BacklinksSummary = {
  domain: string;
  dr?: number;
  refDomains?: number;
  refDomainsDofollowPct?: number;
  backlinks?: number;
  backlinksDofollowPct?: number;
};

export type BacklinksResult = {
  summary: BacklinksSummary;
  links: Record<string, unknown>[];
};

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
  if (!host || !/^[a-z0-9.-]+$/.test(host) || !host.includes('.')) {
    throw new ArgumentError(`invalid domain: ${input}`);
  }
  return host;
}

export function parseCount(raw: unknown): number {
  if (raw === null || raw === undefined) {
    throw new ArgumentError('count is required');
  }
  if (typeof raw === 'number') {
    if (!Number.isFinite(raw) || raw < 0) {
      throw new ArgumentError(`invalid count: ${raw}`);
    }
    return Math.trunc(raw);
  }
  const text = String(raw).trim();
  if (!text) throw new ArgumentError('count is required');
  const m = text.replace(/,/g, '').match(/^([\d.]+)\s*([kmb])?/i);
  if (!m) throw new ArgumentError(`invalid count: ${raw}`);
  const n = Number(m[1]);
  if (!Number.isFinite(n) || n < 0) {
    throw new ArgumentError(`invalid count: ${raw}`);
  }
  const suf = (m[2] || '').toLowerCase();
  const mult =
    suf === 'k' ? 1_000 : suf === 'm' ? 1_000_000 : suf === 'b' ? 1_000_000_000 : 1;
  return Math.trunc(n * mult);
}

export function parsePercent(raw: unknown): number {
  if (raw === null || raw === undefined) {
    throw new ArgumentError('percent is required');
  }
  if (typeof raw === 'number') {
    if (!Number.isFinite(raw) || raw < 0 || raw > 100) {
      throw new ArgumentError(`percent must be 0-100 (got ${raw})`);
    }
    return raw;
  }
  const text = String(raw).trim();
  if (!text) throw new ArgumentError('percent is required');
  const m = text.match(/(\d+(?:\.\d+)?)\s*%?/);
  if (!m) throw new ArgumentError(`percent must be 0-100 (got ${raw})`);
  const n = Number(m[1]);
  if (!Number.isFinite(n) || n < 0 || n > 100) {
    throw new ArgumentError(`percent must be 0-100 (got ${raw})`);
  }
  return n;
}

export function hasSummaryMetrics(summary: BacklinksSummary): boolean {
  return [summary.dr, summary.refDomains, summary.backlinks].some(
    (v) => typeof v === 'number' && Number.isFinite(v),
  );
}

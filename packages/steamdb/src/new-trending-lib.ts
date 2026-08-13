import { ArgumentError, CommandExecutionError } from '@jackwener/opencli/errors';

export const DEFAULT_DAYS = 30;
export const DEFAULT_LIMIT = 100;
export const MAX_LIMIT = 1000;

export type ExtractedRow = {
  appid: string;
  name: string;
  releaseDate: string;
  followers: string;
  gain7d: string;
  rating: string;
};

export type TrendingRow = {
  rank: number;
  appid: number;
  keyword: string;
  name: string;
  releaseDate: string;
  followers: number;
  gain7d: number;
  rating: number | null;
  url: string;
};

export function titleToKeyword(title: string): string {
  const beforeColon = String(title ?? '').split(/[:：]/, 1)[0] ?? '';
  return beforeColon.replace(/[™®©]/g, '').replace(/\s+/g, ' ').trim();
}

export function normalizeDays(raw: unknown): number {
  const days = Number(raw ?? DEFAULT_DAYS);
  if (!Number.isInteger(days) || days < 1 || days > 3650) {
    throw new ArgumentError('days must be an integer between 1 and 3650');
  }
  return days;
}

export function normalizeLimit(raw: unknown): number {
  const limit = Number(raw ?? DEFAULT_LIMIT);
  if (!Number.isInteger(limit) || limit < 1 || limit > MAX_LIMIT) {
    throw new ArgumentError(`limit must be an integer between 1 and ${MAX_LIMIT}`);
  }
  return limit;
}

export function tablePageLength(limit: number, supportedRaw: unknown): number | null {
  const supported = Array.isArray(supportedRaw)
    ? [...new Set(supportedRaw.map(Number).filter((value) => Number.isInteger(value)))]
    : [];
  const finite = supported
    .filter((value) => value >= limit)
    .sort((a, b) => a - b);
  if (finite.length > 0) return finite[0];
  if (supported.includes(-1)) return -1;
  if (supported.length === 0) return null;
  throw new CommandExecutionError(
    `SteamDB table page lengths cannot satisfy limit ${limit}: ${supported.join(', ') || 'none'}`,
  );
}

export function normalizeNonNegative(raw: unknown, name: string): number {
  const value = Number(raw ?? 0);
  if (!Number.isFinite(value) || value < 0) {
    throw new ArgumentError(`${name} must be a non-negative number`);
  }
  return value;
}

function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function releaseWindow(
  days: number,
  now = new Date(),
): { minRelease: string; maxRelease: string } {
  const max = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const min = new Date(max);
  min.setUTCDate(min.getUTCDate() - days);
  return { minRelease: isoDate(min), maxRelease: isoDate(max) };
}

export function buildTrendingUrl(window: {
  minRelease: string;
  maxRelease: string;
}): string {
  const url = new URL('https://steamdb.info/stats/trendingfollowers/');
  url.searchParams.set('displayOnly', 'Game');
  url.searchParams.set('min_release', window.minRelease);
  url.searchParams.set('max_release', window.maxRelease);
  return url.toString();
}

function parseNumber(raw: unknown): number | null {
  const cleaned = String(raw ?? '').replace(/[,+%\s]/g, '');
  if (!cleaned || cleaned === '—' || cleaned === '-') return null;
  const value = Number(cleaned);
  return Number.isFinite(value) ? value : null;
}

export function normalizeExtractedRows(
  extracted: ExtractedRow[],
  options: { minGain: number; minRating: number; limit: number },
): TrendingRow[] {
  const rows = extracted
    .map((row) => {
      const appid = Number(row.appid);
      const followers = parseNumber(row.followers);
      const gain7d = parseNumber(row.gain7d);
      const rating = parseNumber(row.rating);
      const keyword = titleToKeyword(row.name);
      if (!Number.isInteger(appid) || appid < 1 || followers === null || gain7d === null || !keyword) {
        return null;
      }
      return {
        rank: 0,
        appid,
        keyword,
        name: row.name.trim(),
        releaseDate: row.releaseDate,
        followers,
        gain7d,
        rating,
        url: `https://steamdb.info/app/${appid}/`,
      } satisfies TrendingRow;
    })
    .filter((row): row is TrendingRow => row !== null)
    .filter((row) => row.gain7d >= options.minGain)
    .filter((row) => options.minRating === 0 || (row.rating !== null && row.rating >= options.minRating))
    .sort((a, b) => b.gain7d - a.gain7d || b.followers - a.followers)
    .slice(0, options.limit);

  return rows.map((row, index) => ({ ...row, rank: index + 1 }));
}

export function parseExtractedRows(raw: unknown): ExtractedRow[] {
  let parsed: unknown = raw;
  if (typeof raw === 'string') {
    try {
      parsed = JSON.parse(raw);
    } catch {
      throw new CommandExecutionError('Failed to parse SteamDB table rows');
    }
  }
  return Array.isArray(parsed) ? (parsed as ExtractedRow[]) : [];
}

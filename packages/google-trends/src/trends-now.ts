/**
 * google trendsNow — Google Trends "Trending Now" via public batchexecute API.
 *
 * Strategy note:
 *   Strategy: PUBLIC
 *   Evidence:
 *   - UI: https://trends.google.com/trending?geo=US&hl=en-US&status=active&hours=24
 *   - API: POST /_/TrendsUi/data/batchexecute?rpcids=i0OFE
 *     request: [null, null, geo, 0, hl, hours]
 *   - status filter is client-side: item[4] null => active, else ended
 */

import { ArgumentError, CliError } from '@jackwener/opencli/errors';
import { cli, Strategy } from '@jackwener/opencli/registry';

const ALLOWED_HOURS = new Set([4, 24, 48, 168]);
const ALLOWED_STATUS = new Set(['active', 'ended', 'all']);
const DEFAULT_LIMIT = 25;
const MAX_LIMIT = 500;
const BATCH_URL =
  'https://trends.google.com/_/TrendsUi/data/batchexecute?rpcids=i0OFE&source-path=%2Ftrending';

type TrendRow = {
  title: string;
  volume: number | '';
  increase: number | '';
  status: 'active' | 'ended';
  started: number | '';
  ended: number | '';
  breakdown: string;
};

function normalizeGeo(raw: unknown): string {
  const geo = String(raw ?? 'US').trim().toUpperCase();
  if (!geo || !/^[A-Z]{2}(-[A-Z0-9]+)?$/.test(geo)) {
    throw new ArgumentError(`invalid geo "${raw}". Use a region code like US, JP, GB`);
  }
  return geo;
}

function normalizeHours(raw: unknown): number {
  const n = Number(raw ?? 24);
  if (!Number.isInteger(n) || !ALLOWED_HOURS.has(n)) {
    throw new ArgumentError(`hours must be one of 4, 24, 48, 168 (got ${raw})`);
  }
  return n;
}

function normalizeStatus(raw: unknown): 'active' | 'ended' | 'all' {
  const status = String(raw ?? 'active').trim().toLowerCase();
  if (!ALLOWED_STATUS.has(status)) {
    throw new ArgumentError(`status must be active, ended, or all (got ${raw})`);
  }
  return status as 'active' | 'ended' | 'all';
}

function normalizeLimit(raw: unknown): number {
  const n = Number(raw ?? DEFAULT_LIMIT);
  if (!Number.isInteger(n) || n < 1) {
    throw new ArgumentError('limit must be a positive integer');
  }
  if (n > MAX_LIMIT) {
    throw new ArgumentError(`limit must be <= ${MAX_LIMIT}`);
  }
  return n;
}

function normalizeHl(raw: unknown): string {
  const hl = String(raw ?? 'en-US').trim();
  if (!hl) throw new ArgumentError('hl is required');
  return hl;
}

/** Parse batchexecute response into trend item arrays. */
export function parseTrendsPayload(text: string): unknown[][] {
  const cleaned = text.replace(/^\)]}'\s*/, '').trim();
  let outer: unknown;
  try {
    outer = JSON.parse(cleaned);
  } catch {
    throw new CliError('FETCH_ERROR', 'Failed to parse Trends response', 'Retry later');
  }
  if (!Array.isArray(outer)) {
    throw new CliError('FETCH_ERROR', 'Unexpected Trends response shape', 'Retry later');
  }

  let payloadJson: string | undefined;
  for (const row of outer) {
    if (
      Array.isArray(row) &&
      row[0] === 'wrb.fr' &&
      row[1] === 'i0OFE' &&
      typeof row[2] === 'string'
    ) {
      payloadJson = row[2];
      break;
    }
  }
  if (!payloadJson) {
    throw new CliError('FETCH_ERROR', 'Trends payload missing', 'Check geo / hours or retry later');
  }

  let payload: unknown;
  try {
    payload = JSON.parse(payloadJson);
  } catch {
    throw new CliError('FETCH_ERROR', 'Failed to parse Trends payload', 'Retry later');
  }

  const items = Array.isArray(payload) ? payload[1] : undefined;
  if (!Array.isArray(items)) return [];
  return items as unknown[][];
}

function mapItem(item: unknown[]): TrendRow | null {
  const title = typeof item[0] === 'string' ? item[0].trim() : '';
  if (!title) return null;

  const startedArr = Array.isArray(item[3]) ? item[3] : [];
  const started = typeof startedArr[0] === 'number' ? startedArr[0] : '';
  const endedRaw = item[4];
  const ended =
    Array.isArray(endedRaw) && typeof endedRaw[0] === 'number'
      ? endedRaw[0]
      : typeof endedRaw === 'number'
        ? endedRaw
        : '';
  const status: 'active' | 'ended' = ended === '' ? 'active' : 'ended';
  const volume = typeof item[6] === 'number' ? item[6] : '';
  const increase = typeof item[8] === 'number' ? item[8] : '';
  const breakdownList = Array.isArray(item[9])
    ? item[9].filter((x): x is string => typeof x === 'string' && x.trim().length > 0)
    : [];

  return {
    title,
    volume,
    increase,
    status,
    started,
    ended,
    breakdown: breakdownList.join(', '),
  };
}

async function fetchTrendingNow(geo: string, hours: number, hl: string): Promise<TrendRow[]> {
  const request = [null, null, geo, 0, hl, hours];
  const fReq = JSON.stringify([[['i0OFE', JSON.stringify(request), null, 'generic']]]);
  const body = new URLSearchParams({ 'f.req': fReq });

  const url = `${BATCH_URL}&hl=${encodeURIComponent(hl)}`;
  let resp: Response;
  try {
    resp = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
        'User-Agent':
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
      },
      body,
    });
  } catch (e) {
    throw new CliError(
      'FETCH_ERROR',
      `Network error: ${e instanceof Error ? e.message : String(e)}`,
      'Check your network connection',
    );
  }

  if (!resp.ok) {
    throw new CliError(
      'FETCH_ERROR',
      `HTTP ${resp.status}`,
      'Check your network connection or geo code',
    );
  }

  const text = await resp.text();
  const items = parseTrendsPayload(text);
  const rows: TrendRow[] = [];
  for (const item of items) {
    if (!Array.isArray(item)) continue;
    const row = mapItem(item);
    if (row) rows.push(row);
  }
  return rows;
}

cli({
  site: 'google',
  name: 'trendsNow',
  access: 'read',
  description: 'Get Google Trends Trending Now searches',
  strategy: Strategy.PUBLIC,
  browser: false,
  args: [
    { name: 'geo', default: 'US', help: 'Region code (e.g. US, JP, GB)' },
    {
      name: 'status',
      default: 'active',
      help: 'Trend status filter: active | ended | all',
    },
    {
      name: 'hours',
      type: 'int',
      default: 24,
      help: 'Time window: 4 | 24 | 48 | 168',
    },
    { name: 'limit', type: 'int', default: DEFAULT_LIMIT, help: 'Number of results' },
    { name: 'hl', default: 'en-US', help: 'UI language (e.g. en-US)' },
  ],
  columns: ['title', 'volume', 'increase', 'status', 'started', 'ended', 'breakdown'],
  func: async (args) => {
    const geo = normalizeGeo(args.geo);
    const status = normalizeStatus(args.status);
    const hours = normalizeHours(args.hours);
    const limit = normalizeLimit(args.limit);
    const hl = normalizeHl(args.hl);

    let rows = await fetchTrendingNow(geo, hours, hl);
    if (status !== 'all') {
      rows = rows.filter((r) => r.status === status);
    }
    rows = rows.slice(0, limit);

    if (!rows.length) {
      throw new CliError(
        'NOT_FOUND',
        'No trending data found',
        'Try a different geo, hours, or status',
      );
    }
    return rows;
  },
});

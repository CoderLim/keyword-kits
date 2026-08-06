/**
 * Pure helpers for google-trends explore (parse / normalize).
 */

import { ArgumentError, CliError } from '@jackwener/opencli/errors';

export const MAX_KEYWORDS = 5;
export const DEFAULT_GEO = 'US';
export const DEFAULT_TIME = 'today 12-m';
export const DEFAULT_HL = 'en-US';
export const DEFAULT_TZ = '0';

export type RelatedQuery = {
  query: string;
  value: string | number;
};

export type RelatedBlock = {
  keyword: string;
  top: RelatedQuery[];
  rising: RelatedQuery[];
};

export type InterestPoint = {
  time: string;
  formattedTime: string;
  values: Array<number | null>;
};

export type ExploreResult = {
  keywords: string[];
  geo: string;
  time: string;
  interest: InterestPoint[];
  related: RelatedBlock[];
};

export type ExploreWidget = {
  id: string;
  token?: string;
  title?: string;
  request?: Record<string, unknown>;
};

/** Strip Google XSSI prefix and parse JSON. */
export function parseTrendsJson(text: string): unknown {
  const cleaned = text.replace(/^\)]}'\n?/, '').trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    throw new CliError(
      'FETCH_ERROR',
      'Failed to parse Trends Explore response',
      'Retry later',
    );
  }
}

export function normalizeGeo(raw: unknown): string {
  const geo = String(raw ?? DEFAULT_GEO).trim().toUpperCase();
  // Empty geo means worldwide (Explore allows blank).
  if (!geo) return '';
  if (!/^[A-Z]{2}(-[A-Z0-9]+)?$/.test(geo)) {
    throw new ArgumentError(`invalid geo "${raw}". Use a region code like US, JP, GB (or empty for worldwide)`);
  }
  return geo;
}

export function normalizeTime(raw: unknown): string {
  const time = String(raw ?? DEFAULT_TIME).trim();
  if (!time) throw new ArgumentError('time is required');
  return time;
}

export function normalizeHl(raw: unknown): string {
  const hl = String(raw ?? DEFAULT_HL).trim();
  if (!hl) throw new ArgumentError('hl is required');
  return hl;
}

export function normalizeTz(raw: unknown): string {
  if (raw === undefined || raw === null || raw === '') return DEFAULT_TZ;
  const n = Number(raw);
  if (!Number.isFinite(n) || !Number.isInteger(n)) {
    throw new ArgumentError(`tz must be an integer offset in minutes (got ${raw})`);
  }
  return String(n);
}

/**
 * Collect up to 5 keywords from positional args (keyword … keyword5).
 * Also splits a single comma-separated first arg when no other positionals given.
 */
export function normalizeKeywords(args: Record<string, unknown>): string[] {
  const keys = ['keyword', 'keyword2', 'keyword3', 'keyword4', 'keyword5'] as const;
  const collected: string[] = [];
  for (const k of keys) {
    const v = args[k];
    if (v === undefined || v === null) continue;
    const s = String(v).trim();
    if (s) collected.push(s);
  }

  if (collected.length === 1 && collected[0].includes(',')) {
    const split = collected[0]
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    if (split.length > 1) {
      if (split.length > MAX_KEYWORDS) {
        throw new ArgumentError(`at most ${MAX_KEYWORDS} keywords (got ${split.length})`);
      }
      return split;
    }
  }

  if (collected.length === 0) {
    throw new ArgumentError('at least one keyword is required');
  }
  if (collected.length > MAX_KEYWORDS) {
    throw new ArgumentError(`at most ${MAX_KEYWORDS} keywords (got ${collected.length})`);
  }
  return collected;
}

export function buildExploreReq(keywords: string[], geo: string, time: string): string {
  return JSON.stringify({
    comparisonItem: keywords.map((keyword) => ({ keyword, geo, time })),
    category: 0,
    property: '',
  });
}

export function extractWidgets(explorePayload: unknown): ExploreWidget[] {
  if (!explorePayload || typeof explorePayload !== 'object') {
    throw new CliError('FETCH_ERROR', 'Unexpected explore payload', 'Retry later');
  }
  const widgets = (explorePayload as { widgets?: unknown }).widgets;
  if (!Array.isArray(widgets)) {
    throw new CliError('FETCH_ERROR', 'Explore widgets missing', 'Retry later');
  }
  return widgets.filter(
    (w): w is ExploreWidget =>
      !!w && typeof w === 'object' && typeof (w as ExploreWidget).id === 'string',
  );
}

export function findTimeseriesWidget(widgets: ExploreWidget[]): ExploreWidget {
  const w = widgets.find((x) => x.id === 'TIMESERIES');
  if (!w?.token || !w.request) {
    throw new CliError(
      'FETCH_ERROR',
      'TIMESERIES widget missing from explore response',
      'Retry later or try different keywords',
    );
  }
  return w;
}

/** RELATED_QUERIES or RELATED_QUERIES_0 … for multi-keyword compares. */
export function findRelatedQueryWidgets(widgets: ExploreWidget[]): ExploreWidget[] {
  return widgets.filter(
    (w) =>
      (w.id === 'RELATED_QUERIES' || /^RELATED_QUERIES_\d+$/.test(w.id)) &&
      !!w.token &&
      !!w.request,
  );
}

export function keywordFromRelatedWidget(
  widget: ExploreWidget,
  fallbackIndex: number,
  keywords: string[],
): string {
  const req = widget.request ?? {};
  const restriction = req.restriction as
    | {
        complexKeywordsRestriction?: { keyword?: Array<{ value?: string }> };
      }
    | undefined;
  const fromRestriction = restriction?.complexKeywordsRestriction?.keyword?.[0]?.value;
  if (typeof fromRestriction === 'string' && fromRestriction.trim()) {
    return fromRestriction.trim();
  }
  return keywords[fallbackIndex] ?? keywords[0] ?? '';
}

function mapRelatedQuery(item: unknown): RelatedQuery | null {
  if (!item || typeof item !== 'object') return null;
  const row = item as {
    query?: unknown;
    value?: unknown;
    formattedValue?: unknown;
  };
  const query = typeof row.query === 'string' ? row.query.trim() : '';
  if (!query) return null;

  if (typeof row.value === 'number' || typeof row.value === 'string') {
    return { query, value: row.value };
  }
  if (typeof row.formattedValue === 'string' && row.formattedValue.trim()) {
    return { query, value: row.formattedValue.trim() };
  }
  return { query, value: '' };
}

export function parseRelatedSearches(
  text: string,
  keyword: string,
): RelatedBlock {
  const data = parseTrendsJson(text) as {
    default?: { rankedList?: Array<{ rankedKeyword?: unknown[] }> };
  };
  const lists = data.default?.rankedList ?? [];
  const topRaw = lists[0]?.rankedKeyword ?? [];
  const risingRaw = lists[1]?.rankedKeyword ?? [];
  return {
    keyword,
    top: topRaw.map(mapRelatedQuery).filter((x): x is RelatedQuery => !!x),
    rising: risingRaw.map(mapRelatedQuery).filter((x): x is RelatedQuery => !!x),
  };
}

export function parseMultilineInterest(
  text: string,
  keywordCount: number,
): InterestPoint[] {
  const data = parseTrendsJson(text) as {
    default?: {
      timelineData?: Array<{
        time?: unknown;
        formattedTime?: unknown;
        value?: unknown;
        hasData?: unknown;
      }>;
    };
  };
  const timeline = data.default?.timelineData ?? [];
  const points: InterestPoint[] = [];
  for (const row of timeline) {
    const time = row.time != null ? String(row.time) : '';
    const formattedTime =
      typeof row.formattedTime === 'string' ? row.formattedTime : time;
    const rawValues = Array.isArray(row.value) ? row.value : [];
    const values: Array<number | null> = [];
    for (let i = 0; i < keywordCount; i++) {
      const v = rawValues[i];
      if (typeof v === 'number' && Number.isFinite(v)) values.push(v);
      else values.push(null);
    }
    points.push({ time, formattedTime, values });
  }
  return points;
}

export function throwHttpError(status: number, context: string): never {
  if (status === 429) {
    throw new CliError(
      'FETCH_ERROR',
      `Google Trends rate-limited (${context}, HTTP 429)`,
      'Wait and retry, or use fewer keywords',
    );
  }
  throw new CliError(
    'FETCH_ERROR',
    `Google Trends ${context} failed (HTTP ${status})`,
    'Check network, geo, time, or retry later',
  );
}

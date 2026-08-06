/**
 * google-trends explore — interest over time + related queries via Explore token dance.
 *
 * Strategy: PUBLIC
 * Evidence (2026-08-06 live recon):
 *   - UI: https://trends.google.com/trends/explore?q=…&geo=…&date=…
 *   - GET /trends/api/explore → widgets + tokens (TIMESERIES, RELATED_QUERIES[_N], …)
 *   - GET /trends/api/widgetdata/multiline → interest over time (multi-series)
 *   - GET /trends/api/widgetdata/relatedsearches → top / rising per keyword
 *   - Responses prefixed with )]}'
 *   - Cookie warm-up on /trends/explore; serial requests; token IP-bound
 *   - Max 5 keywords per comparison
 */

import { CliError } from '@jackwener/opencli/errors';
import { cli, Strategy } from '@jackwener/opencli/registry';
import {
  buildExploreReq,
  extractWidgets,
  findRelatedQueryWidgets,
  findTimeseriesWidget,
  keywordFromRelatedWidget,
  normalizeGeo,
  normalizeHl,
  normalizeKeywords,
  normalizeTime,
  normalizeTz,
  parseMultilineInterest,
  parseRelatedSearches,
  parseTrendsJson,
  throwHttpError,
  type ExploreResult,
} from './explore-lib.js';

const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

const EXPLORE_PAGE = 'https://trends.google.com/trends/explore';
const EXPLORE_API = 'https://trends.google.com/trends/api/explore';
const MULTILINE_API = 'https://trends.google.com/trends/api/widgetdata/multiline';
const RELATED_API = 'https://trends.google.com/trends/api/widgetdata/relatedsearches';

/** Scalar columns for table; nested interest/related still present in json/yaml. */
const COLUMNS = ['keywords', 'geo', 'time', 'interestPoints', 'relatedCount'] as const;

type ExploreRow = ExploreResult & {
  interestPoints: number;
  relatedCount: number;
};

class CookieJar {
  private readonly map = new Map<string, string>();

  store(resp: Response): void {
    const raw =
      typeof resp.headers.getSetCookie === 'function' ? resp.headers.getSetCookie() : [];
    for (const c of raw) {
      const [pair] = c.split(';');
      const eq = pair.indexOf('=');
      if (eq > 0) this.map.set(pair.slice(0, eq), pair.slice(eq + 1));
    }
  }

  header(): string {
    return [...this.map.entries()].map(([k, v]) => `${k}=${v}`).join('; ');
  }
}

async function trendsFetch(
  url: string,
  jar: CookieJar,
  referer: string,
): Promise<Response> {
  let resp: Response;
  try {
    resp = await fetch(url, {
      headers: {
        'User-Agent': UA,
        Accept: 'application/json, text/plain, */*',
        'Accept-Language': 'en-US,en;q=0.9',
        Referer: referer,
        ...(jar.header() ? { Cookie: jar.header() } : {}),
      },
      redirect: 'follow',
    });
  } catch (e) {
    throw new CliError(
      'FETCH_ERROR',
      `Network error: ${e instanceof Error ? e.message : String(e)}`,
      'Check your network connection',
    );
  }
  jar.store(resp);
  return resp;
}

async function fetchExplore(options: {
  keywords: string[];
  geo: string;
  time: string;
  hl: string;
  tz: string;
}): Promise<ExploreResult> {
  const { keywords, geo, time, hl, tz } = options;
  const jar = new CookieJar();

  const pageQs = new URLSearchParams();
  pageQs.set('q', keywords.join(','));
  if (geo) pageQs.set('geo', geo);
  pageQs.set('date', time);
  const pageUrl = `${EXPLORE_PAGE}?${pageQs.toString()}`;

  // Cookie warm-up (page may return 429 HTML while still setting NID).
  const warm = await trendsFetch(pageUrl, jar, EXPLORE_PAGE);
  jar.store(warm);

  const exploreUrl = new URL(EXPLORE_API);
  exploreUrl.searchParams.set('hl', hl);
  exploreUrl.searchParams.set('tz', tz);
  exploreUrl.searchParams.set('req', buildExploreReq(keywords, geo, time));

  const exploreResp = await trendsFetch(exploreUrl.toString(), jar, pageUrl);
  if (!exploreResp.ok) throwHttpError(exploreResp.status, 'explore');
  const exploreText = await exploreResp.text();
  const widgets = extractWidgets(parseTrendsJson(exploreText));

  const ts = findTimeseriesWidget(widgets);
  const multilineUrl = new URL(MULTILINE_API);
  multilineUrl.searchParams.set('hl', hl);
  multilineUrl.searchParams.set('tz', tz);
  multilineUrl.searchParams.set('req', JSON.stringify(ts.request));
  multilineUrl.searchParams.set('token', String(ts.token));

  const multilineResp = await trendsFetch(multilineUrl.toString(), jar, pageUrl);
  if (!multilineResp.ok) throwHttpError(multilineResp.status, 'multiline');
  const interest = parseMultilineInterest(await multilineResp.text(), keywords.length);

  const relatedWidgets = findRelatedQueryWidgets(widgets);
  const related: ExploreResult['related'] = [];
  for (let i = 0; i < relatedWidgets.length; i++) {
    const w = relatedWidgets[i];
    const relatedUrl = new URL(RELATED_API);
    relatedUrl.searchParams.set('hl', hl);
    relatedUrl.searchParams.set('tz', tz);
    relatedUrl.searchParams.set('req', JSON.stringify(w.request));
    relatedUrl.searchParams.set('token', String(w.token));
    const relatedResp = await trendsFetch(relatedUrl.toString(), jar, pageUrl);
    if (!relatedResp.ok) throwHttpError(relatedResp.status, `relatedsearches[${i}]`);
    const keyword = keywordFromRelatedWidget(w, i, keywords);
    related.push(parseRelatedSearches(await relatedResp.text(), keyword));
  }

  return { keywords, geo, time, interest, related };
}

cli({
  site: 'google-trends',
  name: 'explore',
  access: 'read',
  description:
    'Google Trends Explore: interest over time + related queries (max 5 keywords). Prefer -f json.',
  strategy: Strategy.PUBLIC,
  browser: false,
  defaultFormat: 'json',
  example: 'opencli google-trends explore "pdf to jpg" "jpg to pdf" --geo US -f json',
  args: [
    {
      name: 'keyword',
      type: 'string',
      positional: true,
      required: true,
      help: 'First keyword (or comma-separated list if used alone)',
    },
    {
      name: 'keyword2',
      type: 'string',
      positional: true,
      required: false,
      help: 'Optional 2nd keyword (max 5 total)',
    },
    {
      name: 'keyword3',
      type: 'string',
      positional: true,
      required: false,
      help: 'Optional 3rd keyword',
    },
    {
      name: 'keyword4',
      type: 'string',
      positional: true,
      required: false,
      help: 'Optional 4th keyword',
    },
    {
      name: 'keyword5',
      type: 'string',
      positional: true,
      required: false,
      help: 'Optional 5th keyword',
    },
    { name: 'geo', default: 'US', help: 'Region code (e.g. US, JP); empty for worldwide' },
    {
      name: 'time',
      default: 'today 12-m',
      help: 'Explore time range (e.g. today 12-m, now 7-d, today 3-m)',
    },
    { name: 'hl', default: 'en-US', help: 'UI language (e.g. en-US)' },
    {
      name: 'tz',
      default: '0',
      help: 'Timezone offset in minutes (Google Trends tz param)',
    },
  ],
  columns: [...COLUMNS],
  func: async (args) => {
    const keywords = normalizeKeywords(args);
    const geo = normalizeGeo(args.geo);
    const time = normalizeTime(args.time);
    const hl = normalizeHl(args.hl);
    const tz = normalizeTz(args.tz);

    const result = await fetchExplore({ keywords, geo, time, hl, tz });
    if (!result.interest.length && !result.related.length) {
      throw new CliError(
        'NOT_FOUND',
        'No Explore data returned',
        'Try different keywords, geo, or time',
      );
    }

    const row: ExploreRow = {
      ...result,
      interestPoints: result.interest.length,
      relatedCount: result.related.reduce(
        (n, b) => n + b.top.length + b.rising.length,
        0,
      ),
    };
    // Prefer -f json; nested interest/related are the real payload.
    return row;
  },
});

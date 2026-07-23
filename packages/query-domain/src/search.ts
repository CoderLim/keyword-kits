/**
 * queryDomain search — keyword → domain list via query.domains PUBLIC SSE.
 *
 * Strategy: PUBLIC
 * Contract: upstream SSE JSON + /api/dr
 * Evidence:
 *   - UI: https://query.domains/ (keyword → label + default TLDs)
 *   - GET /api/upstream/check?domain=...&sse=true&return_dates=true&return-prices=true
 *   - GET /api/dr?domain=...
 * Browser: false
 */

import { CliError } from '@jackwener/opencli/errors';
import { cli, Strategy } from '@jackwener/opencli/registry';
import {
  buildDomains,
  mergeCheckMeta,
  normalizeKeyword,
  parseSseEvents,
  toRows,
  type DomainMeta,
} from './lib.js';

const CHECK_BASE = 'https://query.domains/api/upstream/check';
const DR_BASE = 'https://query.domains/api/dr';
const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

async function fetchCheckSse(domains: string[]): Promise<Map<string, DomainMeta>> {
  const url =
    `${CHECK_BASE}?domain=${encodeURIComponent(domains.join(','))}` +
    `&sse=true&return_dates=true&return-prices=true`;
  let resp: Response;
  try {
    resp = await fetch(url, {
      headers: {
        Accept: 'text/event-stream',
        'User-Agent': UA,
        Referer: 'https://query.domains/',
        Origin: 'https://query.domains',
      },
    });
  } catch (e) {
    throw new CliError(
      'FETCH_ERROR',
      `Network error: ${e instanceof Error ? e.message : String(e)}`,
      'Check your network connection',
    );
  }
  if (resp.status === 429) {
    throw new CliError(
      'RATE_LIMITED',
      'query.domains rate limit (429)',
      'Retry later, sign in, or upgrade to Pro on query.domains',
      75,
    );
  }
  if (!resp.ok) {
    throw new CliError('FETCH_ERROR', `HTTP ${resp.status}`, 'Retry later');
  }
  const text = await resp.text();
  const map = new Map<string, DomainMeta>();
  for (const ev of parseSseEvents(text)) {
    mergeCheckMeta(map, ev);
  }
  return map;
}

async function fetchDrMap(domains: string[]): Promise<Record<string, number>> {
  const url = `${DR_BASE}?domain=${encodeURIComponent(domains.join(','))}`;
  let resp: Response;
  try {
    resp = await fetch(url, {
      headers: {
        Accept: 'application/json',
        'User-Agent': UA,
        Referer: 'https://query.domains/',
      },
    });
  } catch (e) {
    throw new CliError(
      'FETCH_ERROR',
      `DR network error: ${e instanceof Error ? e.message : String(e)}`,
      'Check your network connection',
    );
  }
  if (resp.status === 429) {
    throw new CliError('RATE_LIMITED', 'query.domains DR rate limit (429)', 'Retry later', 75);
  }
  if (!resp.ok) {
    throw new CliError('FETCH_ERROR', `DR HTTP ${resp.status}`, 'Retry later');
  }
  let json: { data?: Record<string, number> };
  try {
    json = (await resp.json()) as { data?: Record<string, number> };
  } catch {
    throw new CliError('FETCH_ERROR', 'DR response is not valid JSON', 'Retry later');
  }
  return json.data && typeof json.data === 'object' ? json.data : {};
}

cli({
  site: 'queryDomain',
  name: 'search',
  access: 'read',
  description: 'Search query.domains for domains related to a keyword (default 14 TLDs)',
  domain: 'query.domains',
  strategy: Strategy.PUBLIC,
  browser: false,
  args: [
    {
      name: 'keyword',
      type: 'string',
      required: true,
      positional: true,
      help: 'Keyword(s), e.g. "ai image" → aiimage.{tld}',
    },
  ],
  columns: ['domain', 'year', 'dr', 'forSale', 'registered', 'expires', 'existed'],
  func: async (args) => {
    const label = normalizeKeyword(args.keyword);
    const domains = buildDomains(label);
    const metaMap = await fetchCheckSse(domains);
    const drMap = await fetchDrMap(domains);
    return toRows(domains, metaMap, drMap);
  },
});

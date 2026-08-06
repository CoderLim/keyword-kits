/**
 * aitdk get-data - full domain snapshot via AITDK (wapi.aitdk.com/api/v1/bulk).
 *
 * Strategy: PUBLIC (no browser, no login)
 * Contract:
 *   - GET https://wapi.aitdk.com/api/v1/bulk?domain=&stream=true&view=full
 *     &nonce=&signature=&timestamp=
 *   - Response: text/event-stream with events whois | traffic | status | complete
 * Auth: none. Signature is a SHA-256 of a canonical string built with a static
 *   secret bundled in the AITDK Chrome extension shell (extension.aitdk.com).
 * Evidence (2026-08-05 live recon + verified):
 *   - Bundle https://extension.aitdk.com/assets/index-*.js exposes signing:
 *       config = { baseUrl:"https://wapi.aitdk.com",
 *                  secretKey:"541737bb-02ce-4fb6-8157-3c7166873777", mode:"param" }
 *       signature = SHA256([METHOD,path,sortedParams,ts,nonce].join("\n") + "\n" + secret)
 *       nonce = 16 rand chars [A-Za-z0-9]; ts = floor(now/1000)
 *   - Reproduced the user's captured request for websitecloner.io exactly.
 *   - Unknown/unregistered domain -> only `status` event {data:{status:3}}, no
 *     whois/traffic.
 * Browser: false
 */
import { CliError, EmptyResultError } from '@jackwener/opencli/errors';
import { cli, Strategy } from '@jackwener/opencli/registry';
import {
  buildBulkUrl,
  mapTraffic,
  mapWhois,
  normalizeDomain,
  parseSseEvents,
  type TrafficInfo,
  type WhoisInfo,
} from './lib.js';

const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

/** Scalar columns drive the default table; nested fields show in json/yaml. */
const COLUMNS = [
  'domain',
  'visits',
  'globalRank',
  'countryRank',
  'bounceRate',
  'pagePerVisit',
  'timeOnSite',
  'registrar',
  'registered',
  'expires',
] as const;

type GetDataResult = {
  // scalars (table columns)
  domain: string;
  visits: number | null;
  globalRank: number | null;
  countryRank: number | null;
  bounceRate: number | null;
  pagePerVisit: number | null;
  timeOnSite: number | null;
  registrar: string;
  registered: string;
  expires: string;
  // nested (json / yaml only)
  title: string;
  description: string;
  updated: string;
  dataMonth: string;
  dataYear: string;
  nameservers: string[];
  status: string[];
  trafficSources: Record<string, number>;
  topKeywords: unknown[];
  topRegions: unknown[];
  aiTraffic: Array<{ name: string; value: number | null }>;
  monthlyVisits: Record<string, number>;
};

/** SSE data payload is { domain, data }. */
function eventData(ev: unknown): unknown {
  if (ev && typeof ev === 'object' && 'data' in ev) {
    return (ev as { data?: unknown }).data;
  }
  return undefined;
}

/** True if the stream signalled "no data" (status event without whois/traffic). */
function isNoDataStatus(ev: unknown): boolean {
  const d = eventData(ev);
  if (d && typeof d === 'object' && 'status' in d) {
    const s = (d as { status?: unknown }).status;
    return typeof s === 'number' || typeof s === 'string';
  }
  return false;
}

async function fetchBulk(domain: string): Promise<string> {
  const url = buildBulkUrl(domain);
  let resp: Response;
  try {
    resp = await fetch(url, {
      headers: {
        Accept: '*/*',
        'User-Agent': UA,
        Origin: 'https://extension.aitdk.com',
        Referer: 'https://extension.aitdk.com/',
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
      'wapi.aitdk.com rate limit (429)',
      'Retry later',
      75,
    );
  }
  if (resp.status === 401 || resp.status === 403) {
    throw new CliError(
      'AUTH_ERROR',
      `wapi.aitdk.com rejected the signed request (HTTP ${resp.status})`,
      'The bundled signing secret may have rotated; re-run: npm run extract:aitdk-secret (then update SECRET in packages/aitdk/src/lib.ts and rebuild)',
    );
  }
  if (!resp.ok) {
    throw new CliError(
      'FETCH_ERROR',
      `wapi.aitdk.com HTTP ${resp.status}`,
      'Retry later',
    );
  }
  return resp.text();
}

cli({
  site: 'aitdk',
  name: 'get-data',
  access: 'read',
  description:
    '查询域名 SEO 数据快照（AITDK / wapi.aitdk.com，whois + 流量，无需 Chrome）',
  domain: 'wapi.aitdk.com',
  strategy: Strategy.PUBLIC,
  browser: false,
  args: [
    {
      name: 'domain',
      type: 'string',
      required: true,
      positional: true,
      help: '目标域名（如 ahrefs.com）',
    },
  ],
  columns: [...COLUMNS],
  func: async (args) => {
    const domain = normalizeDomain(args.domain);
    const text = await fetchBulk(domain);
    const events = parseSseEvents(text);

    let whoisEv: unknown = undefined;
    let trafficEv: unknown = undefined;
    let statusEv: unknown = undefined;
    for (const ev of events) {
      if (ev.event === 'whois') whoisEv = ev.data;
      else if (ev.event === 'traffic') trafficEv = ev.data;
      else if (ev.event === 'status') statusEv = ev.data;
    }

    if (!whoisEv && !trafficEv) {
      if (statusEv && isNoDataStatus(statusEv)) {
        throw new EmptyResultError(
          'aitdk get-data',
          `No data for ${domain} (unregistered or unknown domain)`,
        );
      }
      throw new EmptyResultError(
        'aitdk get-data',
        `No whois/traffic data returned for ${domain}`,
      );
    }

    const whois: WhoisInfo = whoisEv
      ? mapWhois(eventData(whoisEv))
      : {
          registrar: '',
          registered: '',
          expires: '',
          updated: '',
          nameservers: [],
          status: [],
        };

    const traffic: TrafficInfo | null = trafficEv
      ? mapTraffic(eventData(trafficEv))
      : null;
    const ov = traffic?.overview;

    const result: GetDataResult = {
      domain,
      visits: ov?.visits ?? null,
      globalRank: ov?.globalRank ?? null,
      countryRank: ov?.countryRank ?? null,
      bounceRate: ov?.bounceRate ?? null,
      pagePerVisit: ov?.pagePerVisit ?? null,
      timeOnSite: ov?.timeOnSite ?? null,
      registrar: whois.registrar,
      registered: whois.registered,
      expires: whois.expires,
      title: traffic?.title ?? '',
      description: traffic?.description ?? '',
      updated: whois.updated,
      dataMonth: ov?.dataMonth ?? '',
      dataYear: ov?.dataYear ?? '',
      nameservers: whois.nameservers,
      status: whois.status,
      trafficSources: traffic?.trafficSources ?? {},
      topKeywords: traffic?.topKeywords ?? [],
      topRegions: traffic?.topRegions ?? [],
      aiTraffic: traffic?.aiTraffic ?? [],
      monthlyVisits: traffic?.monthlyVisits ?? {},
    };

    return result;
  },
});

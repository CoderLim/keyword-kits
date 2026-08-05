/**
 * Pure helpers for aitdk get-data (wapi.aitdk.com /api/v1/bulk).
 *
 * Strategy: PUBLIC
 * Contract: GET https://wapi.aitdk.com/api/v1/bulk?domain=&stream=true&view=full
 *   &nonce=&signature=&timestamp=
 * Auth: none. Signature is SHA-256 of a canonical string built with a static
 *   secret embedded in the AITDK extension bundle (see get-data.ts header).
 * Browser: false
 */
import { createHash, randomBytes } from 'node:crypto';
import { ArgumentError } from '@jackwener/opencli/errors';

/** Static signing secret extracted from extension.aitdk.com bundle. */
export const SECRET = '541737bb-02ce-4fb6-8157-3c7166873777';
export const BASE_URL = 'https://wapi.aitdk.com';
export const BULK_PATH = '/api/v1/bulk';
const ALPHABET =
  'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

/** Strip protocol/path/query; keep host (lowercase). Drop leading www. */
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
  host = host.replace(/^www\./, '');
  if (!host || !/^[a-z0-9.-]+$/.test(host) || !host.includes('.')) {
    throw new ArgumentError(`invalid domain: ${input}`);
  }
  return host;
}

/** 16 random chars from [A-Za-z0-9] (mirrors extension wc()). */
export function randomNonce(len = 16): string {
  const bytes = randomBytes(len);
  let out = '';
  for (let i = 0; i < len; i++) out += ALPHABET[bytes[i]! % ALPHABET.length]!;
  return out;
}

/**
 * Canonical query string: sort keys asc, sort each key's values asc,
 * URLSearchParams.toString(). Matches extension Ic()/normalizeParams().
 */
export function normalizeParams(params: Record<string, string>): string {
  const incoming = new URLSearchParams(params);
  const sorted = new URLSearchParams();
  for (const key of Array.from(new Set(incoming.keys())).sort()) {
    const values = incoming.getAll(key).sort();
    for (const v of values) sorted.append(key, v);
  }
  return sorted.toString();
}

/**
 * signature = SHA-256([METHOD, path, normalizeParams(params), ts, nonce].join("\n")
 *   + "\n" + secret)  (plain digest, hex).
 */
export function sign(
  method: string,
  path: string,
  params: Record<string, string>,
  timestamp: string,
  nonce: string,
  secret: string = SECRET,
): string {
  const canonical =
    [method.toUpperCase(), path, normalizeParams(params), timestamp, nonce].join(
      '\n',
    ) +
    '\n' +
    secret;
  return createHash('sha256').update(canonical, 'utf8').digest('hex');
}

/** Build the signed bulk URL for a domain. */
export function buildBulkUrl(
  domain: string,
  opts: { timestamp?: string; nonce?: string; secret?: string } = {},
): string {
  const params: Record<string, string> = {
    domain,
    stream: 'true',
    view: 'full',
  };
  const timestamp = opts.timestamp ?? String(Math.floor(Date.now() / 1000));
  const nonce = opts.nonce ?? randomNonce();
  const signature = sign(
    'GET',
    BULK_PATH,
    params,
    timestamp,
    nonce,
    opts.secret,
  );
  const query = new URLSearchParams({
    ...params,
    nonce,
    signature,
    timestamp,
  });
  return `${BASE_URL}${BULK_PATH}?${query.toString()}`;
}

export type SseEvent = {
  event: string;
  data: unknown;
};

/** Parse a text/event-stream body into {event, data} pairs. */
export function parseSseEvents(text: string): SseEvent[] {
  const events: SseEvent[] = [];
  const blocks = text.replace(/\r\n/g, '\n').split('\n\n');
  for (const block of blocks) {
    if (!block.trim()) continue;
    let event = 'message';
    const dataLines: string[] = [];
    for (const line of block.split('\n')) {
      if (line.startsWith('event:')) event = line.slice(6).trim();
      else if (line.startsWith('data:')) dataLines.push(line.slice(5).trim());
    }
    if (!dataLines.length) continue;
    const dataStr = dataLines.join('\n');
    try {
      events.push({ event, data: JSON.parse(dataStr) });
    } catch {
      events.push({ event, data: dataStr });
    }
  }
  return events;
}

/** ISO date (2026-08-13T04:00:00Z) -> YYYY-MM-DD; "" if missing/invalid. */
export function toDate(iso: unknown): string {
  if (typeof iso !== 'string' || !iso) return '';
  const m = iso.match(/^(\d{4}-\d{2}-\d{2})/);
  return m ? m[1]! : '';
}

function toNumber(raw: unknown): number | null {
  if (raw === null || raw === undefined || raw === '') return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

function toInt(raw: unknown): number | null {
  const n = toNumber(raw);
  return n === null ? null : Math.round(n);
}

function vcardFn(entity: unknown): string {
  const arr = (entity as { vcardArray?: unknown[] })?.vcardArray;
  if (!Array.isArray(arr) || !Array.isArray(arr[1])) return '';
  for (const field of arr[1] as unknown[]) {
    // vcard property = [name, params, type, value] -> value is last element
    if (Array.isArray(field) && field[0] === 'fn') {
      return String(field[field.length - 1] ?? '');
    }
  }
  return '';
}

export type WhoisInfo = {
  registrar: string;
  registered: string;
  expires: string;
  updated: string;
  nameservers: string[];
  status: string[];
};

/** Map RDAP whois payload -> flat WhoisInfo. */
export function mapWhois(data: unknown): WhoisInfo {
  const d = (data ?? {}) as Record<string, unknown>;
  const events = Array.isArray(d.events) ? d.events : [];
  const byAction: Record<string, string> = {};
  for (const ev of events as Array<{ eventAction?: string; eventDate?: string }>) {
    if (ev && ev.eventAction && ev.eventDate) {
      byAction[ev.eventAction.toLowerCase()] = ev.eventDate;
    }
  }
  const entities = Array.isArray(d.entities) ? d.entities : [];
  const registrarEntity = entities.find(
    (e) =>
      Array.isArray((e as { roles?: unknown[] })?.roles) &&
      ((e as { roles: string[] }).roles.includes('registrar') ||
        (e as { roles: string[] }).roles.includes('registrarEntity')),
  );
  const nameservers = (Array.isArray(d.nameservers) ? d.nameservers : [])
    .map((n) =>
      String((n as { ldhName?: string })?.ldhName ?? '').toLowerCase(),
    )
    .filter(Boolean);
  const status = (Array.isArray(d.status) ? d.status : [])
    .map((s) => String(s))
    .filter(Boolean);
  return {
    registrar: vcardFn(registrarEntity ?? entities[0]),
    registered: toDate(byAction['registration']),
    expires: toDate(byAction['expiration']),
    updated: toDate(byAction['last changed']),
    nameservers,
    status,
  };
}

export type Overview = {
  visits: number | null;
  globalRank: number | null;
  countryRank: number | null;
  bounceRate: number | null;
  pagePerVisit: number | null;
  timeOnSite: number | null;
  dataMonth: string;
  dataYear: string;
};

export type TrafficInfo = {
  title: string;
  description: string;
  overview: Overview;
  trafficSources: Record<string, number>;
  topKeywords: unknown[];
  topRegions: unknown[];
  aiTraffic: Array<{ name: string; value: number | null }>;
  monthlyVisits: Record<string, number>;
};

function roundTo(n: number, digits: number): number {
  const f = 10 ** digits;
  return Math.round(n * f) / f;
}

/** Map traffic payload -> flat TrafficInfo. */
export function mapTraffic(data: unknown): TrafficInfo {
  const d = (data ?? {}) as Record<string, unknown>;
  const ov = (d.overview ?? {}) as Record<string, unknown>;
  const bounce = toNumber(ov.bounceRate);
  const ppv = toNumber(ov.pagePerVisit);
  const tos = toNumber(ov.timeOnSite);
  const overview: Overview = {
    visits: toInt(ov.visits),
    globalRank: toInt(ov.globalRank),
    countryRank: toInt(ov.countryRank),
    bounceRate: bounce === null ? null : roundTo(bounce, 4),
    pagePerVisit: ppv === null ? null : roundTo(ppv, 2),
    timeOnSite: tos === null ? null : Math.round(tos),
    dataMonth: String(ov.month ?? ''),
    dataYear: String(ov.year ?? ''),
  };

  const sources = (d.trafficSources ?? {}) as Record<string, unknown>;
  const trafficSources: Record<string, number> = {};
  for (const [k, v] of Object.entries(sources)) {
    const n = toNumber(v);
    if (n !== null) trafficSources[k] = roundTo(n, 4);
  }

  const aiTrends = (
    (d.aiTraffic as { trends?: unknown[] })?.trends ?? []
  ) as Array<{ name?: string; history?: Array<{ date?: string; value?: number }> }>;
  const aiTraffic = aiTrends.map((t) => {
    const hist = Array.isArray(t.history) ? t.history : [];
    const latest = hist.length
      ? hist.reduce((a, b) =>
          String(a.date ?? '') >= String(b.date ?? '') ? a : b,
        )
      : null;
    return { name: String(t.name ?? ''), value: toNumber(latest?.value) };
  });

  return {
    title: String(d.title ?? ''),
    description: String(d.description ?? ''),
    overview,
    trafficSources,
    topKeywords: Array.isArray(d.topKeywords) ? d.topKeywords : [],
    topRegions: Array.isArray(d.topRegions) ? d.topRegions : [],
    aiTraffic,
    monthlyVisits:
      d.monthlyVisits && typeof d.monthlyVisits === 'object'
        ? (d.monthlyVisits as Record<string, number>)
        : {},
  };
}

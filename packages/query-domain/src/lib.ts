/**
 * Pure helpers for queryDomain search (query.domains).
 */

import { ArgumentError } from '@jackwener/opencli/errors';

export const DEFAULT_TLDS = [
  'com', 'ai', 'org', 'net', 'cn', 'info', 'app', 'io', 'xyz', 'co', 'run', 'me', 'pro', 'top',
] as const;

export type DomainMeta = {
  existed: string;
  registered: string;
  expires: string;
  forSale: boolean;
};

export type DomainRow = {
  domain: string;
  year: string;
  dr: number | null;
  forSale: boolean;
  registered: string;
  expires: string;
  existed: string;
};

export type SseEvent = {
  event: string;
  data: {
    domain?: string;
    meta?: Record<string, unknown>;
  };
};

export function normalizeKeyword(raw: unknown): string {
  const s = String(raw ?? '').trim();
  if (!s) throw new ArgumentError('keyword is required');
  const label = s.split(/\s+/).join('').toLowerCase();
  if (!label) throw new ArgumentError('keyword is required');
  return label;
}

export function buildDomains(label: string): string[] {
  return DEFAULT_TLDS.map((tld) => `${label}.${tld}`);
}

export function formatDateYmd(raw: string | undefined | null): string {
  if (!raw || typeof raw !== 'string') return '';
  const m = raw.match(/^(\d{4}-\d{2}-\d{2})/);
  return m ? m[1] : '';
}

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
    try {
      const data = JSON.parse(dataLines.join('\n')) as SseEvent['data'];
      events.push({ event, data });
    } catch {
      // skip malformed chunks
    }
  }
  return events;
}

export function mergeCheckMeta(map: Map<string, DomainMeta>, ev: SseEvent): void {
  const domain = (
    ev.data.domain ||
    (ev.data.meta?.domain as string | undefined) ||
    (ev.data.meta?.id as string | undefined) ||
    ''
  )
    .toString()
    .toLowerCase();
  if (!domain || domain === '[done]') return;
  if (ev.event === '[DONE]') return;

  const prev =
    map.get(domain) ??
    ({
      existed: '',
      registered: '',
      expires: '',
      forSale: false,
    } satisfies DomainMeta);

  const meta = ev.data.meta ?? {};
  const existedRaw = meta.existed;
  if (typeof existedRaw === 'string' && existedRaw) {
    prev.existed = existedRaw.toLowerCase();
  }
  if (typeof meta.registered === 'string' && meta.registered) {
    prev.registered = meta.registered;
  }
  if (typeof meta.expires === 'string' && meta.expires) {
    prev.expires = meta.expires;
  }
  if (meta.market || meta.for_sale === true) {
    prev.forSale = true;
  }
  map.set(domain, prev);
}

export function toRows(
  domains: string[],
  metaMap: Map<string, DomainMeta>,
  drMap: Record<string, number>,
): DomainRow[] {
  return domains.map((domain) => {
    const meta = metaMap.get(domain);
    const registered = formatDateYmd(meta?.registered);
    const expires = formatDateYmd(meta?.expires);
    const year = registered ? registered.slice(0, 4) : '';
    const drVal = drMap[domain];
    return {
      domain,
      year,
      dr: typeof drVal === 'number' ? drVal : null,
      forSale: meta?.forSale ?? false,
      registered,
      expires,
      existed: meta?.existed ?? '',
    };
  });
}

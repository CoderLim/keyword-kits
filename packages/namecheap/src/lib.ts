import { ArgumentError } from '@jackwener/opencli/errors';

const MIN_NS = 2;
const MAX_NS = 12;

/** Strip protocol/path/query; keep host (lowercase). */
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

/** Parse comma/whitespace-separated nameserver hostnames. Min 2, max 12. */
export function normalizeNameservers(raw: unknown): string[] {
  const input = String(raw ?? '').trim();
  if (!input) throw new ArgumentError('--ns is required (comma-separated, min 2)');

  const parts = input
    .split(/[,;\s]+/)
    .map((s) => s.trim().toLowerCase().replace(/\.$/, ''))
    .filter(Boolean);

  if (parts.length < MIN_NS) {
    throw new ArgumentError(`need at least ${MIN_NS} nameservers, got ${parts.length}`);
  }
  if (parts.length > MAX_NS) {
    throw new ArgumentError(`at most ${MAX_NS} nameservers allowed, got ${parts.length}`);
  }

  const seen = new Set<string>();
  const out: string[] = [];
  for (const ns of parts) {
    if (!/^[a-z0-9.-]+$/.test(ns) || !ns.includes('.')) {
      throw new ArgumentError(`invalid nameserver: ${ns}`);
    }
    if (seen.has(ns)) {
      throw new ArgumentError(`duplicate nameserver: ${ns}`);
    }
    seen.add(ns);
    out.push(ns);
  }
  return out;
}

export function buildDomainPanelUrl(domain: string): string {
  return `https://ap.www.namecheap.com/domains/domaincontrolpanel/${encodeURIComponent(domain)}/domain`;
}

export function toRows(
  domain: string,
  nameservers: string[],
  message: string,
): Array<{ domain: string; nameserver: string; index: number; status: string; message: string }> {
  return nameservers.map((nameserver, i) => ({
    domain,
    nameserver,
    index: i + 1,
    status: 'saved',
    message,
  }));
}

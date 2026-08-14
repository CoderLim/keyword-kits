#!/usr/bin/env node

/**
 * WHOIS lookup via whois.freeaiapi.xyz (API-only extract from the domain-whois bookmarklet).
 * Usage:
 *   node whois.mjs example.com foo.io
 *   node whois.mjs --json example.com foo.io
 *   printf 'example.com\nfoo.io\n' | node whois.mjs --json
 */

import { pathToFileURL } from 'node:url';

export const SUFFIXES = [
  'com', 'box', 'net', 'org', 'me', 'xyz', 'im', 'info', 'io', 'co', 'ai',
  'biz', 'us', 'app', 'sg', 'cafe', 'now', 'shop', 'life', 'cn', 'uk',
  'chat', 'design', 'fun', 'website', 'link', 'site', 'online', 'cards',
  'fr', 'sk', 'it', 'new', 'video',
  'co.uk', 'org.uk', 'me.uk',
  'com.cn', 'net.cn', 'org.cn',
  'com.au', 'net.au', 'org.au',
  'co.jp', 'ne.jp', 'or.jp',
  'co.kr', 'co.in',
];

const SUFFIXES_BY_LENGTH = [...SUFFIXES].sort((a, b) => b.length - a.length);
const WHOIS_ENDPOINT = 'https://whois.freeaiapi.xyz/';
const DEFAULT_CONCURRENCY = 3;
const DEFAULT_GAP_MS = 800;

export function parseRegistrable(raw) {
  if (typeof raw !== 'string') return null;
  const host = raw
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/\/.*$/, '')
    .replace(/^www\./, '');
  if (!host) return null;
  const suffix = SUFFIXES_BY_LENGTH.find((item) => host.endsWith(`.${item}`));
  if (!suffix) return null;
  const labels = host.slice(0, -(suffix.length + 1)).split('.').filter(Boolean);
  if (!labels.length) return null;
  return { name: labels[labels.length - 1], suffix, domain: `${labels[labels.length - 1]}.${suffix}` };
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function emptyRow(domain, extra = {}) {
  return {
    domain,
    registrable: null,
    name: null,
    suffix: null,
    creationDatetime: null,
    timestamp: null,
    status: 'unsupported',
    ...extra,
  };
}

export async function lookupWhois(raw, { fetchImpl = fetch } = {}) {
  const parsed = parseRegistrable(raw);
  const input = String(raw ?? '')
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/\/.*$/, '')
    .replace(/^www\./, '');
  if (!parsed) return emptyRow(input || String(raw ?? ''));

  const url = `${WHOIS_ENDPOINT}?name=${encodeURIComponent(parsed.name)}&suffix=${encodeURIComponent(parsed.suffix)}&c=1`;
  try {
    const response = await fetchImpl(url);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const body = await response.json();
    let creationDatetime = null;
    let timestamp = null;
    let status = 'unknown';
    if (body && body.status === 'ok' && body.creation_datetime) {
      creationDatetime = String(body.creation_datetime).trim();
      const parsedTime = Date.parse(creationDatetime);
      if (!Number.isNaN(parsedTime)) {
        timestamp = parsedTime;
        status = 'ok';
      }
    }
    return {
      domain: input,
      registrable: parsed.domain,
      name: parsed.name,
      suffix: parsed.suffix,
      creationDatetime,
      timestamp,
      status,
    };
  } catch (error) {
    return {
      domain: input,
      registrable: parsed.domain,
      name: parsed.name,
      suffix: parsed.suffix,
      creationDatetime: null,
      timestamp: null,
      status: 'error',
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export async function lookupWhoisMany(
  domains,
  { concurrency = DEFAULT_CONCURRENCY, gapMs = DEFAULT_GAP_MS, fetchImpl = fetch } = {},
) {
  const unique = [];
  const seen = new Set();
  for (const raw of domains) {
    const key = String(raw ?? '').trim().toLowerCase().replace(/^www\./, '');
    if (!key || seen.has(key)) continue;
    seen.add(key);
    unique.push(key);
  }

  const cache = new Map();
  const lookup = async (domain) => {
    const parsed = parseRegistrable(domain);
    if (parsed && cache.has(parsed.domain)) {
      return { ...cache.get(parsed.domain), domain };
    }
    const row = await lookupWhois(domain, { fetchImpl });
    if (row.registrable) cache.set(row.registrable, row);
    return row;
  };

  const results = [];
  for (let i = 0; i < unique.length; i += concurrency) {
    const batch = unique.slice(i, i + concurrency);
    const rows = await Promise.all(batch.map(lookup));
    results.push(...rows);
    if (i + concurrency < unique.length) await sleep(gapMs);
  }
  return results;
}

export function sortByCreationDesc(rows) {
  return [...rows].sort((a, b) => {
    if (a.timestamp && b.timestamp) return b.timestamp - a.timestamp;
    if (a.timestamp) return -1;
    if (b.timestamp) return 1;
    return a.domain.localeCompare(b.domain);
  });
}

export function formatDate(timestamp) {
  if (!timestamp) return 'Unknown';
  const date = new Date(timestamp);
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  const d = String(date.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function collectDomains(argv, stdinText) {
  const domains = [];
  for (const arg of argv) {
    if (arg.startsWith('--')) continue;
    domains.push(arg);
  }
  if (!domains.length && stdinText) {
    const trimmed = stdinText.trim();
    if (trimmed.startsWith('[')) {
      const parsed = JSON.parse(trimmed);
      if (!Array.isArray(parsed)) throw new Error('stdin JSON must be an array of domains');
      domains.push(...parsed);
    } else {
      domains.push(...trimmed.split(/\s+/).filter(Boolean));
    }
  }
  return domains;
}

export async function main(argv = process.argv.slice(2), stdinText = '') {
  const json = argv.includes('--json');
  const topIndex = argv.indexOf('--top');
  const top = topIndex >= 0 ? Number(argv[topIndex + 1]) : null;
  if (argv.includes('-h') || argv.includes('--help')) {
    process.stdout.write(`Usage: whois.mjs [--json] [--top N] <domain>...\n`);
    return;
  }

  const domains = collectDomains(argv, stdinText);
  if (!domains.length) throw new Error('pass one or more domains, or pipe them on stdin');

  const rows = sortByCreationDesc(await lookupWhoisMany(domains));
  const sliced = Number.isInteger(top) && top > 0 ? rows.slice(0, top) : rows;

  if (json) {
    process.stdout.write(`${JSON.stringify(sliced, null, 2)}\n`);
    return;
  }
  for (const row of sliced) {
    process.stdout.write(`${formatDate(row.timestamp)}\t${row.domain}\t${row.status}\n`);
  }
}

function hasPositionalDomains(argv) {
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--top') {
      i += 1;
      continue;
    }
    if (arg.startsWith('--')) continue;
    return true;
  }
  return false;
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  const argv = process.argv.slice(2);
  const chunks = [];
  if (!hasPositionalDomains(argv) && !process.stdin.isTTY) {
    for await (const chunk of process.stdin) chunks.push(chunk);
  }
  main(argv, chunks.join('')).catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}

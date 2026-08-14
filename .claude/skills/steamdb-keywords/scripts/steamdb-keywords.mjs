#!/usr/bin/env node

import { spawn } from 'node:child_process';
import { pathToFileURL } from 'node:url';

const COMMON_TLDS = ['com', 'org', 'net'];

function takeValue(argv, index, option) {
  const value = argv[index + 1];
  if (value === undefined || value.startsWith('--')) {
    throw new Error(`${option} requires a value`);
  }
  return value;
}

function positiveInteger(raw, option, max = Number.MAX_SAFE_INTEGER) {
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 1 || value > max) {
    throw new Error(`${option} must be an integer between 1 and ${max}`);
  }
  return value;
}

function nonNegativeNumber(raw, option) {
  const value = Number(raw);
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`${option} must be a non-negative number`);
  }
  return value;
}

function daysSince(raw) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    throw new Error('--since must use YYYY-MM-DD');
  }
  const since = new Date(`${raw}T00:00:00Z`);
  if (Number.isNaN(since.getTime()) || since.toISOString().slice(0, 10) !== raw) {
    throw new Error('--since must be a valid date');
  }
  const now = new Date();
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const days = Math.ceil((today - since.getTime()) / 86_400_000);
  if (days < 1 || days > 3650) {
    throw new Error('--since must be between yesterday and 3650 days ago');
  }
  return days;
}

export function parseArgs(argv) {
  const options = {
    days: 90,
    limit: 100,
    minGain: 0,
    availability: 'partial',
    concurrency: 3,
    format: 'keywords',
    help: false,
  };
  let timeOption = null;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--help' || arg === '-h') {
      options.help = true;
      continue;
    }
    if (['--days', '--weeks', '--months', '--since'].includes(arg)) {
      if (timeOption) throw new Error(`Use only one time option; already received ${timeOption}`);
      const raw = takeValue(argv, index, arg);
      if (arg === '--days') options.days = positiveInteger(raw, arg, 3650);
      if (arg === '--weeks') options.days = positiveInteger(raw, arg, 521) * 7;
      if (arg === '--months') {
        const months = Number(raw);
        if (!Number.isFinite(months) || months <= 0) throw new Error('--months must be positive');
        options.days = Math.round(months * 30);
        if (options.days < 1 || options.days > 3650) throw new Error('--months exceeds 3650 days');
      }
      if (arg === '--since') options.days = daysSince(raw);
      timeOption = arg;
      index += 1;
      continue;
    }
    if (arg === '--limit') {
      options.limit = positiveInteger(takeValue(argv, index, arg), arg, 1000);
      index += 1;
      continue;
    }
    if (arg === '--min-gain') {
      options.minGain = nonNegativeNumber(takeValue(argv, index, arg), arg);
      index += 1;
      continue;
    }
    if (arg === '--concurrency') {
      options.concurrency = positiveInteger(takeValue(argv, index, arg), arg, 10);
      index += 1;
      continue;
    }
    if (arg === '--availability') {
      const value = takeValue(argv, index, arg);
      if (!['partial', 'any', 'all', 'none'].includes(value)) {
        throw new Error('--availability must be partial, any, all, or none');
      }
      options.availability = value;
      index += 1;
      continue;
    }
    if (arg === '--format') {
      const value = takeValue(argv, index, arg);
      if (!['keywords', 'json'].includes(value)) {
        throw new Error('--format must be keywords or json');
      }
      options.format = value;
      index += 1;
      continue;
    }
    throw new Error(`Unknown option: ${arg}`);
  }

  return options;
}

export function toDomainKeyword(value) {
  return String(value ?? '')
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .replace(/&/g, ' and ')
    .replace(/[’']/g, '')
    .replace(/[^A-Za-z0-9\s-]/g, ' ')
    .replace(/-{2,}/g, '-')
    .replace(/\s+/g, ' ')
    .trim();
}

export function keywordForRow(row) {
  const prefix = toDomainKeyword(row.keyword);
  if (/[A-Za-z]/.test(prefix)) return prefix;
  const subtitle = String(row.name ?? '').split(/[:：]/).slice(1).join(' ');
  return toDomainKeyword(subtitle);
}

export function classifyAvailability(states) {
  if (states.length !== COMMON_TLDS.length || states.some((state) => state === 'unknown')) {
    return 'unknown';
  }
  const available = states.filter((state) => state === 'no').length;
  if (available === 0) return 'none';
  if (available === COMMON_TLDS.length) return 'all';
  return 'partial';
}

function matchesAvailability(classification, requested) {
  if (requested === 'any') return classification === 'partial' || classification === 'all';
  return classification === requested;
}

function parseJsonOutput(stdout, label) {
  const trimmed = stdout.trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    const arrayStart = trimmed.indexOf('[');
    const arrayEnd = trimmed.lastIndexOf(']');
    if (arrayStart !== -1 && arrayEnd > arrayStart) {
      try {
        return JSON.parse(trimmed.slice(arrayStart, arrayEnd + 1));
      } catch {
        // Fall through to the contextual error below.
      }
    }
    throw new Error(`${label} did not return valid JSON`);
  }
}

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      env: { ...process.env, FORCE_COLOR: '0', NO_COLOR: '1' },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) resolve({ stdout, stderr });
      else reject(new Error(`${command} ${args.join(' ')} failed (${code}): ${stderr.trim() || stdout.trim()}`));
    });
  });
}

export function shouldRetrySteamdb(error) {
  return error instanceof Error && /(?:code:\s*TIMEOUT|\bTIMEOUT\b)/i.test(error.message);
}

async function fetchSteamRows(options) {
  const args = [
    'steamdb',
    'new-trending',
    '--days',
    String(options.days),
    '--limit',
    String(options.limit),
    '--min-gain',
    String(options.minGain),
    '-f',
    'json',
  ];

  try {
    return await run('opencli', args);
  } catch (error) {
    if (!shouldRetrySteamdb(error)) throw error;
    process.stderr.write('SteamDB timed out during table expansion; retrying once.\n');
    return run('opencli', args);
  }
}

async function queryDomains(keyword) {
  const { stdout } = await run('opencli', ['queryDomain', 'search', keyword, '-f', 'json']);
  const rows = parseJsonOutput(stdout, `queryDomain search ${keyword}`);
  if (!Array.isArray(rows)) throw new Error(`queryDomain search ${keyword} returned a non-array`);

  const tlds = {};
  for (const tld of COMMON_TLDS) {
    const domain = rows.find((row) => String(row.domain ?? '').toLowerCase().endsWith(`.${tld}`));
    if (!domain) {
      tlds[tld] = 'unknown';
    } else if (domain.existed === 'no' && !domain.registered) {
      tlds[tld] = 'available';
    } else {
      tlds[tld] = 'registered';
    }
  }
  const states = COMMON_TLDS.map((tld) => {
    if (tlds[tld] === 'available') return 'no';
    if (tlds[tld] === 'registered') return 'yes';
    return 'unknown';
  });
  return { tlds, availability: classifyAvailability(states) };
}

async function mapConcurrent(items, concurrency, mapper) {
  const results = new Array(items.length);
  let nextIndex = 0;
  async function worker() {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await mapper(items[index], index);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, worker));
  return results;
}

function usage() {
  return `Usage: steamdb-keywords.mjs [options]

Options:
  --days N | --weeks N | --months N | --since YYYY-MM-DD
                    Release window ending today (default: 90 days)
  --limit N         SteamDB candidates after growth sorting (default: 100)
  --min-gain N      Minimum 7-day follower gain (default: 0)
  --availability X  partial, any, all, or none (default: partial)
  --concurrency N   Concurrent domain lookups, 1-10 (default: 3)
  --format X        keywords or json (default: keywords)
  -h, --help        Show this help`;
}

export async function main(argv = process.argv.slice(2)) {
  const options = parseArgs(argv);
  if (options.help) {
    process.stdout.write(`${usage()}\n`);
    return;
  }

  const { stdout } = await fetchSteamRows(options);
  const steamRows = parseJsonOutput(stdout, 'steamdb new-trending');
  if (!Array.isArray(steamRows)) throw new Error('steamdb new-trending returned a non-array');

  const seen = new Set();
  const candidates = steamRows.flatMap((row) => {
    const keyword = keywordForRow(row);
    const key = keyword.toLowerCase();
    if (!keyword || seen.has(key)) return [];
    seen.add(key);
    return [{ ...row, keyword }];
  });

  const failures = [];
  const queried = await mapConcurrent(candidates, options.concurrency, async (row) => {
    try {
      const domains = await queryDomains(row.keyword);
      return { ...row, ...domains };
    } catch (error) {
      failures.push({ keyword: row.keyword, error: error instanceof Error ? error.message : String(error) });
      return null;
    }
  });
  const matched = queried
    .filter((row) => row && matchesAvailability(row.availability, options.availability))
    .map((row, index) => ({ ...row, rank: index + 1 }));

  if (options.format === 'json') {
    process.stdout.write(`${JSON.stringify({ days: options.days, availability: options.availability, results: matched, failures }, null, 2)}\n`);
  } else {
    process.stdout.write(matched.map((row) => row.keyword).join('\n'));
    if (matched.length) process.stdout.write('\n');
    if (failures.length) {
      process.stderr.write(`Warning: ${failures.length} domain lookup(s) failed. Re-run with --format json for details.\n`);
    }
  }
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}

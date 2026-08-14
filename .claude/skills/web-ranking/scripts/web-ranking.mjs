#!/usr/bin/env node

/**
 * Fetch sim Category Leaders (Search + Organic), WHOIS each domain, print newest 20.
 *
 *   node web-ranking.mjs --industry all
 *   node web-ranking.mjs --industry ai --json
 *   node web-ranking.mjs --industry games --top 20 --limit 100
 */

import { spawn } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import {
  formatDate,
  lookupWhoisMany,
  sortByCreationDesc,
} from './whois.mjs';

const INDUSTRY_ALIASES = {
  all: 'All',
  全部: 'All',
  ai: 'AI_Chatbots_and_Tools',
  'ai chatbots and tools': 'AI_Chatbots_and_Tools',
  ai_chatbots_and_tools: 'AI_Chatbots_and_Tools',
  games: 'Games',
  游戏: 'Games',
};

function takeValue(argv, index, option) {
  const value = argv[index + 1];
  if (value === undefined || value.startsWith('--')) {
    throw new Error(`${option} requires a value`);
  }
  return value;
}

function resolveIndustry(raw) {
  const input = String(raw ?? 'all').trim();
  if (!input) return 'All';
  const mapped = INDUSTRY_ALIASES[input.toLowerCase()];
  if (mapped) return mapped;
  if (Object.values(INDUSTRY_ALIASES).includes(input)) return input;
  throw new Error(
    `unknown industry "${input}". Supported: all, ai (AI_Chatbots_and_Tools), games`,
  );
}

function parseArgs(argv) {
  const options = {
    industry: 'All',
    limit: 100,
    top: 20,
    json: false,
    help: false,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '-h' || arg === '--help') {
      options.help = true;
      continue;
    }
    if (arg === '--json') {
      options.json = true;
      continue;
    }
    if (arg === '--industry') {
      options.industry = resolveIndustry(takeValue(argv, i, arg));
      i += 1;
      continue;
    }
    if (arg === '--limit') {
      options.limit = Number(takeValue(argv, i, arg));
      i += 1;
      continue;
    }
    if (arg === '--top') {
      options.top = Number(takeValue(argv, i, arg));
      i += 1;
      continue;
    }
    throw new Error(`unknown arg: ${arg}`);
  }
  if (!Number.isInteger(options.limit) || options.limit < 1 || options.limit > 100) {
    throw new Error('--limit must be an integer 1-100');
  }
  if (!Number.isInteger(options.top) || options.top < 1) {
    throw new Error('--top must be a positive integer');
  }
  return options;
}

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      env: {
        ...process.env,
        FORCE_COLOR: '0',
        NO_COLOR: '1',
        OPENCLI_BROWSER_COMMAND_TIMEOUT: process.env.OPENCLI_BROWSER_COMMAND_TIMEOUT || '180',
      },
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

function parseJsonOutput(stdout, label) {
  const trimmed = String(stdout || '').trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    const arrayStart = trimmed.indexOf('[');
    const arrayEnd = trimmed.lastIndexOf(']');
    if (arrayStart !== -1 && arrayEnd > arrayStart) {
      try {
        return JSON.parse(trimmed.slice(arrayStart, arrayEnd + 1));
      } catch {
        // fall through
      }
    }
    throw new Error(`${label} did not return valid JSON`);
  }
}

async function fetchRanking(options) {
  const { stdout } = await run('opencli', [
    'sim',
    'web-ranking',
    '--industry',
    options.industry,
    '--limit',
    String(options.limit),
    '-f',
    'json',
  ]);
  const rows = parseJsonOutput(stdout, 'sim web-ranking');
  if (!Array.isArray(rows)) throw new Error('sim web-ranking returned a non-array');
  return rows
    .map((row) => ({
      rank: Number(row?.rank) || null,
      domain: String(row?.domain || '').trim().toLowerCase(),
      trafficShare: row?.trafficShare ?? '',
      change: row?.change ?? '',
      industry: row?.industry ?? '',
      monthlyVisits: row?.monthlyVisits ?? '',
    }))
    .filter((row) => row.domain);
}

function usage() {
  return `Usage: web-ranking.mjs [--industry all|ai|games] [--limit 100] [--top 20] [--json]`;
}

export async function main(argv = process.argv.slice(2)) {
  const options = parseArgs(argv);
  if (options.help) {
    process.stdout.write(`${usage()}\n`);
    return;
  }

  process.stderr.write(`fetching sim web-ranking industry=${options.industry} limit=${options.limit}...\n`);
  const ranking = await fetchRanking(options);
  process.stderr.write(`fetched ${ranking.length} domains; looking up WHOIS...\n`);

  const whoisRows = await lookupWhoisMany(ranking.map((row) => row.domain));
  const byDomain = new Map(whoisRows.map((row) => [row.domain, row]));
  const merged = ranking.map((row) => {
    const parsed = byDomain.get(row.domain) || {
      domain: row.domain,
      creationDatetime: null,
      timestamp: null,
      status: 'unknown',
    };
    return { ...row, ...parsed, domain: row.domain };
  });

  const sorted = sortByCreationDesc(merged);
  const top = sorted.filter((row) => row.timestamp).slice(0, options.top);
  const unknown = sorted.filter((row) => !row.timestamp).length;

  if (options.json) {
    process.stdout.write(`${JSON.stringify({
      industry: options.industry,
      fetched: ranking.length,
      dated: sorted.length - unknown,
      unknown,
      results: top,
    }, null, 2)}\n`);
    return;
  }

  process.stdout.write(`## Newest domains (${options.industry}, top ${top.length} of ${ranking.length})\n\n`);
  process.stdout.write('| # | domain | created | rank | change | monthlyVisits |\n');
  process.stdout.write('|---|--------|---------|------|--------|---------------|\n');
  top.forEach((row, index) => {
    process.stdout.write(
      `| ${index + 1} | ${row.domain} | ${formatDate(row.timestamp)} | ${row.rank ?? ''} | ${row.change} | ${row.monthlyVisits} |\n`,
    );
  });
  process.stdout.write(`\nWHOIS dated ${sorted.length - unknown} / unknown ${unknown}. Sorted newest first.\n`);
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}

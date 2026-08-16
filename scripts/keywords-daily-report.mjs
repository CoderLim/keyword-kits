#!/usr/bin/env node
/**
 * keywords-daily-report — HuggingFace new-click landing pages (top 10)
 * + subdomain-keywords, then Google Trends URLs for the combined set.
 *
 * Usage:
 *   OPENCLI_BROWSER_COMMAND_TIMEOUT=180 node scripts/keywords-daily-report.mjs
 *   OPENCLI_BROWSER_COMMAND_TIMEOUT=180 node scripts/keywords-daily-report.mjs --json
 */

import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HF_DOMAIN = 'huggingface.co';
const HF_LIMIT = 10;
const TRENDS_GROUP = 5;
const TRENDS_BASE = 'https://trends.google.com/trends/explore';
const asJson = process.argv.includes('--json');

const __dirname = dirname(fileURLToPath(import.meta.url));
const subdomainScript = join(__dirname, 'subdomain-keywords.mjs');

function parseClicks(raw) {
  const t = String(raw ?? '').trim().replace(/,/g, '');
  const m = t.match(/^([\d.]+)\s*([KMB])?$/i);
  if (!m) return 0;
  const n = parseFloat(m[1]);
  if (!Number.isFinite(n)) return 0;
  const u = (m[2] || '').toUpperCase();
  const mul = u === 'K' ? 1e3 : u === 'M' ? 1e6 : u === 'B' ? 1e9 : 1;
  return n * mul;
}

function buildTrendsUrl(keywords) {
  const q = keywords.map((k) => encodeURIComponent(k)).join(',');
  return `${TRENDS_BASE}?q=${q}`;
}

function buildTrendsUrls(keywords) {
  const urls = [];
  for (let i = 0; i < keywords.length; i += TRENDS_GROUP) {
    urls.push(buildTrendsUrl(keywords.slice(i, i + TRENDS_GROUP)));
  }
  return urls;
}

function opencliEnv() {
  return {
    ...process.env,
    OPENCLI_BROWSER_COMMAND_TIMEOUT: process.env.OPENCLI_BROWSER_COMMAND_TIMEOUT || '180',
  };
}

function fetchHuggingFace() {
  process.stderr.write(`fetching ${HF_DOMAIN}...\n`);
  const stdout = execFileSync(
    'opencli',
    [
      'sim',
      'landing-pages',
      HF_DOMAIN,
      '--limit',
      String(HF_LIMIT),
      '-f',
      'json',
      '--window',
      'background',
    ],
    {
      encoding: 'utf8',
      maxBuffer: 10 * 1024 * 1024,
      env: opencliEnv(),
    },
  );
  const rows = JSON.parse(stdout);
  if (!Array.isArray(rows)) {
    throw new Error(`${HF_DOMAIN}: unexpected response`);
  }
  return rows.slice(0, HF_LIMIT).map((row) => ({
    keyword: String(row.topKeyword ?? '').trim(),
    clicks: String(row.clicks ?? '').trim(),
    url: String(row.url ?? '').trim(),
  }));
}

function fetchSubdomainKeywords() {
  process.stderr.write('fetching subdomain-keywords...\n');
  const stdout = execFileSync(process.execPath, [subdomainScript, '--json'], {
    encoding: 'utf8',
    maxBuffer: 10 * 1024 * 1024,
    env: opencliEnv(),
  });
  const data = JSON.parse(stdout);
  return {
    keywords: Array.isArray(data.keywords) ? data.keywords : [],
    failures: Array.isArray(data.failures) ? data.failures : [],
  };
}

function mergeForTrends(huggingface, subdomain) {
  const byKeyword = new Map();
  for (const row of [...huggingface, ...subdomain]) {
    const keyword = String(row.keyword ?? '').trim();
    if (!keyword || keyword === '-') continue;
    const clicks = String(row.clicks ?? '').trim();
    const url = String(row.url ?? '').trim();
    const clicksNum = parseClicks(clicks);
    const key = keyword.toLowerCase();
    const prev = byKeyword.get(key);
    if (!prev || clicksNum > prev.clicksNum) {
      byKeyword.set(key, { keyword, clicks, url, clicksNum });
    }
  }
  return [...byKeyword.values()]
    .sort((a, b) => b.clicksNum - a.clicksNum)
    .map(({ keyword, clicks, url }) => ({ keyword, clicks, url }));
}

function printTable(rows) {
  console.log('| keyword | clicks | url |');
  console.log('|---------|--------|-----|');
  if (rows.length === 0) {
    console.log('| (none) | | |');
    return;
  }
  for (const r of rows) {
    console.log(`| ${r.keyword} | ${r.clicks} | ${r.url} |`);
  }
}

function printTrends(combined) {
  const trendsUrls = buildTrendsUrls(combined.map((k) => k.keyword));
  console.log('## Google Trends URLs\n');
  if (trendsUrls.length === 0) {
    console.log('(none)');
    return trendsUrls;
  }
  for (let i = 0; i < trendsUrls.length; i++) {
    const from = i * TRENDS_GROUP + 1;
    const to = Math.min((i + 1) * TRENDS_GROUP, combined.length);
    console.log(`${i + 1}. keywords ${from}-${to}`);
    console.log(`   ${trendsUrls[i]}`);
  }
  return trendsUrls;
}

const failures = [];
let huggingface = [];
let subdomain = [];

try {
  huggingface = fetchHuggingFace();
} catch (e) {
  failures.push(String(e?.stderr || e?.message || e));
}

try {
  const sub = fetchSubdomainKeywords();
  subdomain = sub.keywords;
  failures.push(...sub.failures);
} catch (e) {
  failures.push(`subdomain-keywords: ${e?.stderr || e?.message || e}`);
}

const combined = mergeForTrends(huggingface, subdomain);
const trendsUrls = buildTrendsUrls(combined.map((k) => k.keyword));

if (asJson) {
  console.log(
    JSON.stringify(
      {
        huggingface,
        subdomain,
        combined,
        trendsUrls,
        counts: {
          huggingface: huggingface.length,
          subdomain: subdomain.length,
          combined: combined.length,
        },
        failures,
      },
      null,
      2,
    ),
  );
} else {
  console.log('## HuggingFace (new clicks top 10)\n');
  printTable(huggingface);
  console.log('');

  console.log('## Subdomain Keywords\n');
  printTable(subdomain);
  console.log(
    `\n${subdomain.length} keywords (clicks ≥ 2K, English, deduped)\n`,
  );

  printTrends(combined);

  if (failures.length) {
    console.log('\n## Failures\n');
    for (const f of failures) console.log(`- ${f}`);
  }
}

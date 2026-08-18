#!/usr/bin/env node
/**
 * subdomain-keywords — fetch new-click landing pages from hosting platforms,
 * keep url/keyword/clicks, dedupe keywords, drop <2K clicks, English-only,
 * then build Google Trends URLs (5 keywords per URL).
 *
 * Usage:
 *   OPENCLI_BROWSER_COMMAND_TIMEOUT=180 node scripts/subdomain-keywords.mjs
 *   OPENCLI_BROWSER_COMMAND_TIMEOUT=180 node scripts/subdomain-keywords.mjs --json
 */

import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const DOMAINS = [
  'vercel.app',
  'pages.dev',
  'github.io',
  'netlify.app',
  'web.app',
  'firebaseapp.com',
  'lovable.app',
  'onrender.com',
  'workers.dev',
  'neocities.org',
  'carrd.co',
  'miraheze.org',
  'itch.io',
  'wiki.gg',
  'fandom.com',
];

const LIMIT = 10;
const MIN_CLICKS = 2000;
const TRENDS_GROUP = 5;
const TRENDS_BASE = 'https://trends.google.com/trends/explore';
const asJson = process.argv.includes('--json');
const cacheDir = join(tmpdir(), 'sim-subdomain-keywords');
mkdirSync(cacheDir, { recursive: true });

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

/** English-only: after stripping spaces/common punct, only [A-Za-z0-9]. */
function isEnglishKeyword(keyword) {
  const k = String(keyword ?? '').trim();
  if (!k || k === '-') return false;
  const core = k.replace(/[\s\-_'&.!?,:;/+()[\]"]+/g, '');
  if (!core) return false;
  if (/[^\x00-\x7F]/.test(k)) return false;
  return /^[A-Za-z0-9]+$/.test(core) && /[A-Za-z]/.test(core);
}

function buildTrendsUrl(keywords) {
  const q = keywords.map((k) => encodeURIComponent(k)).join(',');
  return `${TRENDS_BASE}?q=${q}`;
}

/** Split keywords into groups of 5; last group may be shorter. */
function buildTrendsUrls(keywords) {
  const urls = [];
  for (let i = 0; i < keywords.length; i += TRENDS_GROUP) {
    const group = keywords.slice(i, i + TRENDS_GROUP);
    urls.push(buildTrendsUrl(group));
  }
  return urls;
}

function fetchDomain(domain) {
  const outFile = join(cacheDir, `${domain}.json`);
  const errFile = join(cacheDir, `${domain}.err`);
  try {
    const stdout = execFileSync(
      'opencli',
      ['sim', 'landing-pages', domain, '--limit', String(LIMIT), '-f', 'json', '--window', 'background'],
      {
        encoding: 'utf8',
        maxBuffer: 10 * 1024 * 1024,
        env: {
          ...process.env,
          OPENCLI_BROWSER_COMMAND_TIMEOUT: process.env.OPENCLI_BROWSER_COMMAND_TIMEOUT || '180',
        },
      },
    );
    writeFileSync(outFile, stdout);
    writeFileSync(errFile, '');
    return JSON.parse(stdout);
  } catch (err) {
    const msg = err?.stderr || err?.message || String(err);
    writeFileSync(errFile, String(msg));
    if (existsSync(outFile)) {
      try {
        return JSON.parse(readFileSync(outFile, 'utf8'));
      } catch {
        /* ignore */
      }
    }
    throw new Error(`${domain}: ${msg}`);
  }
}

const failures = [];
const byKeyword = new Map();

for (const domain of DOMAINS) {
  process.stderr.write(`fetching ${domain}...\n`);
  let rows;
  try {
    rows = fetchDomain(domain);
  } catch (e) {
    failures.push(String(e.message || e));
    continue;
  }
  if (!Array.isArray(rows)) {
    failures.push(`${domain}: unexpected response`);
    continue;
  }

  for (const row of rows.slice(0, LIMIT)) {
    const keyword = String(row.topKeyword ?? '').trim();
    const clicks = String(row.clicks ?? '').trim();
    const url = String(row.url ?? '').trim();
    if (!isEnglishKeyword(keyword)) continue;
    const clicksNum = parseClicks(clicks);
    if (clicksNum < MIN_CLICKS) continue;

    const key = keyword.toLowerCase();
    const prev = byKeyword.get(key);
    if (!prev || clicksNum > prev.clicksNum) {
      byKeyword.set(key, { keyword, clicks, url, clicksNum, domain });
    }
  }
}

const keywords = [...byKeyword.values()]
  .sort((a, b) => b.clicksNum - a.clicksNum)
  .map(({ keyword, clicks, url }) => ({ keyword, clicks, url }));

const trendsUrls = buildTrendsUrls(keywords.map((k) => k.keyword));

if (asJson) {
  console.log(
    JSON.stringify(
      {
        keywords,
        trendsUrls,
        count: keywords.length,
        failures,
      },
      null,
      2,
    ),
  );
} else {
  console.log('## Keywords\n');
  console.log('| keyword | clicks | url |');
  console.log('|---------|--------|-----|');
  for (const r of keywords) {
    console.log(`| ${r.keyword} | ${r.clicks} | ${r.url} |`);
  }
  console.log(`\n${keywords.length} keywords (clicks ≥ 2K, English, deduped)\n`);

  console.log('## Google Trends URLs\n');
  if (trendsUrls.length === 0) {
    console.log('(none)');
  } else {
    for (let i = 0; i < trendsUrls.length; i++) {
      const from = i * TRENDS_GROUP + 1;
      const to = Math.min((i + 1) * TRENDS_GROUP, keywords.length);
      console.log(`${i + 1}. keywords ${from}-${to}`);
      console.log(`   ${trendsUrls[i]}`);
    }
  }

  if (failures.length) {
    console.log('\n## Failures\n');
    for (const f of failures) console.log(`- ${f}`);
  }
}

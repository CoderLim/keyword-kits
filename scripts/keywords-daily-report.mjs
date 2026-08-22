#!/usr/bin/env node
/**
 * keywords-daily-report — HuggingFace new-click landing pages (top 10)
 * + subdomain-keywords, then Google Trends URLs for the combined set.
 *
 * Usage:
 *   OPENCLI_BROWSER_COMMAND_TIMEOUT=180 node scripts/keywords-daily-report.mjs
 *   OPENCLI_BROWSER_COMMAND_TIMEOUT=180 node scripts/keywords-daily-report.mjs --json
 *   OPENCLI_BROWSER_COMMAND_TIMEOUT=180 node scripts/keywords-daily-report.mjs --mode full
 *   OPENCLI_BROWSER_COMMAND_TIMEOUT=180 node scripts/keywords-daily-report.mjs --mode incremental --json
 *
 * Modes:
 *   incremental (default) — only keywords that are new vs yesterday, or whose clicks rose
 *   full — return all fetched items (online / legacy behavior)
 *
 * After each successful fetch, saves a local snapshot under
 * `.claude/skills/keywords-daily-report/data/` (keeps only yesterday + today).
 */

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HF_DOMAIN = 'huggingface.co';
const HF_LIMIT = 10;
const TRENDS_GROUP = 5;
const TRENDS_BASE = 'https://trends.google.com/trends/explore';
const VALID_MODES = new Set(['incremental', 'full']);

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, '..');
const subdomainScript = join(__dirname, 'subdomain-keywords.mjs');
const dataDir = join(
  repoRoot,
  '.claude',
  'skills',
  'keywords-daily-report',
  'data',
);
const snapshotPath = join(dataDir, 'snapshots.json');

function parseArgs(argv) {
  let mode = 'incremental';
  let asJson = false;
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--json') {
      asJson = true;
      continue;
    }
    if (arg === '--mode') {
      const value = argv[i + 1];
      if (!value || value.startsWith('--')) {
        throw new Error('--mode requires incremental or full');
      }
      if (!VALID_MODES.has(value)) {
        throw new Error(`--mode must be incremental or full (got ${value})`);
      }
      mode = value;
      i += 1;
      continue;
    }
    if (arg === '--help' || arg === '-h') {
      return { help: true };
    }
    throw new Error(`Unknown option: ${arg}`);
  }
  return { mode, asJson, help: false };
}

function usage() {
  return `Usage: keywords-daily-report.mjs [options]

Options:
  --mode incremental|full   Output mode (default: incremental)
  --json                    Print JSON instead of markdown
  -h, --help                Show this help`;
}

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

function todayKey(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function yesterdayKey(date = new Date()) {
  const d = new Date(date);
  d.setDate(d.getDate() - 1);
  return todayKey(d);
}

function loadSnapshots() {
  if (!existsSync(snapshotPath)) return {};
  try {
    const raw = JSON.parse(readFileSync(snapshotPath, 'utf8'));
    return raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  } catch {
    return {};
  }
}

function pruneAndSaveSnapshot(snapshots, today, payload) {
  const yday = yesterdayKey();
  const next = {};
  if (snapshots[yday]) next[yday] = snapshots[yday];
  next[today] = {
    fetchedAt: new Date().toISOString(),
    ...payload,
  };
  mkdirSync(dataDir, { recursive: true });
  writeFileSync(snapshotPath, `${JSON.stringify(next, null, 2)}\n`);
  return next;
}

function indexByKeyword(rows) {
  const map = new Map();
  for (const row of rows || []) {
    const keyword = String(row.keyword ?? '').trim();
    if (!keyword || keyword === '-') continue;
    const clicks = String(row.clicks ?? '').trim();
    if (!clicks) continue;
    const key = keyword.toLowerCase();
    const clicksNum = parseClicks(clicks);
    const prev = map.get(key);
    if (!prev || clicksNum > prev.clicksNum) {
      map.set(key, {
        keyword,
        clicks,
        url: String(row.url ?? '').trim(),
        clicksNum,
      });
    }
  }
  return map;
}

/**
 * Keep rows that are new vs yesterday, or whose clicks rose.
 * Rows without a usable keyword+clicks pair are dropped in incremental mode.
 */
function filterIncremental(todayRows, yesterdayRows) {
  const yesterday = indexByKeyword(yesterdayRows);
  const out = [];
  for (const row of todayRows || []) {
    const keyword = String(row.keyword ?? '').trim();
    if (!keyword || keyword === '-') continue;
    const clicks = String(row.clicks ?? '').trim();
    if (!clicks) continue;
    const clicksNum = parseClicks(clicks);
    const key = keyword.toLowerCase();
    const prev = yesterday.get(key);
    if (!prev) {
      out.push({
        ...row,
        keyword,
        clicks,
        change: 'new',
        previousClicks: null,
      });
      continue;
    }
    if (clicksNum > prev.clicksNum) {
      out.push({
        ...row,
        keyword,
        clicks,
        change: 'up',
        previousClicks: prev.clicks,
      });
    }
  }
  return out;
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
      byKeyword.set(key, {
        keyword,
        clicks,
        url,
        clicksNum,
        change: row.change,
        previousClicks: row.previousClicks ?? null,
      });
    }
  }
  return [...byKeyword.values()]
    .sort((a, b) => b.clicksNum - a.clicksNum)
    .map(({ keyword, clicks, url, change, previousClicks }) => ({
      keyword,
      clicks,
      url,
      ...(change ? { change, previousClicks } : {}),
    }));
}

function printTable(rows, { incremental } = {}) {
  if (incremental) {
    console.log('| keyword | clicks | prev | change | url |');
    console.log('|---------|--------|------|--------|-----|');
  } else {
    console.log('| keyword | clicks | url |');
    console.log('|---------|--------|-----|');
  }
  if (rows.length === 0) {
    console.log(incremental ? '| (none) | | | | |' : '| (none) | | |');
    return;
  }
  for (const r of rows) {
    if (incremental) {
      const prev = r.previousClicks ?? '—';
      const change = r.change ?? '—';
      console.log(
        `| ${r.keyword} | ${r.clicks} | ${prev} | ${change} | ${r.url} |`,
      );
    } else {
      console.log(`| ${r.keyword} | ${r.clicks} | ${r.url} |`);
    }
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

let args;
try {
  args = parseArgs(process.argv.slice(2));
} catch (e) {
  process.stderr.write(`${e instanceof Error ? e.message : String(e)}\n`);
  process.exit(1);
}
if (args.help) {
  console.log(usage());
  process.exit(0);
}

const { mode, asJson } = args;
const failures = [];
let huggingfaceRaw = [];
let subdomainRaw = [];

try {
  huggingfaceRaw = fetchHuggingFace();
} catch (e) {
  failures.push(String(e?.stderr || e?.message || e));
}

try {
  const sub = fetchSubdomainKeywords();
  subdomainRaw = sub.keywords;
  failures.push(...sub.failures);
} catch (e) {
  failures.push(`subdomain-keywords: ${e?.stderr || e?.message || e}`);
}

const today = todayKey();
const yday = yesterdayKey();
const snapshots = loadSnapshots();
const yesterdaySnap = snapshots[yday] || null;

pruneAndSaveSnapshot(snapshots, today, {
  huggingface: huggingfaceRaw,
  subdomain: subdomainRaw,
});
process.stderr.write(
  `saved snapshot ${today} (kept ${yday} + ${today}) → ${snapshotPath}\n`,
);

let huggingface = huggingfaceRaw;
let subdomain = subdomainRaw;
let baselineNote = null;

if (mode === 'incremental') {
  if (!yesterdaySnap) {
    baselineNote =
      'no yesterday snapshot; treating all current keyword+clicks items as new';
    process.stderr.write(`${baselineNote}\n`);
    huggingface = filterIncremental(huggingfaceRaw, []);
    subdomain = filterIncremental(subdomainRaw, []);
  } else {
    huggingface = filterIncremental(
      huggingfaceRaw,
      yesterdaySnap.huggingface || [],
    );
    subdomain = filterIncremental(
      subdomainRaw,
      yesterdaySnap.subdomain || [],
    );
  }
}

const combined = mergeForTrends(huggingface, subdomain);
const trendsUrls = buildTrendsUrls(combined.map((k) => k.keyword));

if (asJson) {
  console.log(
    JSON.stringify(
      {
        mode,
        date: today,
        comparedTo: yesterdaySnap ? yday : null,
        baselineNote,
        huggingface,
        subdomain,
        combined,
        trendsUrls,
        counts: {
          huggingface: huggingface.length,
          subdomain: subdomain.length,
          combined: combined.length,
          huggingfaceRaw: huggingfaceRaw.length,
          subdomainRaw: subdomainRaw.length,
        },
        failures,
      },
      null,
      2,
    ),
  );
} else {
  const modeLabel =
    mode === 'incremental'
      ? `incremental vs ${yesterdaySnap ? yday : 'none (all as new)'}`
      : 'full';
  console.log(`# Keywords daily report (${modeLabel})\n`);

  console.log(
    mode === 'incremental'
      ? '## HuggingFace (new or up vs yesterday)\n'
      : '## HuggingFace (new clicks top 10)\n',
  );
  printTable(huggingface, { incremental: mode === 'incremental' });
  console.log('');

  console.log(
    mode === 'incremental'
      ? '## Subdomain Keywords (new or up vs yesterday)\n'
      : '## Subdomain Keywords\n',
  );
  printTable(subdomain, { incremental: mode === 'incremental' });
  if (mode === 'incremental') {
    console.log(
      `\n${subdomain.length} keywords (new or clicks up; of ${subdomainRaw.length} fetched)\n`,
    );
  } else {
    console.log(
      `\n${subdomain.length} keywords (clicks ≥ 2K, English, deduped)\n`,
    );
  }

  printTrends(combined);

  if (baselineNote) {
    console.log(`\n## Note\n\n- ${baselineNote}`);
  }

  if (failures.length) {
    console.log('\n## Failures\n');
    for (const f of failures) console.log(`- ${f}`);
  }
}

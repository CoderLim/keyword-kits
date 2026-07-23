#!/usr/bin/env node
/**
 * Generate a Google Trends explore URL from keywords.
 *
 * Usage:
 *   node scripts/google-trends-url.mjs Calculator Converter Translator Generator Example
 *   node scripts/google-trends-url.mjs --json '["Calculator","Converter","Translator","Generator","Example"]'
 *   echo '["a","b","c","d","e"]' | node scripts/google-trends-url.mjs --stdin
 *
 * Rules:
 *   - Expects 5 keywords; more than 5 → truncate to 5 and warn on stderr
 *   - Fewer than 5 → still build URL and warn on stderr
 *   - Prints the URL to stdout
 */

import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const MAX = 5;
const BASE = 'https://trends.google.com/trends/explore';


function warn(msg) {
  process.stderr.write(`warning: ${msg}\n`);
}

function parseJsonArray(raw, label) {
  let data;
  try {
    data = JSON.parse(String(raw).trim());
  } catch (e) {
    throw new Error(`${label}: invalid JSON (${e.message})`);
  }
  if (!Array.isArray(data)) {
    throw new Error(`${label}: expected a JSON array of strings`);
  }
  return data.map((x) => String(x).trim()).filter(Boolean);
}

function parseArgs(argv) {
  if (argv.includes('--help') || argv.includes('-h')) {
    process.stdout.write(`Usage:
  node scripts/google-trends-url.mjs <kw1> <kw2> ... <kw5>
  node scripts/google-trends-url.mjs --json '["a","b","c","d","e"]'
  echo '["a","b","c","d","e"]' | node scripts/google-trends-url.mjs --stdin
`);
    process.exit(0);
  }

  if (argv.includes('--stdin')) {
    return parseJsonArray(readFileSync(0, 'utf8'), 'stdin');
  }

  const jsonIdx = argv.indexOf('--json');
  if (jsonIdx !== -1) {
    const raw = argv[jsonIdx + 1];
    if (!raw) throw new Error('--json requires a JSON array string');
    return parseJsonArray(raw, '--json');
  }

  const keywords = argv.filter((a) => !a.startsWith('-'));
  if (keywords.length === 0) {
    throw new Error('provide keywords as args, --json, or --stdin');
  }
  return keywords;
}

/**
 * @param {string[]} keywords
 * @returns {{ url: string, keywords: string[] }}
 */
export function buildGoogleTrendsUrl(keywords) {
  const cleaned = (keywords ?? []).map((k) => String(k).trim()).filter(Boolean);

  if (cleaned.length > MAX) {
    warn(`got ${cleaned.length} keywords, truncating to ${MAX}`);
  } else if (cleaned.length < MAX) {
    warn(`got ${cleaned.length} keywords, expected ${MAX}`);
  }

  const selected = cleaned.slice(0, MAX);
  if (selected.length === 0) {
    throw new Error('no keywords provided');
  }

  // encode each term; keep commas as separators (matches Trends UI URL shape)
  const q = selected.map((k) => encodeURIComponent(k)).join(',');
  return { url: `${BASE}?q=${q}`, keywords: selected };
}

function main() {
  const keywords = parseArgs(process.argv.slice(2));
  const { url } = buildGoogleTrendsUrl(keywords);
  process.stdout.write(`${url}\n`);
}

const isDirectRun = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isDirectRun) {
  try {
    main();
  } catch (e) {
    process.stderr.write(`error: ${e.message || e}\n`);
    process.exit(1);
  }
}

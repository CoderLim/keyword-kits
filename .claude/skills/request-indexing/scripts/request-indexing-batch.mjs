#!/usr/bin/env node

import fs from 'node:fs';
import { spawnSync } from 'node:child_process';

function usage() {
  console.error(`Usage:
  node .claude/skills/request-indexing/scripts/request-indexing-batch.mjs --property sc-domain:example.com <url...>
  node .claude/skills/request-indexing/scripts/request-indexing-batch.mjs --property sc-domain:example.com --file urls.txt
`);
}

const args = process.argv.slice(2);
let property = '';
let file = '';
const urls = [];

for (let i = 0; i < args.length; i += 1) {
  const arg = args[i];
  if (arg === '--help' || arg === '-h') {
    usage();
    process.exit(0);
  }
  if (arg === '--property') {
    property = args[i + 1] || '';
    i += 1;
    continue;
  }
  if (arg === '--file') {
    file = args[i + 1] || '';
    i += 1;
    continue;
  }
  urls.push(arg);
}

if (file) {
  const lines = fs
    .readFileSync(file, 'utf8')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  urls.push(...lines);
}

if (!property || urls.length === 0) {
  usage();
  process.exit(2);
}

const timeout = process.env.OPENCLI_BROWSER_COMMAND_TIMEOUT || '180';
const results = [];

for (const url of urls) {
  const child = spawnSync(
    'opencli',
    ['gsc', 'request-indexing', url, '--property', property, '-f', 'json'],
    {
      env: { ...process.env, OPENCLI_BROWSER_COMMAND_TIMEOUT: timeout },
      encoding: 'utf8',
    },
  );

  const stdout = (child.stdout || '').trim();
  const stderr = (child.stderr || '').trim();

  let parsed = null;
  try {
    parsed = JSON.parse(stdout);
  } catch {
    parsed = null;
  }

  if (Array.isArray(parsed) && parsed[0] && typeof parsed[0] === 'object') {
    results.push({
      url,
      ok: child.status === 0,
      ...parsed[0],
    });
    continue;
  }

  results.push({
    url,
    ok: child.status === 0,
    status: child.status === 0 ? 'unknown' : 'command_failed',
    message: stdout || stderr || `exit ${child.status ?? 'unknown'}`,
  });
}

console.log(
  JSON.stringify(
    {
      property,
      count: results.length,
      results,
    },
    null,
    2,
  ),
);

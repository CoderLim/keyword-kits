#!/usr/bin/env node

const fs = require('node:fs');

const [beforePath, candidatesPath] = process.argv.slice(2);
if (!beforePath || !candidatesPath) {
  console.error(
    'Usage: filter-new-search-yahoo.js <before-candidates.json> <current-candidates.json>'
  );
  process.exit(2);
}

const readCandidates = (filePath) => {
  const rows = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  if (!Array.isArray(rows)) {
    throw new Error(`${filePath} must contain an array`);
  }
  return rows;
};

const hostnameContainsSearchYahoo = (rawUrl) => {
  if (typeof rawUrl !== 'string') return false;
  try {
    return new URL(rawUrl).hostname.toLowerCase().includes('search.yahoo');
  } catch {
    return false;
  }
};

const before = readCandidates(beforePath);
const candidates = readCandidates(candidatesPath);
const beforeIds = new Set(before.map((row) => row?.id));
const kept = candidates.filter(
  (row) =>
    beforeIds.has(row?.id) || !hostnameContainsSearchYahoo(row?.link)
);
const removed = candidates.length - kept.length;

if (removed > 0) {
  const temporaryPath = `${candidatesPath}.${process.pid}.tmp`;
  try {
    fs.writeFileSync(
      temporaryPath,
      `${JSON.stringify(kept, null, 2)}\n`,
      'utf8'
    );
    fs.renameSync(temporaryPath, candidatesPath);
  } finally {
    if (fs.existsSync(temporaryPath)) fs.unlinkSync(temporaryPath);
  }
}

console.log(`Filtered new search.yahoo candidates: ${removed}`);

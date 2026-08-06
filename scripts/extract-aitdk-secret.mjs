#!/usr/bin/env node
/**
 * Re-extract the AITDK wapi signing secret from the live extension bundle.
 *
 * Run this when `opencli aitdk get-data` returns HTTP 403 (AITDK rotated the
 * bundled secret). It fetches https://extension.aitdk.com/, decodes the
 * obfuscated string table, prints the current `secretKey` + `baseUrl`, and
 * verifies by firing one signed bulk request (expect HTTP 200).
 *
 * Approach (robust to a changed literal fragmentation - only the anchors matter):
 *   - The config builds baseUrl from obfuscated decoder calls + string literals
 *     such that it must equal "https://wapi.aitdk.com". We tokenize that
 *     expression, then brute-force the table rotation K by reconstructing the
 *     full string until it matches the known URL.
 *   - The secretKey config property name decodes to the literal "secretKey"
 *     (a second anchor used to confirm K and locate the secret value).
 *
 * Usage:
 *   node scripts/extract-aitdk-secret.mjs             # extract + live-verify
 *   node scripts/extract-aitdk-secret.mjs --no-verify # extract only
 *
 * On success it prints the line to paste into packages/aitdk/src/lib.ts:
 *   export const SECRET = '...';
 */
import { createHash, randomBytes } from 'node:crypto';

const SHELL = 'https://extension.aitdk.com/';
const KNOWN_BASE_URL = 'https://wapi.aitdk.com';
const ALPHABET =
  'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

const log = (...a) => console.error(...a);

async function fetchText(url) {
  const r = await fetch(url, {
    headers: {
      'user-agent':
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    },
  });
  if (!r.ok) throw new Error(`fetch ${url} -> HTTP ${r.status}`);
  return r.text();
}

async function getBundleSrc() {
  const html = await fetchText(SHELL);
  const m = html.match(/src="(\.\/assets\/index-[^"]+\.js)"/);
  if (!m)
    throw new Error('could not find index bundle in extension.aitdk.com HTML');
  const url = SHELL + m[1].slice(2);
  return { url, src: await fetchText(url) };
}

/**
 * Parse an obfuscator.io string-table array literal `[ "a", 'b', "c\"d", ... ]`
 * into a real array. The literal is JS source and may mix single/double
 * quoting and use escapes (\xNN, \uNNNN, \u{...}, \n, \\, \', \", \/) that
 * JSON.parse rejects, so tokenize it char-by-char instead of evaluating.
 */
function parseJsStringArray(literal) {
  const arr = [];
  const n = literal.length;
  let i = 1; // skip leading '['
  while (i < n - 1) {
    // skip whitespace and commas
    while (i < n - 1 && /[\s,]/.test(literal[i])) i++;
    if (i >= n - 1) break;
    const quote = literal[i];
    if (quote !== '"' && quote !== "'")
      throw new Error(`expected quote at ${i}, got ${JSON.stringify(literal[i])}`);
    i++;
    let s = '';
    while (i < n - 1 && literal[i] !== quote) {
      if (literal[i] !== '\\') {
        s += literal[i];
        i++;
        continue;
      }
      const next = literal[i + 1];
      if (next === 'x') {
        s += String.fromCharCode(parseInt(literal.slice(i + 2, i + 4), 16));
        i += 4;
      } else if (next === 'u') {
        if (literal[i + 2] === '{') {
          const end = literal.indexOf('}', i + 3);
          s += String.fromCodePoint(parseInt(literal.slice(i + 3, end), 16));
          i = end + 1;
        } else {
          s += String.fromCharCode(parseInt(literal.slice(i + 2, i + 6), 16));
          i += 6;
        }
      } else if (next === 'n') { s += '\n'; i += 2; }
      else if (next === 't') { s += '\t'; i += 2; }
      else if (next === 'r') { s += '\r'; i += 2; }
      else if (next === 'b') { s += '\b'; i += 2; }
      else if (next === 'f') { s += '\f'; i += 2; }
      else if (next === '0') { s += '\0'; i += 2; }
      else if (next === '\\') { s += '\\'; i += 2; }
      else if (next === '/') { s += '/'; i += 2; }
      else if (next === "'") { s += "'"; i += 2; }
      else if (next === '"') { s += '"'; i += 2; }
      else { s += next; i += 2; } // unknown escape -> literal char
    }
    i++; // skip closing quote
    arr.push(s);
  }
  return arr;
}

/** Extract every obfuscated string table: function NAME(){const e=[...];return(NAME=function(){return e})()} */
function extractTables(src) {
  const tables = {};
  const re =
    /function\s+(\w+)\(\)\s*\{\s*const\s+e=(\[[\s\S]*?\]);\s*return\(\1=function\(\)\{return e\}\)\(\)\s*\}/g;
  for (const m of src.matchAll(re)) {
    try {
      tables[m[1]] = parseJsStringArray(m[2]);
    } catch {
      /* skip malformed */
    }
  }
  return tables;
}

/** Extract decoders (NAME -> {table, offset}) including `const A=B,C=D` aliases. */
function extractDecoders(src) {
  const decoders = {};
  const re =
    /function\s+(\w+)\(e,t\)\s*\{\s*const\s+n=(\w+)\(\);\s*return\(\1=function\(e,t\)\{return n\[e-=(\d+)\]\}/g;
  for (const m of src.matchAll(re)) {
    decoders[m[1]] = { table: m[2], offset: parseInt(m[3], 10) };
  }
  // Resolve aliases across `const A=x,B=y;` declarations (possibly several
  // declarators per statement). Split each declarator and alias name->target
  // only when target is a known decoder and the declarator is a plain `name=id`.
  const declRe = /const\s+([^;{}]+);/g;
  for (const dm of src.matchAll(declRe)) {
    for (const part of dm[1].split(',')) {
      const pm = part.match(/^\s*(\w+)\s*=\s*(\w+)\s*$/);
      if (!pm) continue;
      if (decoders[pm[2]] && !decoders[pm[1]]) decoders[pm[1]] = decoders[pm[2]];
    }
  }
  return decoders;
}

/** Tokenize a value expression into DEC(num) / "literal" parts. */
function tokenizeExpr(expr) {
  const tokens = [];
  const re = /(?:^|\+)\s*(?:(\w+)\((\d+)\)|"([^"]*)")/g;
  for (const m of expr.matchAll(re)) {
    if (m[1] !== undefined)
      tokens.push({ type: 'dec', name: m[1], idx: parseInt(m[2], 10) });
    else tokens.push({ type: 'lit', value: m[3] });
  }
  return tokens;
}

/** Resolve the single {table, offset} shared by all DEC tokens in an expr. */
function resolveCommonTable(tokens, decoders) {
  let ref = null;
  for (const t of tokens) {
    if (t.type !== 'dec') continue;
    const d = decoders[t.name];
    if (!d) throw new Error(`unknown decoder: ${t.name}`);
    if (!ref) ref = d;
    else if (d.table !== ref.table || d.offset !== ref.offset)
      throw new Error(
        `mixed tables/offsets in one expr (${ref.table}/${ref.offset} vs ${d.table}/${d.offset})`,
      );
  }
  if (!ref) throw new Error('no decoder calls in expression');
  return ref;
}

function reconstruct(tokens, table, offset, K) {
  const len = table.length;
  let s = '';
  for (const t of tokens) {
    if (t.type === 'lit') s += t.value;
    else s += table[(((t.idx - offset + K) % len) + len) % len];
  }
  return s;
}

/** Brute-force rotation K so reconstruction of `tokens` equals `expected`. */
function bruteForceK(table, offset, tokens, expected) {
  const len = table.length;
  for (let K = 0; K < len; K++) {
    if (reconstruct(tokens, table, offset, K) === expected) return K;
  }
  return null;
}

function sha256hex(s) {
  return createHash('sha256').update(s, 'utf8').digest('hex');
}
function randomNonce(len = 16) {
  const b = randomBytes(len);
  let r = '';
  for (let i = 0; i < len; i++) r += ALPHABET[b[i] % ALPHABET.length];
  return r;
}

async function main() {
  const verify = !process.argv.includes('--no-verify');

  log('-> fetching extension.aitdk.com bundle…');
  const { url: bundleUrl, src } = await getBundleSrc();
  log(`  bundle: ${bundleUrl} (${src.length} bytes)`);

  const tables = extractTables(src);
  const decoders = extractDecoders(src);
  log(
    `  tables: ${Object.keys(tables).length}, decoders: ${Object.keys(decoders).length}`,
  );

  // --- baseUrl: anchor on reconstructing the known URL ---
  const baseM = src.match(/\.baseUrl=([^,;]+)/);
  if (!baseM) throw new Error('".baseUrl=" not found in bundle');
  const baseTokens = tokenizeExpr(baseM[1]);
  const baseRef = resolveCommonTable(baseTokens, decoders);
  const baseTable = tables[baseRef.table];
  if (!baseTable) throw new Error(`table ${baseRef.table} not found`);

  const K = bruteForceK(baseTable, baseRef.offset, baseTokens, KNOWN_BASE_URL);
  if (K == null)
    throw new Error(
      `could not brute-force table rotation (baseUrl never reconstructed to ${KNOWN_BASE_URL})`,
    );
  log(`  table=${baseRef.table} offset=${baseRef.offset} rotation=K${K}`);
  log(`  baseUrl: ${KNOWN_BASE_URL}`);

  // --- secretKey: [propExpr]=valExpr immediately before .baseUrl= ---
  const secM = src.match(/\[([^\]]+)\]=([^,;]+),\w+\.baseUrl=/);
  if (!secM)
    throw new Error('secretKey assignment (el[...]=...,X.baseUrl=) not found');
  const propTokens = tokenizeExpr(secM[1]);
  const valTokens = tokenizeExpr(secM[2]);
  const secRef = resolveCommonTable([...propTokens, ...valTokens], decoders);
  const secTable = tables[secRef.table];
  if (!secTable) throw new Error(`table ${secRef.table} not found`);

  // If secretKey uses the same table as baseUrl, reuse K. Otherwise brute-force
  // via the "secretKey" property-name anchor.
  let Ks = K;
  if (secRef.table !== baseRef.table || secRef.offset !== baseRef.offset) {
    log(`  secretKey uses a different table (${secRef.table}); brute-forcing via property anchor…`);
    Ks = bruteForceK(secTable, secRef.offset, propTokens, 'secretKey');
    if (Ks == null)
      throw new Error('could not brute-force secretKey table rotation via "secretKey" anchor');
  }

  const propName = reconstruct(propTokens, secTable, secRef.offset, Ks);
  if (propName !== 'secretKey')
    throw new Error(`property decoded to "${propName}", expected "secretKey"`);
  log(`  property: ${propName}`);

  const secret = reconstruct(valTokens, secTable, secRef.offset, Ks);

  console.log(`export const SECRET = '${secret}';`);
  console.log(`// baseUrl: ${KNOWN_BASE_URL}`);
  console.log(`// property: ${propName}`);

  if (!verify) {
    log('-> --no-verify: skipping live request');
    return;
  }

  // Live-verify: one signed bulk request must return HTTP 200.
  log('-> live-verifying with a signed bulk request…');
  const domain = 'example.com';
  const params = { domain, stream: 'true', view: 'full' };
  const ts = String(Math.floor(Date.now() / 1000));
  const nonce = randomNonce();
  const sorted = new URLSearchParams();
  for (const k of Array.from(new Set(Object.keys(params))).sort()) {
    for (const v of [params[k]].sort()) sorted.append(k, v);
  }
  const canonical =
    ['GET', '/api/v1/bulk', sorted.toString(), ts, nonce].join('\n') +
    '\n' +
    secret;
  const sig = sha256hex(canonical);
  const q = new URLSearchParams({
    ...params,
    nonce,
    signature: sig,
    timestamp: ts,
  });
  const r = await fetch(`${KNOWN_BASE_URL}/api/v1/bulk?${q.toString()}`, {
    headers: {
      accept: '*/*',
      'user-agent':
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
      origin: SHELL,
      referer: SHELL,
    },
  });
  if (r.status === 200) {
    log(`✅ verified: HTTP 200 (secret works). Paste the line above into packages/aitdk/src/lib.ts, then:`);
    log('   npm run build -w opencli-plugin-aitdk && opencli plugin update aitdk');
  } else if (r.status === 401 || r.status === 403) {
    throw new Error(
      `HTTP ${r.status}: secret extracted but rejected - signing scheme may have changed beyond a secret rotation`,
    );
  } else {
    log(`⚠ HTTP ${r.status} (not 200/403) - secret likely fine, non-auth issue.`);
  }
}

main().catch((e) => {
  console.error('✗', e.message);
  process.exit(1);
});

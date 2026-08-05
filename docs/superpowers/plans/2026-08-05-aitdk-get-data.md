# aitdk get-data Implementation Plan

**Goal:** Deliver `opencli aitdk get-data <domain>` that returns AITDK's full domain snapshot (whois + traffic/SEO metrics) from `wapi.aitdk.com/api/v1/bulk`, no browser required.

**Strategy: PUBLIC.** The AITDK Chrome extension's web shell (`https://extension.aitdk.com/`) signs requests with a **static secret embedded in its JS bundle** (`541737bb-02ce-4fb6-8157-3c7166873777`). The bulk endpoint requires no cookies / no auth header — only a `signature` query param. I reverse-engineered and **verified** the signing against the user's own example: `domain=websitecloner.io`, `nonce=4xUYpeqPcxQD0RBU`, `timestamp=1785918242` → `signature=c4aea28f9a79a278254ac866f45222edafcd43a251255257905aa9143bdc86cb` (exact match). So this is a reproducible PUBLIC API, like `queryDomain search`.

**Tech Stack:** TypeScript, esbuild, `@jackwener/opencli` registry, Node `node:test`, `node:crypto`.

---

## Reverse-engineering evidence (2026-08-05 live recon)

Bundle `https://extension.aitdk.com/assets/index-67fa03b4.js`, decoded obfuscated string tables (`Nc`/`_c`, `Mc`/`zc`, `il`/`Zc`):

- **HTTP client config** `Qc`: `baseUrl = "https://wapi.aitdk.com"`, `secretKey = "541737bb-02ce-4fb6-8157-3c7166873777"`, `mode = "param"` (signature goes into query params for GET).
- **`Sc(method, path, params, ts, nonce, secret, body)`**:
  - canonical = `Ic(...)` + `"\n"` + secret
  - `Ic` = `[METHOD.toUpperCase(), path, normalizeParams(params), ts, nonce]` joined by `"\n"` (+ `"\n"+body` if body)
  - `normalizeParams` = sort keys asc, sort each key's values asc, `URLSearchParams.toString()`
  - `signature = SHA-256(canonical)` as hex (`crypto.subtle.digest("SHA-256", …)`, **plain digest, not HMAC**)
- **`kc()`** = `String(Math.floor(Date.now()/1000))` (seconds).
- **`wc(e=16)`** = 16 random chars from `ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789`.
- Bulk GET path = `/api/v1/bulk`; base params `{domain, stream:"true", view:"full"}`; `nonce`/`signature`/`timestamp` merged into query.

**Response** (`Content-Type: text/event-stream`, SSE):
- `event: whois` → `data.data` = RDAP object: `events[]` (registration/expiration/last changed → `eventDate`), `nameservers[]` (`ldhName`), `entities[0]` (registrar; `vcardArray[1]` → `fn`), `status[]`.
- `event: traffic` → `data.data` = `{hostname,title,description,overview,monthlyVisits,trafficSources,trafficSourceTrends,topKeywords,topRegions,aiTraffic}`.
  - `overview`: `{visits,globalRank,countryRank,bounceRate,pagePerVisit,timeOnSite,month,year}` (mostly numeric strings).
  - `trafficSources`: `{direct,searchOrganic,searchPaid,socialOrganic,socialPaid,referrals,mail,genAi,affiliate,displayAds}` (0–1 ratios).
  - `topKeywords[]`: `{name,volume,cpc,estimatedValue}`.
  - `topRegions[]`: `{country,name,value}`.
  - `aiTraffic.trends[]`: `{name,history:[{date,value}]}`.
- `event: complete` → `{status:"DONE",duration}`.
- **Edge case:** unknown / unregistered domain → only `event: status` with `data.data.status === 3` + `complete` (no whois/traffic). → raise `EmptyResultError`.

---

## File map

| Path | Responsibility |
|------|----------------|
| `packages/aitdk/src/lib.ts` | Pure helpers: `normalizeDomain`, `randomNonce`, `normalizeParams`, `sign`, `buildBulkUrl`, `parseSseEvents`, `mapWhois`, `mapTraffic` |
| `packages/aitdk/src/get-data.ts` | `cli()` registration + fetch + SSE parse + return mapping |
| `packages/aitdk/src/lib.test.ts` | Unit tests (signature reproduction, nonce, params, SSE, mapping) |
| `packages/aitdk/package.json` | Package metadata + esbuild build/test scripts |
| `packages/aitdk/opencli-plugin.json` | Plugin manifest (`name`: `aitdk`) |
| `packages/aitdk/get-data.js` | esbuild output (gitignored) |
| `opencli-plugin.json` | Register `aitdk` under monorepo `plugins` |
| `package.json` | workspace + `build` / `build:aitdk` |
| `.gitignore` | Ignore `packages/aitdk/get-data.js` |
| `README.md` | Install + `aitdk get-data` docs |

---

### Task 1: Scaffold plugin package

- [ ] Create `packages/aitdk/opencli-plugin.json`:
```json
{
  "name": "aitdk",
  "version": "0.1.0",
  "description": "AITDK domain snapshot (aitdk get-data) via wapi.aitdk.com",
  "opencli": ">=1.8.6"
}
```
- [ ] Create `packages/aitdk/package.json` (mirror `query-domain`/`sem`): `opencli-plugin-aitdk`, `type: module`, peerDep `@jackwener/opencli >=1.8.6`, devDep `esbuild ^0.28.1`; scripts:
  - `build`: `npx esbuild src/get-data.ts --bundle --outfile=get-data.js --format=esm --platform=node --packages=external`
  - `test`: `node --experimental-strip-types --test src/lib.test.ts`
- [ ] Wire root `opencli-plugin.json`: add `"aitdk": { "path": "packages/aitdk" }` to `plugins`; bump `version`; append `+ aitdk` to `description`.
- [ ] Wire root `package.json`: add `packages/aitdk` to `workspaces`; append `&& npm run build -w opencli-plugin-aitdk` to `build`; add `build:aitdk` script; update `description`.
- [ ] Append `packages/aitdk/get-data.js` to `.gitignore`.

---

### Task 2: Pure helpers + tests (TDD)

- [ ] Create `packages/aitdk/src/lib.ts` with:
  - Constants: `SECRET = '541737bb-02ce-4fb6-8157-3c7166873777'`, `BASE_URL = 'https://wapi.aitdk.com'`, `BULK_PATH = '/api/v1/bulk'`, `ALPHABET`.
  - `normalizeDomain(raw)`: strip scheme/path, lowercase, drop leading `www.` (reuse `sem/lib/utils` pattern).
  - `randomNonce(len=16)`: 16 chars from `ALPHABET` via `crypto.randomBytes` (`bytes[i] % ALPHABET.length`).
  - `normalizeParams(params)`: sort keys (Set), sort each key's values, `URLSearchParams.toString()`.
  - `sign(method, path, params, ts, nonce, secret=SECRET)`: `createHash('sha256').update([METHOD.toUpperCase(),path,normalizeParams(params),ts,nonce].join('\n')+'\n'+secret,'utf8').digest('hex')`.
  - `buildBulkUrl(domain)`: base params `{domain,stream:'true',view:'full'}` → `ts`/`nonce`/`signature` → full URL.
  - `parseSseEvents(text)`: split `\n\n`, parse `event:`/`data:` lines, JSON.parse data → array (reuse `query-domain/lib` pattern).
  - `mapWhois(data)`: `{registrar, registered, expires, updated, nameservers[], status[]}`; dates ISO → `YYYY-MM-DD`; registrar from `entities[0].vcardArray[1]` find `fn`.
  - `mapTraffic(data)`: parse numbers (`visits` int, `globalRank`/`countryRank` int, `bounceRate`/`pagePerVisit`/`timeOnSite` rounded), pass through `trafficSources`, `monthlyVisits`, `topKeywords`, `topRegions`; `aiTraffic` → latest `history[0].value` per source.
- [ ] Create `packages/aitdk/src/lib.test.ts` with `node:test` cases:
  - **Signature reproduction** (the gold check): `sign('GET','/api/v1/bulk',{domain:'websitecloner.io',stream:'true',view:'full'},'1785918242','4xUYpeqPcxQD0RBU')` === `'c4aea28f9a79a278254ac866f45222edafcd43a251255257905aa9143bdc86cb'`.
  - `normalizeParams` sorts keys+values.
  - `randomNonce` is 16 chars, alphanumeric, two calls differ.
  - `parseSseEvents` on a 3-event sample returns whois/traffic/complete with parsed JSON.
  - `mapWhois` / `mapTraffic` on sample payloads → expected scalars + dates.
- [ ] Run `npm run test -w opencli-plugin-aitdk` → green.

---

### Task 3: Implement `get-data` command

- [ ] Create `packages/aitdk/src/get-data.ts`:
  - Header strategy note (PUBLIC, contract, evidence summary from above, `Browser: false`).
  - `cli({ site:'aitdk', name:'get-data', access:'read', strategy: Strategy.PUBLIC, browser:false, domain:'wapi.aitdk.com', args:[{name:'domain',type:'string',required:true,positional:true,help:'目标域名（如 ahrefs.com）'}], columns:[...SCALAR_COLUMNS], func })`.
  - `columns` (scalar, for table): `domain, visits, globalRank, countryRank, bounceRate, pagePerVisit, timeOnSite, registrar, registered, expires`.
  - `func(args)`:
    1. `normalizeDomain(args.domain)` → `domain`.
    2. `buildBulkUrl(domain)` → fetch with headers `{accept:'*/*', origin:'https://extension.aitdk.com', referer:'https://extension.aitdk.com/', user-agent: Chrome UA}`.
    3. Errors: 429 → `CliError('RATE_LIMITED',…,75)`; !ok → `CliError('FETCH_ERROR',…)`.
    4. `parseSseEvents(text)` → find `whois` and `traffic` events (last of each). If neither present (only `status` event) → `EmptyResultError('aitdk get-data', 'No data for <domain> (unregistered/unknown)')`.
    5. Build return object (single object — `render` wraps non-array into 1 row):
       - Scalars (top-level): `domain, visits, globalRank, countryRank, bounceRate, pagePerVisit, timeOnSite, registrar, registered, expires`.
       - Nested (JSON/YAML only): `title, description, updated, dataMonth, dataYear, nameservers, status, trafficSources, topKeywords, topRegions, aiTraffic, monthlyVisits`.
       - Missing traffic overview → scalars `null` (still return whois).
- [ ] `npm run build -w opencli-plugin-aitdk` → `get-data.js` written, no errors.

---

### Task 4: Install + smoke verify

- [ ] `opencli plugin install file://$(pwd)/packages/aitdk` (or `opencli plugin update aitdk`); `opencli plugin list` shows `aitdk`.
- [ ] `opencli aitdk get-data --help` → positional `domain`.
- [ ] Happy path: `opencli aitdk get-data ahrefs.com -f json` → object with `visits`, `globalRank`, `registrar`, `registered`, `expires`, plus nested `trafficSources`/`topKeywords`/`monthlyVisits`.
- [ ] Table: `opencli aitdk get-data ahrefs.com` → 1-row table with scalar columns.
- [ ] YAML: `opencli aitdk get-data ahrefs.com -f yaml` → full nested object.
- [ ] Unknown domain: `opencli aitdk get-data xzcvasdfqwerty123456.com -f json` → `EmptyResultError` mentioning unregistered/unknown.
- [ ] Arg error: `opencli aitdk get-data ""` → non-zero exit, mentions domain.

---

### Task 5: README

- [ ] Update `README.md`:
  1. Intro table: add `packages/aitdk` row (AITDK 域名数据快照，PUBLIC，无需 Chrome).
  2. Prerequisites: `aitdk` needs no Chrome (list under PUBLIC like google-trends/query-domain).
  3. Install: `file://$(pwd)/packages/aitdk` + `github:CoderLim/keyword-kits/aitdk`.
  4. Command table: `| aitdk get-data | aitdk | 域名 SEO 数据快照（whois + 流量） |`.
  5. New `## aitdk get-data` section: usage, args table (`domain`), output columns, `-f json`/`-f yaml` for full nested data, note PUBLIC/no-Chrome, note unknown-domain → empty error.
  6. Directory structure + 实现说明 + 故障排查 (429 rate limit / signature/timestamp errors / unknown domain).
- [ ] Keep existing plugin docs intact.

---

## Design notes / out of scope

- **Single domain only** (matches user's example). Bulk/multi-domain not exposed — `domain` is one host.
- **`view=full` fixed** (not a CLI flag); other view values unknown, so not exposed.
- **Hybrid output object**: scalar top-level fields drive a readable default table (`columns` subset); nested fields appear in `-f json` / `-f yaml` (those formatters dump the full object, ignoring `columns`). This mirrors `ahrefs backlinks`'s "recommend `-f json`" philosophy while keeping a useful default table.
- Secret is a static bundle constant; if AITDK rotates it, signature verification breaks and the secret must be re-extracted from the bundle.

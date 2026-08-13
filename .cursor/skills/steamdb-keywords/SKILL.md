---
name: steamdb-keywords
description: Use when finding recently released Steam game keywords, ranking them by SteamDB 7-day follower growth, or checking partial availability of common .com/.org/.net domains with opencli.
---

# SteamDB Keywords

Find domain-friendly keywords from recently released Steam games. Use the bundled script so ranking, title cleanup, concurrency, and domain classification remain consistent.

## Run

Resolve the requested window to days:

- No window specified: use the default 90 days (three 30-day months).
- Days: pass `--days N`.
- Weeks or months: pass `--weeks N` or `--months N`.
- A start date through today: pass `--since YYYY-MM-DD`.

Resolve `<skill-directory>` to the directory containing this `SKILL.md`, then run:

```bash
node "<skill-directory>/scripts/steamdb-keywords.mjs"
```

The default output is one keyword per line for games released in the last 90 days where only some of `.com`, `.org`, and `.net` are unregistered. Results retain SteamDB's descending 7-day follower-gain order.

## Options

| Need | Option |
|---|---|
| Change release window | `--days N`, `--weeks N`, `--months N`, or `--since YYYY-MM-DD` |
| Change candidate count | `--limit N` (default 100, max 1000) |
| Require minimum 7-day gain | `--min-gain N` |
| Only partially available common TLDs | `--availability partial` (default) |
| At least one common TLD available | `--availability any` |
| All three common TLDs available | `--availability all` |
| No common TLD available | `--availability none` |
| Include game and domain details | `--format json` |
| Adjust request pressure | `--concurrency N` (default 3, max 10) |

Example for the last six months:

```bash
node "<skill-directory>/scripts/steamdb-keywords.mjs" --months 6 --availability partial
```

## Rules

- Use `opencli steamdb new-trending`; do not call the Steam API or scrape per-game pages.
- Take the text before an English or Chinese colon as the keyword. Sanitize punctuation and diacritics for domain lookup; if the prefix has no Latin letters, fall back to a Latin subtitle after the colon.
- Treat a common TLD as available only when `opencli queryDomain` returns `existed: "no"` and no registration date. A domain marked for sale is registered, not available.
- Keep successful rows in follower-growth order. Report domain-query failures separately; do not silently classify missing TLD data.
- Domain status is point-in-time data. Re-run before registration decisions.

## Common failures

- If `opencli steamdb new-trending --help` fails, install or repair the local SteamDB OpenCLI plugin.
- A SteamDB table-expansion timeout is retried once because cold page loads can exceed the site's fixed wait window.
- If SteamDB shows a challenge or rate limit, stop and report it; retry later rather than bypassing it.
- If domain lookups throttle, rerun with `--concurrency 1`.

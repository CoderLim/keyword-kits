# Backlinks Auto-Pagination — Design Spec

**Date:** 2026-08-13
**Status:** Approved for implementation
**Scope:** `opencli sim backlinks` and `opencli sem backlinks`

## Goal

Keep the existing `--limit` interface while allowing callers to request more than the current single-page maximum of 100 rows. Both backlinks commands will automatically traverse result pages until they satisfy the requested limit or exhaust the available data.

```bash
opencli sim backlinks example.com --limit 500
opencli sem backlinks example.com --limit 500
```

## Locked decisions

| Decision | Choice |
|---|---|
| CLI interface | Preserve `--limit`; do not add `--page` or `--pages` |
| Default limit | Preserve 50 |
| Maximum limit | Increase from 100 to 1000 |
| Pagination | Click the page's next control automatically |
| Commands | Apply equivalent behavior to `sim backlinks` and `sem backlinks` |
| Result order | Preserve the UI's current order across pages |

## Design

Each command continues to open its existing deep link and wait for the first page to become ready. It then runs a bounded accumulation loop:

1. Extract the current page's rows.
2. Append previously unseen rows in UI order.
3. Stop if `limit` rows have been collected.
4. Inspect the next-page control and stop when it is absent or disabled.
5. Click next, wait until the table changes, then repeat.

The implementation will use the pagination controls actually exposed by each site's DOM. Pagination state detection and click behavior may use site-specific selectors, while the loop semantics remain identical.

### Deduplication and progress detection

Rows will be keyed by stable backlink identity fields rather than their displayed rank. The preferred identity is `sourceUrl + targetUrl + anchor`; other extracted fields may be used as a fallback when URLs are absent.

Before clicking next, the command records a fingerprint of the current page. After the click it waits for either a new fingerprint, an empty/end state, an authentication state, or an error. If the fingerprint does not change before the timeout, the command stops instead of appending duplicate data or looping indefinitely.

### Safety bounds

The public `--limit` maximum is 1000. The loop also has a finite page cap derived from this limit plus a small safety margin, so unexpected UI behavior cannot cause unbounded navigation. Returning fewer than requested rows is valid when the site has fewer results or pagination can no longer advance.

## Error behavior

Existing first-page errors remain unchanged: invalid arguments, missing authentication, load failures, timeouts, and empty results keep their current typed errors.

After at least one page has been collected, reaching the final page or failing to advance ends collection and returns the rows already gathered. A clear authentication or page error encountered during pagination remains an error rather than silently returning a misleading partial result.

## Testing

Tests will be written before production changes and will cover:

- accepting limits up to 1000 and rejecting 1001;
- accumulating multiple pages in order until `limit` is reached;
- stopping at a disabled or missing next control;
- deduplicating repeated rows between pages;
- stopping when a click does not change the page fingerprint;
- preserving existing default-limit and invalid-limit behavior.

The final verification will run both package test suites and builds. When the logged-in browser environment is available, a live smoke test with `--limit` greater than 100 will verify the actual site selectors.

## Documentation

README examples and argument descriptions for both commands will state that `--limit` accepts 1–1000 and triggers automatic pagination when more than one page is required.

## Out of scope

- Exposing page numbers or page size as CLI arguments.
- Changing backlink filters, sorting, output columns, or default limits.
- Replacing the current UI strategy with a private API.
- Retrying indefinitely when a site does not advance.

## Success criteria

- Both commands accept `--limit 101` through `--limit 1000`.
- Both commands collect across UI pages and return at most the requested number of unique rows.
- Pagination terminates safely at the end of results or when the UI fails to advance.
- Existing behavior for requests of 100 rows or fewer remains compatible.
- Tests, TypeScript builds, and updated documentation pass verification.

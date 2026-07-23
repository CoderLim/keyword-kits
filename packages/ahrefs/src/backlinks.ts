/**
 * ahrefs backlinks — Ahrefs free Backlink Checker.
 *
 * Strategy: UI
 * Contract: deep-link pre-fills input+mode → click "Check backlinks" → scrape
 *   result modal summary + table (unlike kd, deep-link does NOT auto-run).
 * Evidence (2026-07-23 live recon):
 *   - UI: https://ahrefs.com/backlink-checker/
 *   - Deep-link: ?input=<domain>&mode=subdomains
 *     e.g. https://ahrefs.com/backlink-checker/?input=ahrefs.com&mode=subdomains
 *     Fills `input[placeholder="Enter domain or URL"]` and mode "Subdomains";
 *     must click button "Check backlinks".
 *   - Result: React modal titled `Backlink profile for {domain}`
 *     (`.ReactModalPortal` / content with that title). Subtitle:
 *     "Domain including subdomains. One link per domain".
 *   - Summary metrics (labels → parse values from adjacent text):
 *     - "Domain Rating" → integer DR (e.g. 91)
 *     - "Backlinks" → abbreviated count + "N% dofollow"
 *     - "Linking websites" → abbreviated count + "N% dofollow" (= referring domains)
 *     - "URL Rating" gated (toolbar upsell) — ignore
 *   - Table `table` columns: DR | Referring page | Anchor and target URL
 *     (~20 visible rows). Referring page = title + source URL; third col =
 *     anchor (+ snippet) + target URL.
 *   - Underlying XHR (NOT usable as PUBLIC):
 *     POST https://ahrefs.com/v4/stGetFreeBacklinksOverview
 *     POST https://ahrefs.com/v4/stGetFreeBacklinksList
 *     body { url, mode, captcha } (Turnstile). Errors: InvalidCaptcha | InvalidUrl.
 *     Overview JSON: { domainRating, backlinks, refdomains, dofollowBacklinks,
 *       dofollowRefdomains }. List rows: { domainRating, urlFrom, title, anchor,
 *       urlTo, textPre, textPost, redirectChain, inRaw, inRendered }.
 *   - Cloudflare `__cf_bm` + Turnstile script present.
 * Auth: none (free tool). Login wall → CommandExecutionError.
 * Browser: true
 * Notes: CookieYes consent banner may block clicks — dismiss Accept/Reject All
 *   first (same as kd).
 *
 * Locked links[] field names (stable CLI output):
 *   dr, title, sourceUrl, anchor, targetUrl
 *   (map from DOM/API: domainRating→dr, title→title, urlFrom→sourceUrl,
 *    anchor→anchor, urlTo→targetUrl; no per-row dofollow on free list)
 *
 * Summary mapping:
 *   domain, dr, refDomains (Linking websites), refDomainsDofollowPct,
 *   backlinks, backlinksDofollowPct
 */
import { cli, Strategy } from '@jackwener/opencli/registry';

cli({
  site: 'ahrefs',
  name: 'backlinks',
  access: 'read',
  description: 'Check Ahrefs free Backlink Checker (DR + backlinks, mode=subdomains)',
  strategy: Strategy.UI,
  browser: true,
  domain: 'ahrefs.com',
  args: [
    {
      name: 'domain',
      type: 'string',
      required: true,
      positional: true,
      help: 'Target domain (e.g. ahrefs.com)',
    },
  ],
  columns: ['summary', 'links'],
  func: async () => {
    throw new Error('ahrefs backlinks not implemented yet');
  },
});

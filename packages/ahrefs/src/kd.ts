/**
 * ahrefs kd — Ahrefs free Keyword Difficulty Checker.
 *
 * Strategy: UI
 * Contract: open free tool (or deep-link) → fill keyword/country → Check → scrape KD integer from result modal
 * Evidence:
 *   - UI: https://ahrefs.com/keyword-difficulty
 *   - Deep-link (auto-runs check): ?country=<cc>&input=<keyword>
 *     e.g. https://ahrefs.com/keyword-difficulty/?country=us&input=keyword%20research
 *   - Form: input[placeholder="Enter keyword"]; country control button (default "United States" / us);
 *     submit button type=submit text "Check keyword"
 *   - Result modal: [role=dialog][class*=content] titled `Keyword Difficulty for "…"`.
 *     KD integer in [class*=chartValue] (sibling label Easy|Medium|Hard|Super hard under [class*=chartData]).
 *   - Underlying XHR (NOT usable as PUBLIC): POST https://ahrefs.com/v4/stGetFreeSerpOverviewForKeywordDifficultyChecker
 *     body { keyword, country, captcha } → JSON { difficulty: int, shortage: int, lastUpdate, serp }.
 *     Missing captcha → InvalidInput; empty/bad captcha → ["Error","InvalidCaptcha"]. Captcha gate blocks stable no-login replay.
 * Auth: none (free tool). No login wall for sample "keyword research"/us (KD 92). If login wall appears → CommandExecutionError.
 * Browser: true
 * Notes: CookieYes consent banner may block clicks — dismiss Accept/Reject All first. Cloudflare __cf_bm present.
 */
import { cli, Strategy } from '@jackwener/opencli/registry';

cli({
  site: 'ahrefs',
  name: 'kd',
  access: 'read',
  description: 'Check Ahrefs Keyword Difficulty (free tool)',
  strategy: Strategy.UI,
  browser: true,
  args: [
    {
      name: 'keyword',
      type: 'string',
      required: true,
      positional: true,
      help: 'Keyword or phrase to check',
    },
    {
      name: 'country',
      type: 'string',
      default: 'us',
      help: 'Two-letter country code (default us)',
    },
  ],
  columns: ['keyword', 'country', 'kd'],
  func: async () => {
    throw new Error('ahrefs kd not implemented yet');
  },
});

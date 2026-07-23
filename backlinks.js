import {
  ArgumentError,
  AuthRequiredError,
  CommandExecutionError,
  EmptyResultError,
  TimeoutError
} from "@jackwener/opencli/errors";
import { cli, Strategy } from "@jackwener/opencli/registry";
const SITE_ORIGIN = "https://sim.3ue.com";
const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;
const LOAD_TIMEOUT_SEC = 90;
const COLUMNS = [
  "rank",
  "sourceTitle",
  "sourceUrl",
  "anchor",
  "impact",
  "domainScore",
  "targetUrl",
  "firstSeen",
  "lastSeen"
];
function normalizeDomain(raw) {
  const input = String(raw ?? "").trim();
  if (!input) throw new ArgumentError("domain is required");
  let host = input;
  try {
    if (/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(input)) {
      host = new URL(input).hostname;
    } else {
      host = input.split("/")[0].split("?")[0].split("#")[0];
    }
  } catch {
    throw new ArgumentError(`invalid domain: ${input}`);
  }
  host = host.trim().toLowerCase().replace(/\.$/, "");
  if (!host || !/^[a-z0-9.-]+$/.test(host) || !host.includes(".")) {
    throw new ArgumentError(`invalid domain: ${input}`);
  }
  return host;
}
function normalizeLimit(raw, defaultValue = DEFAULT_LIMIT) {
  const value = raw ?? defaultValue;
  const n = Number(value);
  if (!Number.isInteger(n) || n < 1) {
    throw new ArgumentError("limit must be a positive integer");
  }
  if (n > MAX_LIMIT) {
    throw new ArgumentError(`limit must be <= ${MAX_LIMIT}`);
  }
  return n;
}
function buildBacklinksUrl(domain) {
  const qs = new URLSearchParams({
    duration: "28d",
    key: domain,
    sort: "DomainScore",
    status: "Active"
  });
  qs.set("_", String(Date.now()));
  return `${SITE_ORIGIN}/#/digitalsuite/acquisition/backlinks/table/999/?${qs.toString()}`;
}
const PAGE_STATUS_JS = `(() => {
  const text = document.body?.innerText || '';
  const dataRows = document.querySelectorAll('.ant-table-row [data-automation-field="UrlFrom"]');
  if (dataRows.length >= 5) return 'ready';

  if (/\u8BF7\u767B\u5F55|\u767B\u5F55\u540E|Sign in|Log in/i.test(text) && dataRows.length === 0) {
    return 'auth';
  }
  if (/\u989D\uFF0C\u51FA\u9519\u4E86|Something went wrong|failed to load/i.test(text) && dataRows.length === 0) {
    return 'error';
  }
  if (dataRows.length > 0) return 'hydrating';
  return 'loading';
})()`;
const EXTRACT_ROWS_JS = `(() => {
  const rows = [];
  for (const tr of document.querySelectorAll('.ant-table-row')) {
    const cell = (field) => tr.querySelector('[data-automation-field="' + field + '"]');
    const textOf = (field) => (cell(field)?.innerText || '').trim();
    const urlFromEl = cell('UrlFrom');
    if (!urlFromEl) continue;

    const rank = Number((tr.querySelector('td')?.innerText || '').trim());
    if (!Number.isFinite(rank) || rank < 1) continue;

    const titleLines = textOf('UrlFrom').split('\\n').map((s) => s.trim()).filter(Boolean);
    const sourceTitle = titleLines[0] || '';
    const sourceUrl = urlFromEl.querySelector('a[href]')?.href
      || titleLines.find((l) => /^https?:\\/\\//i.test(l))
      || '';

    const urlToText = textOf('UrlTo');
    const targetUrl = (urlToText.split('\\n').map((s) => s.trim()).find((l) => /^https?:\\/\\//i.test(l)) || '')
      .replace(/\\s*\u65B0\\s*$/, '')
      .trim();

    rows.push({
      rank,
      sourceTitle,
      sourceUrl,
      anchor: textOf('Anchor'),
      impact: Number(String(textOf('Rank')).replace(/[^0-9.-]/g, '')) || 0,
      domainScore: Number(String(textOf('DomainScore')).replace(/[^0-9.-]/g, '')) || 0,
      targetUrl,
      firstSeen: textOf('FirstSeen'),
      lastSeen: textOf('LastVisited'),
    });
  }
  return JSON.stringify(rows);
})()`;
cli({
  site: "sim",
  name: "backlinks",
  access: "read",
  description: "\u67E5\u770B\u7F51\u7AD9\u53CD\u5411\u94FE\u63A5\uFF08SimilarWeb / sim.3ue.com\uFF0C\u9ED8\u8BA4 Active + DomainScore\uFF09",
  domain: "sim.3ue.com",
  strategy: Strategy.UI,
  browser: true,
  args: [
    {
      name: "domain",
      type: "string",
      required: true,
      positional: true,
      help: "\u76EE\u6807\u57DF\u540D\uFF08\u5982 stripe.com\uFF09"
    },
    {
      name: "limit",
      type: "int",
      default: DEFAULT_LIMIT,
      help: `\u8FD4\u56DE\u6761\u6570\uFF081-${MAX_LIMIT}\uFF0C\u9ED8\u8BA4 ${DEFAULT_LIMIT}\uFF09`
    }
  ],
  columns: [...COLUMNS],
  func: async (page, kwargs) => {
    const domain = normalizeDomain(kwargs.domain);
    const limit = normalizeLimit(kwargs.limit, DEFAULT_LIMIT);
    const url = buildBacklinksUrl(domain);
    if (typeof page.newTab === "function" && typeof page.selectTab === "function") {
      const tabId = await page.newTab(url);
      if (tabId) await page.selectTab(tabId);
    } else {
      await page.goto(url);
    }
    let status = "loading";
    let refreshed = false;
    let hydratingSince = 0;
    const deadline = Date.now() + LOAD_TIMEOUT_SEC * 1e3;
    while (Date.now() < deadline) {
      status = String(await page.evaluate(PAGE_STATUS_JS));
      if (status === "ready" || status === "auth") break;
      if (status === "hydrating") {
        if (!hydratingSince) hydratingSince = Date.now();
        if (Date.now() - hydratingSince > 3e3) {
          status = "ready";
          break;
        }
      }
      if (status === "error" && !refreshed) {
        refreshed = true;
        await page.evaluate(`(() => {
          const btn = [...document.querySelectorAll('button')]
            .find((b) => /\u5237\u65B0|Refresh|Retry/i.test(b.textContent || ''));
          btn?.click();
        })()`);
      }
      await page.wait(0.5);
    }
    if (status === "auth") {
      throw new AuthRequiredError("sim.3ue.com", "Not logged in to sim.3ue.com \u2014 open Chrome and sign in first");
    }
    if (status === "error") {
      throw new CommandExecutionError(
        `Backlinks page failed to load for ${domain}. Try refreshing in the browser.`
      );
    }
    if (status !== "ready") {
      throw new TimeoutError(`sim backlinks (${domain})`, LOAD_TIMEOUT_SEC);
    }
    const raw = await page.evaluate(EXTRACT_ROWS_JS);
    let rows = [];
    try {
      const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
      rows = Array.isArray(parsed) ? parsed : [];
    } catch {
      throw new CommandExecutionError("Failed to parse backlinks table payload");
    }
    if (rows.length === 0) {
      throw new EmptyResultError("sim backlinks", `No active backlinks found for ${domain}`);
    }
    return rows.slice(0, limit);
  }
});
export {
  normalizeDomain,
  normalizeLimit
};

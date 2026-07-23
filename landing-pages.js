// landing-pages.ts
import {
  ArgumentError as ArgumentError2,
  AuthRequiredError,
  CommandExecutionError as CommandExecutionError2,
  EmptyResultError,
  TimeoutError
} from "@jackwener/opencli/errors";
import { cli, Strategy } from "@jackwener/opencli/registry";

// lib/utils.ts
import { ArgumentError, CommandExecutionError } from "@jackwener/opencli/errors";
var DEFAULT_LIMIT = 50;
var MAX_LIMIT = 100;
var LOAD_TIMEOUT_SEC = 90;
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
  host = host.replace(/^www\./, "");
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
async function openDeepLink(page, url) {
  if (typeof page.newTab === "function" && typeof page.selectTab === "function") {
    const tabId = await page.newTab(url);
    if (tabId) await page.selectTab(tabId);
    return;
  }
  await page.goto(url);
}
async function waitForPageStatus(page, statusJs, timeoutSec, opts = {}) {
  let status = "loading";
  let refreshed = false;
  let hydratingSince = 0;
  const deadline = Date.now() + timeoutSec * 1e3;
  while (Date.now() < deadline) {
    status = String(await page.evaluate(statusJs));
    if (status === "ready" || status === "auth") return status;
    if (status === "hydrating") {
      if (!hydratingSince) hydratingSince = Date.now();
      if (Date.now() - hydratingSince > 3e3) return "ready";
    }
    if (status === "error" && !refreshed) {
      refreshed = true;
      if (opts.onError) {
        await opts.onError();
      } else {
        await page.evaluate(`(() => {
          const btn = [...document.querySelectorAll('button')]
            .find((b) => /\u5237\u65B0|Refresh|Retry/i.test(b.textContent || ''));
          btn?.click();
        })()`);
      }
    }
    await page.wait(0.5);
  }
  return status;
}
function parseJsonRows(raw, label) {
  let parsed = raw;
  if (typeof raw === "string") {
    try {
      parsed = JSON.parse(raw);
    } catch {
      throw new CommandExecutionError(`Failed to parse ${label} payload`);
    }
  }
  return Array.isArray(parsed) ? parsed : [];
}

// landing-pages.ts
var CHANGE_FILTERS = {
  new: "New",
  "\u65B0\u70B9\u51FB\u91CF": "New"
};
function normalizeChange(raw) {
  const input = String(raw ?? "").trim();
  if (!input) return void 0;
  const key = input.toLowerCase() === "new" ? "new" : input;
  const mapped = CHANGE_FILTERS[key] ?? CHANGE_FILTERS[input];
  if (!mapped) {
    throw new ArgumentError2(
      `unknown change filter "${input}". Supported: new (\u65B0\u70B9\u51FB\u91CF)`
    );
  }
  return mapped;
}
var COLUMNS = [
  "rank",
  "url",
  "clicks",
  "clicksShare",
  "change",
  "keywords",
  "topKeyword",
  "serpFeatures"
];
function buildLandingPagesUrl(domain, change) {
  const pageFilter = JSON.stringify([{ url: domain, searchType: "domain" }]);
  const qs = new URLSearchParams({
    key: domain,
    pageFilter,
    webSource: "Total",
    selectedPageTab: "Organic",
    _: String(Date.now())
  });
  if (change) qs.set("Change", change);
  return `https://sim.3ue.com/#/organicsearch/pageAnalysis/landing-pages-v2/*/999/28d?${qs.toString()}`;
}
var PAGE_STATUS_JS = `(() => {
  const text = document.body?.innerText || '';
  const urlCells = document.querySelectorAll('.organic-landing-pages-table .url-cell');
  if (urlCells.length >= 5) return 'ready';

  if (/\u8BF7\u767B\u5F55|\u767B\u5F55\u540E|Sign in|Log in/i.test(text) && urlCells.length === 0) {
    return 'auth';
  }
  if (/\u989D\uFF0C\u51FA\u9519\u4E86|Something went wrong|failed to load/i.test(text) && urlCells.length === 0) {
    return 'error';
  }
  if (urlCells.length > 0) return 'hydrating';
  return 'loading';
})()`;
var EXTRACT_ROWS_JS = `(() => {
  const table = document.querySelector('.organic-landing-pages-table');
  if (!table) return JSON.stringify([]);

  const columns = [...table.querySelectorAll('.swReactTable-column, .swReactTable-unResizeColumn')]
    .map((col) => [...col.querySelectorAll('.swReactTableCell')])
    .filter((cells) => cells.length >= 5);
  if (columns.length < 3) return JSON.stringify([]);

  const cellText = (cell) => (cell?.innerText || '').trim();

  // Identify columns by first-row content / class (header row lives elsewhere).
  let rankCol = -1;
  let urlCol = -1;
  let clicksCol = -1;
  let changeCol = -1;
  let keywordsCol = -1;
  let topKeywordCol = -1;
  let serpCol = -1;

  columns.forEach((cells, i) => {
    const t0 = cellText(cells[0]);
    const cls0 = cells[0]?.className || '';
    if (urlCol < 0 && /url-cell/.test(cls0)) {
      urlCol = i;
      return;
    }
    if (rankCol < 0 && /^\\d+$/.test(t0)) {
      rankCol = i;
      return;
    }
    if (clicksCol < 0 && /\\d/.test(t0) && /%/.test(t0) && /\\n/.test(cells[0]?.innerText || '')) {
      clicksCol = i;
      return;
    }
    if (changeCol < 0 && (/^[+-]?\\d+(\\.\\d+)?%$/.test(t0.replace(/\\s/g, '')) || /^\u65B0/.test(t0))) {
      changeCol = i;
      return;
    }
    if (keywordsCol < 0 && /\u6240\u6709\u5173\u952E\u8BCD|keywords/i.test(t0)) {
      keywordsCol = i;
      return;
    }
  });

  // Remaining text-ish columns: topKeyword then serpFeatures by order after keywords.
  columns.forEach((cells, i) => {
    if ([rankCol, urlCol, clicksCol, changeCol, keywordsCol].includes(i)) return;
    const t0 = cellText(cells[0]);
    if (t0 === '\u67E5\u770B\u8D8B\u52BF' || t0 === '') return;
    if (topKeywordCol < 0 && t0 && t0 !== '-') {
      topKeywordCol = i;
      return;
    }
    if (serpCol < 0) serpCol = i;
  });

  const rowCount = Math.min(...columns.map((c) => c.length));
  const rows = [];
  for (let r = 0; r < rowCount; r++) {
    const rank = Number(cellText(columns[rankCol]?.[r]));
    if (!Number.isFinite(rank) || rank < 1) continue;

    const url = cellText(columns[urlCol]?.[r]).split('\\n')[0].trim();
    if (!url) continue;

    const clicksRaw = cellText(columns[clicksCol]?.[r]);
    const clicksLines = clicksRaw.split('\\n').map((s) => s.trim()).filter(Boolean);

    const keywordsRaw = cellText(columns[keywordsCol]?.[r]);
    const keywords = Number(String(keywordsRaw).split('\\n')[0].replace(/[^0-9]/g, '')) || 0;

    rows.push({
      rank,
      url,
      clicks: clicksLines[0] || '',
      clicksShare: clicksLines[1] || '',
      change: cellText(columns[changeCol]?.[r]),
      keywords,
      topKeyword: cellText(columns[topKeywordCol]?.[r]),
      serpFeatures: cellText(columns[serpCol]?.[r]),
    });
  }
  return JSON.stringify(rows);
})()`;
cli({
  site: "sim",
  name: "landing-pages",
  access: "read",
  description: "\u67E5\u770B\u7F51\u7AD9\u81EA\u7136\u7740\u9646\u9875\uFF08SimilarWeb / sim.3ue.com\uFF0C\u9ED8\u8BA4 Organic + 28d\uFF09",
  domain: "sim.3ue.com",
  strategy: Strategy.UI,
  browser: true,
  args: [
    {
      name: "domain",
      type: "string",
      required: true,
      positional: true,
      help: "\u76EE\u6807\u57DF\u540D\uFF08\u5982 pollo.ai\uFF09"
    },
    {
      name: "limit",
      type: "int",
      default: DEFAULT_LIMIT,
      help: `\u8FD4\u56DE\u6761\u6570\uFF081-${MAX_LIMIT}\uFF0C\u9ED8\u8BA4 ${DEFAULT_LIMIT}\uFF09`
    },
    {
      name: "change",
      type: "string",
      default: "",
      help: "\u70B9\u51FB\u91CF\u53D8\u5316\u7B5B\u9009\uFF1Anew\uFF08\u65B0\u70B9\u51FB\u91CF\uFF09\uFF1B\u7559\u7A7A\u4E3A\u5168\u90E8"
    }
  ],
  columns: [...COLUMNS],
  func: async (page, kwargs) => {
    const domain = normalizeDomain(kwargs.domain);
    const limit = normalizeLimit(kwargs.limit, DEFAULT_LIMIT);
    const change = normalizeChange(kwargs.change);
    const url = buildLandingPagesUrl(domain, change);
    await openDeepLink(page, url);
    const status = await waitForPageStatus(page, PAGE_STATUS_JS, LOAD_TIMEOUT_SEC);
    if (status === "auth") {
      throw new AuthRequiredError("sim.3ue.com", "Not logged in to sim.3ue.com \u2014 open Chrome and sign in first");
    }
    if (status === "error") {
      throw new CommandExecutionError2(
        `Landing pages failed to load for ${domain}. Try refreshing in the browser.`
      );
    }
    if (status !== "ready") {
      throw new TimeoutError(`sim landing-pages (${domain})`, LOAD_TIMEOUT_SEC);
    }
    const rows = parseJsonRows(
      await page.evaluate(EXTRACT_ROWS_JS),
      "landing-pages"
    );
    if (rows.length === 0) {
      const filterHint = change ? ` with Change=${change}` : "";
      throw new EmptyResultError(
        "sim landing-pages",
        `No organic landing pages found for ${domain}${filterHint}`
      );
    }
    return rows.slice(0, limit);
  }
});
export {
  normalizeChange
};

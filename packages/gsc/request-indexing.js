// src/request-indexing.ts
import {
  AuthRequiredError,
  CommandExecutionError,
  TimeoutError
} from "@jackwener/opencli/errors";
import { cli, Strategy } from "@jackwener/opencli/registry";

// src/lib.ts
import { ArgumentError } from "@jackwener/opencli/errors";
var SEARCH_CONSOLE_URL = "https://search.google.com/search-console";
function normalizeTargetUrl(raw) {
  const input = String(raw ?? "").trim();
  if (!input) throw new ArgumentError("url is required");
  let parsed;
  try {
    parsed = new URL(input);
  } catch {
    throw new ArgumentError(`invalid url "${input}"`);
  }
  if (!/^https?:$/.test(parsed.protocol)) {
    throw new ArgumentError(`unsupported url protocol "${parsed.protocol}"`);
  }
  if (!parsed.hostname) {
    throw new ArgumentError(`invalid url "${input}"`);
  }
  return parsed.toString();
}
function normalizeProperty(raw, targetUrl) {
  const input = String(raw ?? "").trim();
  if (!input) {
    const parsed2 = new URL(targetUrl);
    return `${parsed2.origin}/`;
  }
  if (input.startsWith("sc-domain:")) return input;
  let parsed;
  try {
    parsed = new URL(input);
  } catch {
    throw new ArgumentError(
      `invalid property "${input}". Use sc-domain:example.com or a full URL-prefix property`
    );
  }
  if (!/^https?:$/.test(parsed.protocol)) {
    throw new ArgumentError(`unsupported property protocol "${parsed.protocol}"`);
  }
  if (!parsed.pathname.endsWith("/")) parsed.pathname = `${parsed.pathname}/`;
  parsed.search = "";
  parsed.hash = "";
  return parsed.toString();
}
function buildPropertyUrl(property) {
  return `${SEARCH_CONSOLE_URL}?resource_id=${encodeURIComponent(property)}`;
}

// src/request-indexing.ts
var LOAD_TIMEOUT_SEC = 60;
var INSPECTION_TIMEOUT_SEC = 120;
var LIVE_TEST_TIMEOUT_SEC = 180;
var REQUEST_TIMEOUT_SEC = 30;
async function openUrl(page, url) {
  if (typeof page.newTab === "function" && typeof page.selectTab === "function") {
    const tabId = await page.newTab(url);
    if (tabId) await page.selectTab(tabId);
    return;
  }
  if (typeof page.goto === "function") {
    await page.goto(url);
    return;
  }
  throw new CommandExecutionError("Browser page has neither newTab nor goto");
}
async function pollJson(page, js, deadline, done) {
  let last = { status: "loading" };
  while (Date.now() < deadline) {
    const raw = await page.evaluate(js);
    try {
      const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
      if (parsed && typeof parsed === "object") last = parsed;
    } catch {
      last = { status: "loading" };
    }
    if (done(last)) return last;
    await page.wait(0.5);
  }
  return last;
}
var PROPERTY_STATUS_JS = `(() => {
  const text = document.body?.innerText || '';
  const url = location.href || '';

  if (/accounts\\.google\\.com/i.test(url) || /Choose an account|Sign in|To continue|identifierId/i.test(text)) {
    return JSON.stringify({ status: 'auth', url });
  }
  if (/Verify it'?s you|2-Step Verification|Enter the code|Approve sign-in|Try another way/i.test(text)) {
    return JSON.stringify({ status: 'challenge', url });
  }
  if (/Welcome to Google Search Console|Add property|You do not have access/i.test(text)) {
    return JSON.stringify({ status: 'no_access', url });
  }

  const input = [...document.querySelectorAll('input, textarea')].find((el) => {
    const aria = (el.getAttribute('aria-label') || '').trim();
    const placeholder = (el.getAttribute('placeholder') || '').trim();
    const combined = (aria + ' ' + placeholder).trim();
    return /Inspect any URL|Inspect|\u68C0\u67E5\u4EFB\u4F55\u7F51\u5740|\u68C0\u67E5\u7F51\u5740|\u7F51\u5740\u68C0\u67E5/i.test(combined);
  });
  if (input) {
    return JSON.stringify({ status: 'ready', url });
  }

  return JSON.stringify({ status: 'loading', url });
})()`;
var SUBMIT_URL_JS = (targetUrl) => `(() => {
  const targetUrl = ${JSON.stringify(targetUrl)};

  function setValue(el, value) {
    el.focus();
    const proto = el.tagName === 'TEXTAREA'
      ? window.HTMLTextAreaElement.prototype
      : window.HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
    if (setter) setter.call(el, value);
    else el.value = value;
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }

  const input = [...document.querySelectorAll('input, textarea')].find((el) => {
    const aria = (el.getAttribute('aria-label') || '').trim();
    const placeholder = (el.getAttribute('placeholder') || '').trim();
    const combined = (aria + ' ' + placeholder).trim();
    return /Inspect any URL|Inspect|\u68C0\u67E5\u4EFB\u4F55\u7F51\u5740|\u68C0\u67E5\u7F51\u5740|\u7F51\u5740\u68C0\u67E5/i.test(combined);
  });
  if (!input) return JSON.stringify({ ok: false, reason: 'no-input' });

  setValue(input, targetUrl);
  input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', which: 13, keyCode: 13, bubbles: true }));
  input.dispatchEvent(new KeyboardEvent('keypress', { key: 'Enter', code: 'Enter', which: 13, keyCode: 13, bubbles: true }));
  input.dispatchEvent(new KeyboardEvent('keyup', { key: 'Enter', code: 'Enter', which: 13, keyCode: 13, bubbles: true }));
  if (typeof input.form?.requestSubmit === 'function') input.form.requestSubmit();
  return JSON.stringify({ ok: true });
})()`;
var INSPECTION_STATUS_JS = `(() => {
  const text = document.body?.innerText || '';
  const url = location.href || '';

  if (/accounts\\.google\\.com/i.test(url) || /Choose an account|Sign in|To continue|identifierId/i.test(text)) {
    return JSON.stringify({ status: 'auth', url });
  }
  if (/Verify it'?s you|2-Step Verification|Enter the code|Approve sign-in|Try another way/i.test(text)) {
    return JSON.stringify({ status: 'challenge', url });
  }

  const verdicts = [
    'URL is on Google',
    'URL is on Google, but has issues',
    'URL is not on Google',
    'URL is an alternate version',
    '\u7F51\u5740\u5DF2\u6536\u5F55\u5230 Google',
    '\u7F51\u5740\u5DF2\u5728 Google \u4E0A',
    '\u7F51\u5740\u5DF2\u6536\u5F55\uFF0C\u4F46\u6709\u95EE\u9898',
    '\u7F51\u5740\u4E0D\u5728 Google \u4E0A',
    '\u7F51\u5740\u5C5E\u4E8E\u5907\u7528\u7248\u672C',
  ];
  const verdict = verdicts.find((item) => text.includes(item)) || null;

  const hasTestLive = /Test live URL|\u6D4B\u8BD5\u5B9E\u9645\u7F51\u5740|\u6D4B\u8BD5\u6B63\u5F0F\u7248\u7F51\u5740/i.test(text);
  const hasRequest = /Request indexing|\u8BF7\u6C42\u7F16\u5165\u7D22\u5F15|\u8981\u6C42\u5EFA\u7ACB\u7D22\u5F15|\u8981\u6C42\u5EFA\u7ACB\u7D22\u5F15\u4F5C\u4E1A/i.test(text);
  const hasInspectionSections =
    /Page indexing|Page availability|Google Index|Google-selected canonical|\u7F51\u9875\u7D22\u5F15|\u7F51\u9875\u53EF\u7528\u6027|Google \u7D22\u5F15|Google \u9009\u5B9A\u7684\u89C4\u8303\u7F51\u5740/i.test(text);
  const temporarilyUnavailable =
    /currently unavailable|temporarily unavailable|try again later|\u76EE\u524D\u65E0\u6CD5\u4F7F\u7528|\u6682\u65F6\u65E0\u6CD5\u4F7F\u7528|\u8BF7\u7A0D\u540E\u91CD\u8BD5/i.test(text);
  const pageProblem =
    /Page indexing|Page availability|\u7F51\u9875\u7D22\u5F15|\u7F51\u9875\u53EF\u7528\u6027/i.test(text) &&
    /Crawl allowed\\?.{0,20}No|Indexing allowed\\?.{0,20}No|Page fetch.{0,20}(Failed|Error|Redirect error|Soft 404|Server error)|\u5141\u8BB8\u6293\u53D6.{0,20}\u5426|\u5141\u8BB8\u5EFA\u7ACB\u7D22\u5F15.{0,20}\u5426|\u7F51\u9875\u64F7\u53D6.{0,20}(\u5931\u6557|\u9519\u8BEF)|\u6293\u53D6.{0,20}(\u5931\u6557|\u9519\u8BEF)/is.test(text);

  if (verdict || hasRequest || hasTestLive || hasInspectionSections) {
    return JSON.stringify({
      status: 'ready',
      verdict,
      hasTestLive,
      hasRequest,
      hasInspectionSections,
      temporarilyUnavailable,
      pageProblem,
      url,
    });
  }

  if (temporarilyUnavailable) {
    return JSON.stringify({ status: 'temporary_unavailable', url });
  }

  return JSON.stringify({ status: 'loading', hasTestLive, hasRequest, url });
})()`;
var CLICK_TEST_LIVE_JS = `(() => {
  const btn = [...document.querySelectorAll('button, [role=button]')].find((el) =>
    /Test live URL|\u6D4B\u8BD5\u5B9E\u9645\u7F51\u5740|\u6D4B\u8BD5\u6B63\u5F0F\u7248\u7F51\u5740/i.test((el.textContent || '').replace(/\\s+/g, ' ').trim()),
  );
  if (!btn) return JSON.stringify({ ok: false, reason: 'no-test-live' });
  btn.click();
  return JSON.stringify({ ok: true });
})()`;
var LIVE_TEST_STATUS_JS = `(() => {
  const text = document.body?.innerText || '';
  const requestBtn = [...document.querySelectorAll('button, [role=button]')].find((el) =>
    /Request indexing|\u8BF7\u6C42\u7F16\u5165\u7D22\u5F15|\u8981\u6C42\u5EFA\u7ACB\u7D22\u5F15/i.test((el.textContent || '').replace(/\\s+/g, ' ').trim()),
  );
  const rerunBtn = [...document.querySelectorAll('button, [role=button]')].find((el) =>
    /Test live URL|Live test|View tested page|\u6D4B\u8BD5\u5B9E\u9645\u7F51\u5740|\u67E5\u770B\u5DF2\u6D4B\u8BD5\u7F51\u9875/i.test((el.textContent || '').replace(/\\s+/g, ' ').trim()),
  );
  const unavailable = /currently unavailable|temporarily unavailable|try again later|\u76EE\u524D\u65E0\u6CD5\u4F7F\u7528|\u6682\u65F6\u65E0\u6CD5\u4F7F\u7528|\u8BF7\u7A0D\u540E\u91CD\u8BD5/i.test(text);
  if (requestBtn) return JSON.stringify({ status: 'ready' });
  if (unavailable) return JSON.stringify({ status: 'temporary_unavailable' });
  if (/Testing live URL|Live URL test|\u6D4B\u8BD5\u5B9E\u9645\u7F51\u5740|\u5373\u65F6\u7F51\u5740\u6D4B\u8BD5/i.test(text) || rerunBtn) {
    return JSON.stringify({ status: 'loading' });
  }
  return JSON.stringify({ status: 'loading' });
})()`;
var CLICK_REQUEST_JS = `(() => {
  const btn = [...document.querySelectorAll('button, [role=button]')].find((el) =>
    /Request indexing|\u8BF7\u6C42\u7F16\u5165\u7D22\u5F15|\u8981\u6C42\u5EFA\u7ACB\u7D22\u5F15/i.test((el.textContent || '').replace(/\\s+/g, ' ').trim()),
  );
  if (!btn) return JSON.stringify({ ok: false, reason: 'no-request-button' });
  const disabled =
    btn.matches(':disabled') ||
    btn.getAttribute('aria-disabled') === 'true' ||
    btn.classList.contains('disabled');
  if (disabled) return JSON.stringify({ ok: false, reason: 'request-disabled' });
  btn.click();
  return JSON.stringify({ ok: true });
})()`;
var REQUEST_STATUS_JS = `(() => {
  const text = document.body?.innerText || '';
  const normalized = text.replace(/\\s+/g, ' ');

  if (/Indexing requested|Indexing request submitted|Submitted to indexing queue|added to a priority crawl queue|\u5DF2\u8981\u6C42\u5EFA\u7ACB\u7D22\u5F15|\u5DF2\u63D0\u4EA4\u7D22\u5F15\u8981\u6C42|\u5DF2\u63D0\u4EA4\u5EFA\u7ACB\u7D22\u5F15\u8981\u6C42|\u5DF2\u52A0\u5165\u4F18\u5148\u68C0\u7D22\u961F\u5217/i.test(normalized)) {
    return JSON.stringify({ status: 'submitted', message: 'Indexing requested' });
  }
  if (/currently unavailable|temporarily unavailable|try again later|\u76EE\u524D\u65E0\u6CD5\u4F7F\u7528|\u6682\u65F6\u65E0\u6CD5\u4F7F\u7528|\u8BF7\u7A0D\u540E\u91CD\u8BD5/i.test(normalized)) {
    return JSON.stringify({ status: 'temporarily_unavailable', message: 'Request indexing unavailable' });
  }
  if (/Quota exceeded|\u8D85\u51FA\u914D\u989D|\u8D85\u8FC7\u914D\u989D/i.test(normalized)) {
    return JSON.stringify({ status: 'quota', message: 'Quota exceeded' });
  }

  const requestBtn = [...document.querySelectorAll('button, [role=button]')].find((el) =>
    /Request indexing|\u8BF7\u6C42\u7F16\u5165\u7D22\u5F15|\u8981\u6C42\u5EFA\u7ACB\u7D22\u5F15/i.test((el.textContent || '').replace(/\\s+/g, ' ').trim()),
  );
  if (!requestBtn) {
    return JSON.stringify({ status: 'submitted_or_already_requested', message: 'Request indexing button no longer visible' });
  }

  const disabled =
    requestBtn.matches(':disabled') ||
    requestBtn.getAttribute('aria-disabled') === 'true' ||
    requestBtn.classList.contains('disabled');
  if (disabled) {
    return JSON.stringify({ status: 'quota_or_already_requested', message: 'Request indexing button disabled after click' });
  }

  return JSON.stringify({ status: 'pending' });
})()`;
cli({
  site: "gsc",
  name: "request-indexing",
  access: "write",
  description: "Request Google indexing for a URL in Search Console",
  domain: "search.google.com",
  strategy: Strategy.UI,
  browser: true,
  example: "opencli gsc request-indexing https://example.com/page --property sc-domain:example.com",
  args: [
    {
      name: "url",
      type: "string",
      required: true,
      positional: true,
      help: "Target page URL to inspect and request indexing for"
    },
    {
      name: "property",
      type: "string",
      required: false,
      help: "GSC property, e.g. sc-domain:example.com or https://www.example.com/"
    }
  ],
  columns: ["url", "property", "status", "message"],
  func: async (page, kwargs) => {
    const targetUrl = normalizeTargetUrl(kwargs.url);
    const property = normalizeProperty(kwargs.property, targetUrl);
    const propertyUrl = buildPropertyUrl(property);
    await openUrl(page, propertyUrl);
    const loadDeadline = Date.now() + LOAD_TIMEOUT_SEC * 1e3;
    const propertyState = await pollJson(
      page,
      PROPERTY_STATUS_JS,
      loadDeadline,
      (p) => ["ready", "auth", "challenge", "no_access"].includes(String(p.status))
    );
    if (propertyState.status === "auth") {
      throw new AuthRequiredError(
        "search.google.com",
        "Not logged in to Google Search Console \u2014 open Chrome and sign in first"
      );
    }
    if (propertyState.status === "challenge") {
      throw new CommandExecutionError("Google requires additional verification before Search Console can load.");
    }
    if (propertyState.status === "no_access") {
      throw new CommandExecutionError(
        `No access to GSC property "${property}". Pass --property explicitly or use an authorized Google account.`
      );
    }
    if (propertyState.status !== "ready") {
      throw new TimeoutError(`gsc request-indexing load property (${property})`, LOAD_TIMEOUT_SEC);
    }
    const submitRaw = await page.evaluate(SUBMIT_URL_JS(targetUrl));
    const submit = typeof submitRaw === "string" ? JSON.parse(submitRaw) : submitRaw;
    if (!submit?.ok) {
      throw new CommandExecutionError(
        `Failed to enter URL into Search Console inspection bar: ${submit?.reason || "unknown error"}`
      );
    }
    const inspectionDeadline = Date.now() + INSPECTION_TIMEOUT_SEC * 1e3;
    let inspectionState = await pollJson(
      page,
      INSPECTION_STATUS_JS,
      inspectionDeadline,
      (p) => ["ready", "auth", "challenge", "temporary_unavailable"].includes(String(p.status))
    );
    if (inspectionState.status === "auth") {
      throw new AuthRequiredError(
        "search.google.com",
        "Google session expired during URL inspection \u2014 sign in again and retry"
      );
    }
    if (inspectionState.status === "challenge") {
      throw new CommandExecutionError("Google asked for verification during URL inspection.");
    }
    if (inspectionState.status === "temporary_unavailable") {
      return [
        {
          url: targetUrl,
          property,
          status: "temporarily_unavailable",
          message: "Search Console request indexing is temporarily unavailable"
        }
      ];
    }
    if (inspectionState.status !== "ready") {
      throw new TimeoutError(`gsc request-indexing inspect (${targetUrl})`, INSPECTION_TIMEOUT_SEC);
    }
    if (inspectionState.pageProblem === true) {
      return [
        {
          url: targetUrl,
          property,
          status: "page_not_requestable",
          message: "Live/page checks suggest Google cannot crawl or index this URL yet"
        }
      ];
    }
    if (inspectionState.hasRequest !== true && inspectionState.hasTestLive === true) {
      const liveRaw = await page.evaluate(CLICK_TEST_LIVE_JS);
      const live = typeof liveRaw === "string" ? JSON.parse(liveRaw) : liveRaw;
      if (!live?.ok) {
        throw new CommandExecutionError(
          `Failed to start "Test live URL": ${live?.reason || "unknown error"}`
        );
      }
      const liveDeadline = Date.now() + LIVE_TEST_TIMEOUT_SEC * 1e3;
      const liveState = await pollJson(
        page,
        LIVE_TEST_STATUS_JS,
        liveDeadline,
        (p) => ["ready", "temporary_unavailable"].includes(String(p.status))
      );
      if (liveState.status === "temporary_unavailable") {
        return [
          {
            url: targetUrl,
            property,
            status: "temporarily_unavailable",
            message: "Search Console live test/request indexing is temporarily unavailable"
          }
        ];
      }
      if (liveState.status !== "ready") {
        throw new TimeoutError(`gsc request-indexing live test (${targetUrl})`, LIVE_TEST_TIMEOUT_SEC);
      }
      inspectionState = { ...inspectionState, hasRequest: true };
    }
    const requestRaw = await page.evaluate(CLICK_REQUEST_JS);
    const request = typeof requestRaw === "string" ? JSON.parse(requestRaw) : requestRaw;
    if (!request?.ok) {
      const reason = String(request?.reason || "unknown");
      const status2 = reason === "request-disabled" ? "quota_or_already_requested" : "request_button_missing";
      return [
        {
          url: targetUrl,
          property,
          status: status2,
          message: reason
        }
      ];
    }
    const requestDeadline = Date.now() + REQUEST_TIMEOUT_SEC * 1e3;
    const requestState = await pollJson(
      page,
      REQUEST_STATUS_JS,
      requestDeadline,
      (p) => [
        "submitted",
        "submitted_or_already_requested",
        "quota",
        "quota_or_already_requested",
        "temporarily_unavailable"
      ].includes(String(p.status))
    );
    const status = String(requestState.status || "pending");
    const message = String(requestState.message || "");
    if (status === "pending") {
      throw new TimeoutError(`gsc request-indexing request (${targetUrl})`, REQUEST_TIMEOUT_SEC);
    }
    return [
      {
        url: targetUrl,
        property,
        status,
        message
      }
    ];
  }
});

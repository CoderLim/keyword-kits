import {
  AuthRequiredError,
  CommandExecutionError,
  TimeoutError,
} from '@jackwener/opencli/errors';
import { cli, Strategy } from '@jackwener/opencli/registry';
import { buildPropertyUrl, normalizeProperty, normalizeTargetUrl } from './lib.js';

const LOAD_TIMEOUT_SEC = 60;
const INSPECTION_TIMEOUT_SEC = 120;
const LIVE_TEST_TIMEOUT_SEC = 180;
const REQUEST_TIMEOUT_SEC = 30;

type PageLike = {
  newTab?: (url?: string) => Promise<string | undefined>;
  selectTab?: (id: string) => Promise<unknown>;
  goto?: (url: string) => Promise<unknown>;
  evaluate: (js: string) => Promise<unknown>;
  wait: (sec: number) => Promise<unknown>;
};

type JsonState = Record<string, unknown>;

async function openUrl(page: PageLike, url: string): Promise<void> {
  if (typeof page.newTab === 'function' && typeof page.selectTab === 'function') {
    const tabId = await page.newTab(url);
    if (tabId) await page.selectTab(tabId);
    return;
  }
  if (typeof page.goto === 'function') {
    await page.goto(url);
    return;
  }
  throw new CommandExecutionError('Browser page has neither newTab nor goto');
}

async function pollJson(
  page: PageLike,
  js: string,
  deadline: number,
  done: (parsed: JsonState) => boolean,
): Promise<JsonState> {
  let last: JsonState = { status: 'loading' };
  while (Date.now() < deadline) {
    const raw = await page.evaluate(js);
    try {
      const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
      if (parsed && typeof parsed === 'object') last = parsed as JsonState;
    } catch {
      last = { status: 'loading' };
    }
    if (done(last)) return last;
    await page.wait(0.5);
  }
  return last;
}

const PROPERTY_STATUS_JS = `(() => {
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
    return /Inspect any URL|Inspect|检查任何网址|检查网址|网址检查/i.test(combined);
  });
  if (input) {
    return JSON.stringify({ status: 'ready', url });
  }

  return JSON.stringify({ status: 'loading', url });
})()`;

const SUBMIT_URL_JS = (targetUrl: string) => `(() => {
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
    return /Inspect any URL|Inspect|检查任何网址|检查网址|网址检查/i.test(combined);
  });
  if (!input) return JSON.stringify({ ok: false, reason: 'no-input' });

  setValue(input, targetUrl);
  input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', which: 13, keyCode: 13, bubbles: true }));
  input.dispatchEvent(new KeyboardEvent('keypress', { key: 'Enter', code: 'Enter', which: 13, keyCode: 13, bubbles: true }));
  input.dispatchEvent(new KeyboardEvent('keyup', { key: 'Enter', code: 'Enter', which: 13, keyCode: 13, bubbles: true }));
  if (typeof input.form?.requestSubmit === 'function') input.form.requestSubmit();
  return JSON.stringify({ ok: true });
})()`;

const INSPECTION_STATUS_JS = `(() => {
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
    '网址已收录到 Google',
    '网址已在 Google 上',
    '网址已收录，但有问题',
    '网址不在 Google 上',
    '网址属于备用版本',
  ];
  const verdict = verdicts.find((item) => text.includes(item)) || null;

  const hasTestLive = /Test live URL|测试实际网址|测试正式版网址/i.test(text);
  const hasRequest = /Request indexing|请求编入索引|要求建立索引|要求建立索引作业/i.test(text);
  const hasInspectionSections =
    /Page indexing|Page availability|Google Index|Google-selected canonical|网页索引|网页可用性|Google 索引|Google 选定的规范网址/i.test(text);
  const temporarilyUnavailable =
    /currently unavailable|temporarily unavailable|try again later|目前无法使用|暂时无法使用|请稍后重试/i.test(text);
  const pageProblem =
    /Page indexing|Page availability|网页索引|网页可用性/i.test(text) &&
    /Crawl allowed\\?.{0,20}No|Indexing allowed\\?.{0,20}No|Page fetch.{0,20}(Failed|Error|Redirect error|Soft 404|Server error)|允许抓取.{0,20}否|允许建立索引.{0,20}否|网页擷取.{0,20}(失敗|错误)|抓取.{0,20}(失敗|错误)/is.test(text);

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

const CLICK_TEST_LIVE_JS = `(() => {
  const btn = [...document.querySelectorAll('button, [role=button]')].find((el) =>
    /Test live URL|测试实际网址|测试正式版网址/i.test((el.textContent || '').replace(/\\s+/g, ' ').trim()),
  );
  if (!btn) return JSON.stringify({ ok: false, reason: 'no-test-live' });
  btn.click();
  return JSON.stringify({ ok: true });
})()`;

const LIVE_TEST_STATUS_JS = `(() => {
  const text = document.body?.innerText || '';
  const requestBtn = [...document.querySelectorAll('button, [role=button]')].find((el) =>
    /Request indexing|请求编入索引|要求建立索引/i.test((el.textContent || '').replace(/\\s+/g, ' ').trim()),
  );
  const rerunBtn = [...document.querySelectorAll('button, [role=button]')].find((el) =>
    /Test live URL|Live test|View tested page|测试实际网址|查看已测试网页/i.test((el.textContent || '').replace(/\\s+/g, ' ').trim()),
  );
  const unavailable = /currently unavailable|temporarily unavailable|try again later|目前无法使用|暂时无法使用|请稍后重试/i.test(text);
  if (requestBtn) return JSON.stringify({ status: 'ready' });
  if (unavailable) return JSON.stringify({ status: 'temporary_unavailable' });
  if (/Testing live URL|Live URL test|测试实际网址|即时网址测试/i.test(text) || rerunBtn) {
    return JSON.stringify({ status: 'loading' });
  }
  return JSON.stringify({ status: 'loading' });
})()`;

const CLICK_REQUEST_JS = `(() => {
  const btn = [...document.querySelectorAll('button, [role=button]')].find((el) =>
    /Request indexing|请求编入索引|要求建立索引/i.test((el.textContent || '').replace(/\\s+/g, ' ').trim()),
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

const REQUEST_STATUS_JS = `(() => {
  const text = document.body?.innerText || '';
  const normalized = text.replace(/\\s+/g, ' ');

  if (/Indexing requested|Indexing request submitted|Submitted to indexing queue|added to a priority crawl queue|已要求建立索引|已提交索引要求|已提交建立索引要求|已加入优先检索队列/i.test(normalized)) {
    return JSON.stringify({ status: 'submitted', message: 'Indexing requested' });
  }
  if (/currently unavailable|temporarily unavailable|try again later|目前无法使用|暂时无法使用|请稍后重试/i.test(normalized)) {
    return JSON.stringify({ status: 'temporarily_unavailable', message: 'Request indexing unavailable' });
  }
  if (/Quota exceeded|超出配额|超过配额/i.test(normalized)) {
    return JSON.stringify({ status: 'quota', message: 'Quota exceeded' });
  }

  const requestBtn = [...document.querySelectorAll('button, [role=button]')].find((el) =>
    /Request indexing|请求编入索引|要求建立索引/i.test((el.textContent || '').replace(/\\s+/g, ' ').trim()),
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
  site: 'gsc',
  name: 'request-indexing',
  access: 'write',
  description: 'Request Google indexing for a URL in Search Console',
  domain: 'search.google.com',
  strategy: Strategy.UI,
  browser: true,
  example: 'opencli gsc request-indexing https://example.com/page --property sc-domain:example.com',
  args: [
    {
      name: 'url',
      type: 'string',
      required: true,
      positional: true,
      help: 'Target page URL to inspect and request indexing for',
    },
    {
      name: 'property',
      type: 'string',
      required: false,
      help: 'GSC property, e.g. sc-domain:example.com or https://www.example.com/',
    },
  ],
  columns: ['url', 'property', 'status', 'message'],
  func: async (page, kwargs) => {
    const targetUrl = normalizeTargetUrl(kwargs.url);
    const property = normalizeProperty(kwargs.property, targetUrl);
    const propertyUrl = buildPropertyUrl(property);

    await openUrl(page, propertyUrl);

    const loadDeadline = Date.now() + LOAD_TIMEOUT_SEC * 1000;
    const propertyState = await pollJson(page, PROPERTY_STATUS_JS, loadDeadline, (p) =>
      ['ready', 'auth', 'challenge', 'no_access'].includes(String(p.status)),
    );

    if (propertyState.status === 'auth') {
      throw new AuthRequiredError(
        'search.google.com',
        'Not logged in to Google Search Console — open Chrome and sign in first',
      );
    }
    if (propertyState.status === 'challenge') {
      throw new CommandExecutionError('Google requires additional verification before Search Console can load.');
    }
    if (propertyState.status === 'no_access') {
      throw new CommandExecutionError(
        `No access to GSC property "${property}". Pass --property explicitly or use an authorized Google account.`,
      );
    }
    if (propertyState.status !== 'ready') {
      throw new TimeoutError(`gsc request-indexing load property (${property})`, LOAD_TIMEOUT_SEC);
    }

    const submitRaw = await page.evaluate(SUBMIT_URL_JS(targetUrl));
    const submit = typeof submitRaw === 'string' ? JSON.parse(submitRaw) : submitRaw;
    if (!submit?.ok) {
      throw new CommandExecutionError(
        `Failed to enter URL into Search Console inspection bar: ${submit?.reason || 'unknown error'}`,
      );
    }

    const inspectionDeadline = Date.now() + INSPECTION_TIMEOUT_SEC * 1000;
    let inspectionState = await pollJson(page, INSPECTION_STATUS_JS, inspectionDeadline, (p) =>
      ['ready', 'auth', 'challenge', 'temporary_unavailable'].includes(String(p.status)),
    );

    if (inspectionState.status === 'auth') {
      throw new AuthRequiredError(
        'search.google.com',
        'Google session expired during URL inspection — sign in again and retry',
      );
    }
    if (inspectionState.status === 'challenge') {
      throw new CommandExecutionError('Google asked for verification during URL inspection.');
    }
    if (inspectionState.status === 'temporary_unavailable') {
      return [
        {
          url: targetUrl,
          property,
          status: 'temporarily_unavailable',
          message: 'Search Console request indexing is temporarily unavailable',
        },
      ];
    }
    if (inspectionState.status !== 'ready') {
      throw new TimeoutError(`gsc request-indexing inspect (${targetUrl})`, INSPECTION_TIMEOUT_SEC);
    }

    if (inspectionState.pageProblem === true) {
      return [
        {
          url: targetUrl,
          property,
          status: 'page_not_requestable',
          message: 'Live/page checks suggest Google cannot crawl or index this URL yet',
        },
      ];
    }

    if (inspectionState.hasRequest !== true && inspectionState.hasTestLive === true) {
      const liveRaw = await page.evaluate(CLICK_TEST_LIVE_JS);
      const live = typeof liveRaw === 'string' ? JSON.parse(liveRaw) : liveRaw;
      if (!live?.ok) {
        throw new CommandExecutionError(
          `Failed to start "Test live URL": ${live?.reason || 'unknown error'}`,
        );
      }

      const liveDeadline = Date.now() + LIVE_TEST_TIMEOUT_SEC * 1000;
      const liveState = await pollJson(page, LIVE_TEST_STATUS_JS, liveDeadline, (p) =>
        ['ready', 'temporary_unavailable'].includes(String(p.status)),
      );
      if (liveState.status === 'temporary_unavailable') {
        return [
          {
            url: targetUrl,
            property,
            status: 'temporarily_unavailable',
            message: 'Search Console live test/request indexing is temporarily unavailable',
          },
        ];
      }
      if (liveState.status !== 'ready') {
        throw new TimeoutError(`gsc request-indexing live test (${targetUrl})`, LIVE_TEST_TIMEOUT_SEC);
      }

      inspectionState = { ...inspectionState, hasRequest: true };
    }

    const requestRaw = await page.evaluate(CLICK_REQUEST_JS);
    const request = typeof requestRaw === 'string' ? JSON.parse(requestRaw) : requestRaw;
    if (!request?.ok) {
      const reason = String(request?.reason || 'unknown');
      const status =
        reason === 'request-disabled' ? 'quota_or_already_requested' : 'request_button_missing';
      return [
        {
          url: targetUrl,
          property,
          status,
          message: reason,
        },
      ];
    }

    const requestDeadline = Date.now() + REQUEST_TIMEOUT_SEC * 1000;
    const requestState = await pollJson(page, REQUEST_STATUS_JS, requestDeadline, (p) =>
      [
        'submitted',
        'submitted_or_already_requested',
        'quota',
        'quota_or_already_requested',
        'temporarily_unavailable',
      ].includes(String(p.status)),
    );

    const status = String(requestState.status || 'pending');
    const message = String(requestState.message || '');
    if (status === 'pending') {
      throw new TimeoutError(`gsc request-indexing request (${targetUrl})`, REQUEST_TIMEOUT_SEC);
    }

    return [
      {
        url: targetUrl,
        property,
        status,
        message,
      },
    ];
  },
});

/**
 * namecheap set-nameserver — set Custom DNS nameservers for a domain.
 *
 * Strategy: UI
 * Contract: visible-ui
 * Evidence:
 *   - UI: https://ap.www.namecheap.com/domains/domaincontrolpanel/{domain}/domain
 *   - Nameservers row (.nameservers-row): select2 dropdown → option "Custom DNS" (value 3);
 *     inputs #record0 / #record1 (placeholder "Nameserver N", ng-model="record.NS");
 *     "+ ADD NAMESERVER" → a.simple-btn.icon-add; Save → a.save[ng-click=SaveDomainNameservers()]
 *   - Underlying XHR (not used as COOKIE_API — CSRF/Angular payload brittle):
 *     POST /Domains/DomainDetails/SetNameServers → { Error: false, Msg: "Successfully Saved" }
 *   - Success UI: notification "Successfully Saved" / "DNS server update may take…";
 *     save button hides; Custom DNS stays selected with filled inputs.
 * Auth: logged-in Namecheap Chrome session (ap.www.namecheap.com)
 * Browser: true
 */
import {
  AuthRequiredError,
  CommandExecutionError,
  TimeoutError,
} from '@jackwener/opencli/errors';
import { cli, Strategy } from '@jackwener/opencli/registry';
import {
  buildDomainPanelUrl,
  normalizeDomain,
  normalizeNameservers,
  toRows,
} from './lib.js';

const LOAD_TIMEOUT_SEC = 90;
const SAVE_TIMEOUT_SEC = 30;

async function openUrl(
  page: {
    newTab?: (url?: string) => Promise<string | undefined>;
    selectTab?: (id: string) => Promise<unknown>;
    goto?: (url: string) => Promise<unknown>;
  },
  url: string,
): Promise<void> {
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

const PAGE_STATUS_JS = `(() => {
  const text = document.body?.innerText || '';
  const url = location.href || '';
  if (/\\/login|sign\\s*in/i.test(url) || (/sign in|log in|username/i.test(text) && /password/i.test(text) && !/NAMESERVERS/i.test(text))) {
    return JSON.stringify({ status: 'auth' });
  }
  if (document.querySelector('.nameservers-row') || /NAMESERVERS/i.test(text)) {
    const chosen = (document.querySelector('.nameservers-row .select2-chosen')?.textContent || '').trim();
    return JSON.stringify({ status: 'ready', chosen });
  }
  if (/just a moment|checking your browser|access denied|too many requests/i.test(text)) {
    return JSON.stringify({ status: 'challenge' });
  }
  return JSON.stringify({ status: 'loading' });
})()`;

const APPLY_NS_JS = (nameservers: string[]) => `(() => {
  const nameservers = ${JSON.stringify(nameservers)};

  function setInput(el, value) {
    el.focus();
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
    if (setter) setter.call(el, value);
    else el.value = value;
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    el.dispatchEvent(new Event('blur', { bubbles: true }));
  }

  function nsInputs() {
    return [...document.querySelectorAll('input[placeholder^="Nameserver"]')];
  }

  const row = document.querySelector('.nameservers-row');
  if (!row) return JSON.stringify({ ok: false, reason: 'no-nameservers-row' });

  const chosen = (row.querySelector('.select2-chosen')?.textContent || '').trim();
  if (!/^Custom DNS$/i.test(chosen)) {
    const choice = row.querySelector('.select2-choice');
    if (!choice) return JSON.stringify({ ok: false, reason: 'no-select2' });
    choice.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    choice.click();
    const item = [...document.querySelectorAll('.select2-result-selectable')]
      .find((li) => /^Custom DNS$/i.test((li.textContent || '').trim()) && !li.classList.contains('ng-hide'));
    if (!item) return JSON.stringify({ ok: false, reason: 'no-custom-dns-option', chosen });
    item.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
    item.click();
  }

  // Ensure enough input slots
  let guard = 0;
  while (nsInputs().length < nameservers.length && guard < 20) {
    const add = row.querySelector('a.simple-btn.icon-add, a[ng-click*="addMoreNameServers"]');
    if (!add) break;
    add.click();
    guard += 1;
  }

  const inputs = nsInputs();
  if (inputs.length < nameservers.length) {
    return JSON.stringify({
      ok: false,
      reason: 'not-enough-inputs',
      have: inputs.length,
      need: nameservers.length,
    });
  }

  for (let i = 0; i < nameservers.length; i++) {
    setInput(inputs[i], nameservers[i]);
  }
  // Clear any extra slots beyond what we set
  for (let i = nameservers.length; i < inputs.length; i++) {
    setInput(inputs[i], '');
  }

  const values = nsInputs().slice(0, nameservers.length).map((el) => el.value.trim().toLowerCase());
  const mismatch = nameservers.some((ns, i) => values[i] !== ns);
  if (mismatch) {
    return JSON.stringify({ ok: false, reason: 'fill-mismatch', values, nameservers });
  }

  const save = row.querySelector('a.save');
  if (!save) return JSON.stringify({ ok: false, reason: 'no-save' });
  // Save may stay hidden if Angular sees no dirty change — force click anyway when visible or after fill
  if (save.offsetParent === null && save.parentElement?.classList.contains('ng-hide')) {
    // Try revealing by re-firing change on first input
    const first = nsInputs()[0];
    if (first) {
      first.dispatchEvent(new Event('input', { bubbles: true }));
      first.dispatchEvent(new Event('change', { bubbles: true }));
    }
  }
  const saveNow = row.querySelector('a.save');
  if (!saveNow) return JSON.stringify({ ok: false, reason: 'no-save-after-fill' });
  saveNow.click();
  return JSON.stringify({
    ok: true,
    chosen: (row.querySelector('.select2-chosen')?.textContent || '').trim(),
    values,
  });
})()`;

const SAVE_STATUS_JS = (nameservers: string[]) => `(() => {
  const nameservers = ${JSON.stringify(nameservers)};
  const text = document.body?.innerText || '';
  const row = document.querySelector('.nameservers-row');
  const chosen = (row?.querySelector('.select2-chosen')?.textContent || '').trim();
  const values = [...document.querySelectorAll('input[placeholder^="Nameserver"]')]
    .map((el) => (el.value || '').trim().toLowerCase())
    .filter(Boolean);
  const saveHidden = !row?.querySelector('a.save')?.offsetParent;
  const notif = [...document.querySelectorAll('.notificationContainer, .magicmessages, .toast, [class*=notif]')]
    .map((el) => (el.textContent || '').replace(/\\s+/g, ' ').trim())
    .filter(Boolean)
    .join(' | ');

  if (/successfully saved/i.test(text) || /successfully saved/i.test(notif)) {
    return JSON.stringify({ status: 'saved', message: 'Successfully Saved', chosen, values });
  }
  if (/dns server update may take/i.test(text) || /dns server update may take/i.test(notif)) {
    return JSON.stringify({
      status: 'saved',
      message: 'DNS server update may take up to 48 hours to take effect.',
      chosen,
      values,
    });
  }
  if (/error|failed|invalid nameserver|unable to/i.test(notif) && !/successfully/i.test(notif)) {
    return JSON.stringify({ status: 'error', message: notif.slice(0, 240), chosen, values });
  }
  // Soft success: Custom DNS + matching values + save controls hidden
  const match =
    /^Custom DNS$/i.test(chosen) &&
    nameservers.every((ns) => values.includes(ns)) &&
    nameservers.length <= values.length &&
    saveHidden;
  if (match) {
    return JSON.stringify({ status: 'saved', message: 'Successfully Saved', chosen, values });
  }
  return JSON.stringify({ status: 'pending', chosen, values, saveHidden, notif: notif.slice(0, 120) });
})()`;

async function pollJson(
  page: { evaluate: (js: string) => Promise<unknown>; wait: (sec: number) => Promise<unknown> },
  js: string,
  deadline: number,
  done: (parsed: Record<string, unknown>) => boolean,
): Promise<Record<string, unknown>> {
  let last: Record<string, unknown> = { status: 'loading' };
  while (Date.now() < deadline) {
    const raw = await page.evaluate(js);
    try {
      const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
      if (parsed && typeof parsed === 'object') last = parsed as Record<string, unknown>;
    } catch {
      last = { status: 'loading' };
    }
    if (done(last)) return last;
    await page.wait(0.4);
  }
  return last;
}

cli({
  site: 'namecheap',
  name: 'set-nameserver',
  access: 'write',
  description: 'Set Custom DNS nameservers for a Namecheap domain',
  domain: 'ap.www.namecheap.com',
  strategy: Strategy.UI,
  browser: true,
  example: 'opencli namecheap set-nameserver 73-9.org --ns ns1.cloudflare.com,ns2.cloudflare.com',
  args: [
    {
      name: 'domain',
      type: 'string',
      required: true,
      positional: true,
      help: 'Domain name (e.g. 73-9.org)',
    },
    {
      name: 'ns',
      type: 'string',
      required: true,
      help: 'Comma-separated nameservers (min 2), e.g. ns1.cloudflare.com,ns2.cloudflare.com',
    },
  ],
  columns: ['domain', 'nameserver', 'index', 'status', 'message'],
  func: async (page, kwargs) => {
    const domain = normalizeDomain(kwargs.domain);
    const nameservers = normalizeNameservers(kwargs.ns);
    const url = buildDomainPanelUrl(domain);
    const loadDeadline = Date.now() + LOAD_TIMEOUT_SEC * 1000;

    await openUrl(page, url);

    const pageState = await pollJson(page, PAGE_STATUS_JS, loadDeadline, (p) =>
      ['ready', 'auth', 'challenge'].includes(String(p.status)),
    );

    if (pageState.status === 'auth') {
      throw new AuthRequiredError(
        'ap.www.namecheap.com',
        'Not logged in to Namecheap — open Chrome and sign in first',
      );
    }
    if (pageState.status === 'challenge') {
      throw new CommandExecutionError('Namecheap showed a challenge/rate-limit wall.');
    }
    if (pageState.status !== 'ready') {
      throw new TimeoutError(`namecheap set-nameserver (${domain}) load`, LOAD_TIMEOUT_SEC);
    }

    // Select Custom DNS may need a tick before inputs exist
    let applyRaw = await page.evaluate(APPLY_NS_JS(nameservers));
    let apply =
      typeof applyRaw === 'string' ? JSON.parse(applyRaw) : applyRaw;

    // If we only opened the dropdown / switched mode, retry fill+save once
    if (!apply?.ok && (apply?.reason === 'not-enough-inputs' || apply?.reason === 'no-save')) {
      await page.wait(0.6);
      applyRaw = await page.evaluate(APPLY_NS_JS(nameservers));
      apply = typeof applyRaw === 'string' ? JSON.parse(applyRaw) : applyRaw;
    }

    // First call may only switch to Custom DNS — inputs appear after digest
    if (apply?.ok !== true) {
      await page.wait(0.8);
      applyRaw = await page.evaluate(APPLY_NS_JS(nameservers));
      apply = typeof applyRaw === 'string' ? JSON.parse(applyRaw) : applyRaw;
    }

    if (apply?.ok !== true) {
      throw new CommandExecutionError(
        `Failed to apply nameservers for ${domain}: ${apply?.reason || 'unknown'}`,
      );
    }

    const saveDeadline = Date.now() + SAVE_TIMEOUT_SEC * 1000;
    const saveState = await pollJson(page, SAVE_STATUS_JS(nameservers), saveDeadline, (p) =>
      ['saved', 'error'].includes(String(p.status)),
    );

    if (saveState.status === 'error') {
      throw new CommandExecutionError(
        `Namecheap rejected nameserver update for ${domain}: ${saveState.message || 'unknown error'}`,
      );
    }
    if (saveState.status !== 'saved') {
      throw new TimeoutError(`namecheap set-nameserver (${domain}) save`, SAVE_TIMEOUT_SEC);
    }

    const message = String(saveState.message || 'Successfully Saved');
    return toRows(domain, nameservers, message);
  },
});

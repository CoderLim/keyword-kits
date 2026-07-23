// src/set-nameserver.ts
import {
  AuthRequiredError,
  CommandExecutionError,
  TimeoutError
} from "@jackwener/opencli/errors";
import { cli, Strategy } from "@jackwener/opencli/registry";

// src/lib.ts
import { ArgumentError } from "@jackwener/opencli/errors";
var MIN_NS = 2;
var MAX_NS = 12;
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
function normalizeNameservers(raw) {
  const input = String(raw ?? "").trim();
  if (!input) throw new ArgumentError("--ns is required (comma-separated, min 2)");
  const parts = input.split(/[,;\s]+/).map((s) => s.trim().toLowerCase().replace(/\.$/, "")).filter(Boolean);
  if (parts.length < MIN_NS) {
    throw new ArgumentError(`need at least ${MIN_NS} nameservers, got ${parts.length}`);
  }
  if (parts.length > MAX_NS) {
    throw new ArgumentError(`at most ${MAX_NS} nameservers allowed, got ${parts.length}`);
  }
  const seen = /* @__PURE__ */ new Set();
  const out = [];
  for (const ns of parts) {
    if (!/^[a-z0-9.-]+$/.test(ns) || !ns.includes(".")) {
      throw new ArgumentError(`invalid nameserver: ${ns}`);
    }
    if (seen.has(ns)) {
      throw new ArgumentError(`duplicate nameserver: ${ns}`);
    }
    seen.add(ns);
    out.push(ns);
  }
  return out;
}
function buildDomainPanelUrl(domain) {
  return `https://ap.www.namecheap.com/domains/domaincontrolpanel/${encodeURIComponent(domain)}/domain`;
}
function toRows(domain, nameservers, message) {
  return nameservers.map((nameserver, i) => ({
    domain,
    nameserver,
    index: i + 1,
    status: "saved",
    message
  }));
}

// src/set-nameserver.ts
var LOAD_TIMEOUT_SEC = 90;
var SAVE_TIMEOUT_SEC = 30;
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
var PAGE_STATUS_JS = `(() => {
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
var APPLY_NS_JS = (nameservers) => `(() => {
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
  // Save may stay hidden if Angular sees no dirty change \u2014 force click anyway when visible or after fill
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
var SAVE_STATUS_JS = (nameservers) => `(() => {
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
    await page.wait(0.4);
  }
  return last;
}
cli({
  site: "namecheap",
  name: "set-nameserver",
  access: "write",
  description: "Set Custom DNS nameservers for a Namecheap domain",
  domain: "ap.www.namecheap.com",
  strategy: Strategy.UI,
  browser: true,
  example: "opencli namecheap set-nameserver 73-9.org --ns ns1.cloudflare.com,ns2.cloudflare.com",
  args: [
    {
      name: "domain",
      type: "string",
      required: true,
      positional: true,
      help: "Domain name (e.g. 73-9.org)"
    },
    {
      name: "ns",
      type: "string",
      required: true,
      help: "Comma-separated nameservers (min 2), e.g. ns1.cloudflare.com,ns2.cloudflare.com"
    }
  ],
  columns: ["domain", "nameserver", "index", "status", "message"],
  func: async (page, kwargs) => {
    const domain = normalizeDomain(kwargs.domain);
    const nameservers = normalizeNameservers(kwargs.ns);
    const url = buildDomainPanelUrl(domain);
    const loadDeadline = Date.now() + LOAD_TIMEOUT_SEC * 1e3;
    await openUrl(page, url);
    const pageState = await pollJson(
      page,
      PAGE_STATUS_JS,
      loadDeadline,
      (p) => ["ready", "auth", "challenge"].includes(String(p.status))
    );
    if (pageState.status === "auth") {
      throw new AuthRequiredError(
        "ap.www.namecheap.com",
        "Not logged in to Namecheap \u2014 open Chrome and sign in first"
      );
    }
    if (pageState.status === "challenge") {
      throw new CommandExecutionError("Namecheap showed a challenge/rate-limit wall.");
    }
    if (pageState.status !== "ready") {
      throw new TimeoutError(`namecheap set-nameserver (${domain}) load`, LOAD_TIMEOUT_SEC);
    }
    let applyRaw = await page.evaluate(APPLY_NS_JS(nameservers));
    let apply = typeof applyRaw === "string" ? JSON.parse(applyRaw) : applyRaw;
    if (!apply?.ok && (apply?.reason === "not-enough-inputs" || apply?.reason === "no-save")) {
      await page.wait(0.6);
      applyRaw = await page.evaluate(APPLY_NS_JS(nameservers));
      apply = typeof applyRaw === "string" ? JSON.parse(applyRaw) : applyRaw;
    }
    if (apply?.ok !== true) {
      await page.wait(0.8);
      applyRaw = await page.evaluate(APPLY_NS_JS(nameservers));
      apply = typeof applyRaw === "string" ? JSON.parse(applyRaw) : applyRaw;
    }
    if (apply?.ok !== true) {
      throw new CommandExecutionError(
        `Failed to apply nameservers for ${domain}: ${apply?.reason || "unknown"}`
      );
    }
    const saveDeadline = Date.now() + SAVE_TIMEOUT_SEC * 1e3;
    const saveState = await pollJson(
      page,
      SAVE_STATUS_JS(nameservers),
      saveDeadline,
      (p) => ["saved", "error"].includes(String(p.status))
    );
    if (saveState.status === "error") {
      throw new CommandExecutionError(
        `Namecheap rejected nameserver update for ${domain}: ${saveState.message || "unknown error"}`
      );
    }
    if (saveState.status !== "saved") {
      throw new TimeoutError(`namecheap set-nameserver (${domain}) save`, SAVE_TIMEOUT_SEC);
    }
    const message = String(saveState.message || "Successfully Saved");
    return toRows(domain, nameservers, message);
  }
});
